-- Trusted checkout snapshots and verified settlement adapters only. No public payment callback.
CREATE TABLE IF NOT EXISTS courier_shipping_contexts (
 id UUID PRIMARY KEY, checkout_quote_id TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL,
 cart_fingerprint TEXT NOT NULL, currency TEXT NOT NULL CHECK(length(currency)=3),
 order_total_minor BIGINT NOT NULL CHECK(order_total_minor>=0), branch_id TEXT NOT NULL,
 items JSONB NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items)>0),
 destination JSONB NOT NULL, facts JSONB NOT NULL, source_reference TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS courier_shipping_quotes (
 id UUID PRIMARY KEY, context_id UUID NOT NULL REFERENCES courier_shipping_contexts(id),
 service_id UUID NOT NULL REFERENCES courier_services(id), service_version INTEGER NOT NULL,
 service_date DATE NOT NULL, delivery_minor BIGINT NOT NULL CHECK(delivery_minor>=0),
 tax_minor BIGINT NOT NULL CHECK(tax_minor>=0), total_minor BIGINT NOT NULL CHECK(total_minor>=0),
 currency TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, service_snapshot JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS courier_shipping_holds (
 id UUID PRIMARY KEY, quote_id UUID NOT NULL UNIQUE REFERENCES courier_shipping_quotes(id),
 context_id UUID NOT NULL UNIQUE REFERENCES courier_shipping_contexts(id),
 service_id UUID NOT NULL REFERENCES courier_services(id), service_date DATE NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('held','confirmed','released')), expires_at TIMESTAMPTZ NOT NULL,
 receipt JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS courier_hold_capacity ON courier_shipping_holds(service_id,service_date,status);
CREATE TABLE IF NOT EXISTS courier_dispatch_jobs (
 id UUID PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, quote_id UUID NOT NULL UNIQUE REFERENCES courier_shipping_quotes(id),
 organization_id UUID NOT NULL REFERENCES courier_organizations(id),
 settlement JSONB NOT NULL, status TEXT NOT NULL CHECK(status IN ('awaiting_driver','assigned','needs_review')),
 reason TEXT, version INTEGER NOT NULL DEFAULT 1, driver_id UUID REFERENCES courier_drivers(id),
 pickup_id UUID REFERENCES courier_pickups(id), receipt JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_dispatch_settlements (
 provider TEXT NOT NULL, payment_id TEXT NOT NULL, payload JSONB NOT NULL, receipt JSONB NOT NULL,
 PRIMARY KEY(provider,payment_id)
);
CREATE TABLE IF NOT EXISTS courier_dispatch_conflicts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), provider TEXT NOT NULL, payment_id TEXT NOT NULL,
 payload JSONB NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(provider,payment_id,payload)
);

CREATE OR REPLACE FUNCTION courier_shipping_reserve(customer TEXT, quote UUID, request UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE q courier_shipping_quotes; c courier_shipping_contexts; s courier_services; h courier_shipping_holds; result JSONB;
BEGIN
 SELECT * INTO q FROM courier_shipping_quotes WHERE id=quote;
 SELECT * INTO c FROM courier_shipping_contexts WHERE id=q.context_id;
 IF c.id IS NULL OR c.customer_id IS DISTINCT FROM customer OR request IS NULL THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('shipping-context:'||c.id,0));
 SELECT * INTO h FROM courier_shipping_holds WHERE context_id=c.id;
 IF FOUND THEN
   IF h.quote_id<>quote THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
   IF h.status='confirmed' OR (h.status='held' AND h.expires_at>now()) THEN RETURN h.receipt; END IF;
   RAISE EXCEPTION 'COURIER_RESERVATION_EXPIRED';
 END IF;
 SELECT * INTO s FROM courier_services WHERE id=q.service_id FOR UPDATE;
 PERFORM 1 FROM courier_organizations WHERE id=s.organization_id FOR SHARE;
 PERFORM 1 FROM courier_identity_documents WHERE account_id=(SELECT owner_customer_id::text FROM courier_organizations WHERE id=s.organization_id) ORDER BY id FOR SHARE;
 IF q.expires_at<=now() OR c.expires_at<=now() THEN RAISE EXCEPTION 'COURIER_QUOTE_EXPIRED'; END IF;
 IF s.version<>q.service_version OR NOT EXISTS(SELECT 1 FROM courier_available_services WHERE id=s.id) THEN RAISE EXCEPTION 'COURIER_UNAVAILABLE'; END IF;
 IF (SELECT count(*) FROM courier_shipping_holds WHERE service_id=s.id AND service_date=q.service_date AND (status='confirmed' OR (status='held' AND expires_at>now())))>=COALESCE((s.input->>'dailyCapacity')::int,0) THEN RAISE EXCEPTION 'COURIER_CAPACITY_FULL'; END IF;
 result:=jsonb_build_object('id',gen_random_uuid(),'status','held','quoteId',quote,'expiresAt',least(q.expires_at,c.expires_at));
 INSERT INTO courier_shipping_holds VALUES((result->>'id')::uuid,quote,c.id,s.id,q.service_date,'held',least(q.expires_at,c.expires_at),result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION courier_dispatch_paid(payment JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE prior courier_dispatch_settlements; q courier_shipping_quotes; c courier_shipping_contexts; h courier_shipping_holds;
 s courier_services; payload JSONB:=payment-'eventId'; result JSONB; reason TEXT; job UUID:=gen_random_uuid();
BEGIN
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['provider','paymentId','orderId','orderNumber','customerId','shippingQuoteId','currency','eventId']) k WHERE nullif(payment->>k,'') IS NULL)
 OR jsonb_typeof(payment->'amountMinor') IS DISTINCT FROM 'number' OR (payment->>'amountMinor') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'COURIER_INVALID_INPUT'; END IF;
 -- One lock order for all settlements, including different payments for the same order.
 PERFORM pg_advisory_xact_lock(hashtextextended('dispatch-settlement',0));
 SELECT * INTO prior FROM courier_dispatch_settlements WHERE provider=payment->>'provider' AND payment_id=payment->>'paymentId';
 IF FOUND THEN
   IF prior.payload=payload THEN RETURN prior.receipt; END IF;
   INSERT INTO courier_dispatch_conflicts(provider,payment_id,payload,reason) VALUES(payment->>'provider',payment->>'paymentId',payment,'payment_conflict') ON CONFLICT DO NOTHING;
   RETURN jsonb_build_object('status','needs_review','reason','payment_conflict');
 END IF;
 SELECT * INTO q FROM courier_shipping_quotes WHERE id=(payment->>'shippingQuoteId')::uuid;
 SELECT * INTO c FROM courier_shipping_contexts WHERE id=q.context_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('shipping-context:'||c.id,0));
 SELECT * INTO s FROM courier_services WHERE id=q.service_id FOR UPDATE;
 SELECT * INTO h FROM courier_shipping_holds WHERE quote_id=q.id FOR UPDATE;
 PERFORM 1 FROM courier_organizations WHERE id=s.organization_id FOR SHARE;
 PERFORM 1 FROM courier_identity_documents WHERE account_id=(SELECT owner_customer_id::text FROM courier_organizations WHERE id=s.organization_id) ORDER BY id FOR SHARE;
 IF q.id IS NULL OR c.customer_id IS DISTINCT FROM payment->>'customerId' OR q.currency IS DISTINCT FROM payment->>'currency' OR q.total_minor IS DISTINCT FROM (payment->>'amountMinor')::bigint THEN reason:='payment_mismatch';
 ELSIF EXISTS(SELECT 1 FROM courier_dispatch_jobs WHERE order_id=payment->>'orderId' OR quote_id=q.id) THEN reason:='order_conflict';
 ELSIF h.id IS NULL OR h.status<>'held' OR h.expires_at<=now() THEN reason:='reservation_expired';
 ELSIF s.version<>q.service_version OR NOT EXISTS(SELECT 1 FROM courier_available_services WHERE id=s.id) THEN reason:='courier_unavailable';
 END IF;
 IF reason IS NOT NULL THEN
   result:=jsonb_build_object('status','needs_review','reason',reason);
   INSERT INTO courier_dispatch_conflicts(provider,payment_id,payload,reason) VALUES(payment->>'provider',payment->>'paymentId',payment,reason) ON CONFLICT DO NOTHING;
 ELSE
   result:=jsonb_build_object('id',job,'status','awaiting_driver','version',1);
   INSERT INTO courier_dispatch_jobs(id,order_id,quote_id,organization_id,settlement,status,receipt) VALUES(job,payment->>'orderId',q.id,s.organization_id,payment,'awaiting_driver',result);
   UPDATE courier_shipping_holds SET status='confirmed' WHERE id=h.id;
 END IF;
 INSERT INTO courier_dispatch_settlements VALUES(payment->>'provider',payment->>'paymentId',payload,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION courier_dispatch_assign(owner_id TEXT, job_id UUID, selected_driver UUID, expected_version INTEGER) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE j courier_dispatch_jobs; d courier_drivers; o courier_organizations; c courier_shipping_contexts; pickup UUID:=gen_random_uuid(); result JSONB;
BEGIN
 SELECT * INTO j FROM courier_dispatch_jobs WHERE id=job_id FOR UPDATE;
 SELECT * INTO o FROM courier_organizations WHERE id=j.organization_id FOR SHARE;
 IF o.id IS NULL OR o.owner_customer_id::text IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
 SELECT * INTO d FROM courier_drivers WHERE id=selected_driver AND organization_id=o.id FOR SHARE;
 PERFORM 1 FROM courier_identity_documents WHERE account_id IN (d.account_id,owner_id) ORDER BY id FOR SHARE;
 IF d.id IS NULL OR NOT d.active OR o.status<>'approved'
 OR NOT EXISTS(SELECT 1 FROM courier_identity_documents WHERE account_id=d.account_id AND kind='identity' AND status='verified')
 OR (SELECT count(*) FROM courier_identity_documents WHERE account_id=owner_id AND kind IN ('identity','business') AND status='verified')<>2 THEN RAISE EXCEPTION 'COURIER_DRIVER_UNAVAILABLE'; END IF;
 IF j.status='assigned' AND j.driver_id=selected_driver THEN RETURN j.receipt; END IF;
 IF j.status<>'awaiting_driver' OR j.version IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
 SELECT x.* INTO c FROM courier_shipping_contexts x JOIN courier_shipping_quotes q ON q.context_id=x.id WHERE q.id=j.quote_id;
 INSERT INTO courier_pickups(id,driver_id,organization_id,order_id,order_number,branch_id,items,destination,source_reference,customer_account_id)
 VALUES(pickup,d.id,o.id,j.order_id,j.settlement->>'orderNumber',c.branch_id,c.items,c.destination,'dispatch:'||j.id,c.customer_id);
 result:=jsonb_build_object('id',j.id,'status','assigned','version',j.version+1,'pickupId',pickup);
 UPDATE courier_dispatch_jobs SET status='assigned',driver_id=d.id,pickup_id=pickup,version=version+1,receipt=result WHERE id=j.id;
 INSERT INTO courier_private_audit(actor_id,action,subject_id,version) VALUES(owner_id,'assign_dispatch',j.id::text,j.version+1);
 RETURN result;
END $$;
-- Functions are invoked by the server database role, never anonymous database users.
REVOKE ALL ON FUNCTION courier_shipping_reserve(TEXT,UUID,UUID), courier_dispatch_paid(JSONB), courier_dispatch_assign(TEXT,UUID,UUID,INTEGER) FROM PUBLIC;
