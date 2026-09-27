-- Insert orders only from a trusted order/stock reservation adapter, never browser input.
CREATE TABLE IF NOT EXISTS smartcommerce_payment_orders (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, checkout_quote_id TEXT NOT NULL UNIQUE,
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991), currency TEXT NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 provider_mode TEXT NOT NULL DEFAULT 'test' CHECK(provider_mode IN ('test','live')),
 fulfillment_reference TEXT NOT NULL CHECK(length(fulfillment_reference)>0), reserved_until TIMESTAMPTZ NOT NULL,
 shipping_quote_id UUID REFERENCES courier_shipping_quotes(id),
 status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','creating','awaiting_payment','paid','needs_review')),
 session_id TEXT UNIQUE, checkout_url TEXT, dispatch_result JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS smartcommerce_payment_events (
 id TEXT PRIMARY KEY, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','processed','needs_review')),
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ
);
CREATE OR REPLACE FUNCTION smartcommerce_payment_claim(customer TEXT, quote TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE o smartcommerce_payment_orders; h courier_shipping_holds;
BEGIN
 SELECT * INTO o FROM smartcommerce_payment_orders WHERE customer_id=customer AND checkout_quote_id=quote FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 IF o.status<>'ready' THEN RETURN jsonb_build_object('claimed',false,'result',jsonb_build_object('status',o.status,'url',CASE WHEN o.status='awaiting_payment' AND o.reserved_until>now() THEN o.checkout_url ELSE NULL END)); END IF;
 IF o.reserved_until<=now() THEN RAISE EXCEPTION 'PAYMENT_RESERVATION_EXPIRED'; END IF;
 IF o.shipping_quote_id IS NOT NULL THEN
   SELECT * INTO h FROM courier_shipping_holds WHERE quote_id=o.shipping_quote_id FOR UPDATE;
   IF h.id IS NULL OR h.status<>'held' OR h.expires_at<=now() THEN RAISE EXCEPTION 'PAYMENT_RESERVATION_EXPIRED'; END IF;
   IF NOT EXISTS(SELECT 1 FROM courier_shipping_quotes q JOIN courier_shipping_contexts c ON c.id=q.context_id WHERE q.id=o.shipping_quote_id AND c.customer_id=customer AND c.checkout_quote_id=quote AND q.currency=o.currency AND q.total_minor=o.amount_minor) THEN RAISE EXCEPTION 'PAYMENT_ORDER_MISMATCH'; END IF;
 END IF;
 UPDATE smartcommerce_payment_orders SET status='creating' WHERE id=o.id;
 RETURN jsonb_build_object('claimed',true,'order',jsonb_build_object('id',o.id,'amountMinor',o.amount_minor,'currency',o.currency));
END $$;
CREATE OR REPLACE FUNCTION smartcommerce_payment_event(event JSONB) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE prior JSONB;
BEGIN
 INSERT INTO smartcommerce_payment_events(id,payload) VALUES(event->>'id',event) ON CONFLICT DO NOTHING;
 SELECT payload INTO prior FROM smartcommerce_payment_events WHERE id=event->>'id';
 IF prior IS DISTINCT FROM event THEN RAISE EXCEPTION 'PAYMENT_EVENT_CONFLICT'; END IF;
END $$;
CREATE OR REPLACE FUNCTION smartcommerce_payment_settle(order_id TEXT, event JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE o smartcommerce_payment_orders; dispatch JSONB;
BEGIN
 PERFORM smartcommerce_payment_event(event);
 SELECT * INTO o FROM smartcommerce_payment_orders WHERE id=order_id FOR UPDATE;
 IF o.id IS NULL OR o.session_id IS DISTINCT FROM event->'data'->>'id' THEN RAISE EXCEPTION 'PAYMENT_ORDER_MISMATCH'; END IF;
 IF o.status='paid' THEN RETURN jsonb_build_object('status','paid','dispatch',o.dispatch_result); END IF;
 IF o.status NOT IN ('awaiting_payment','needs_review') THEN RAISE EXCEPTION 'PAYMENT_ORDER_MISMATCH'; END IF;
 IF o.reserved_until<=now() THEN
   dispatch:=jsonb_build_object('status','needs_review','reason','fulfillment_reservation_expired');
 ELSIF o.shipping_quote_id IS NOT NULL THEN
   dispatch:=courier_dispatch_paid(jsonb_build_object('provider','handypay:'||o.provider_mode,'eventId',event->>'id','paymentId',o.session_id,'orderId',o.id,'orderNumber',o.id,'customerId',o.customer_id,'shippingQuoteId',o.shipping_quote_id,'currency',o.currency,'amountMinor',o.amount_minor));
 END IF;
 UPDATE smartcommerce_payment_orders SET status='paid',dispatch_result=dispatch WHERE id=o.id;
 UPDATE smartcommerce_payment_events SET status='processed',processed_at=now() WHERE id=event->>'id';
 RETURN jsonb_build_object('status','paid','dispatch',dispatch);
END $$;
REVOKE ALL ON FUNCTION smartcommerce_payment_claim(TEXT,TEXT),smartcommerce_payment_event(JSONB),smartcommerce_payment_settle(TEXT,JSONB) FROM PUBLIC;
