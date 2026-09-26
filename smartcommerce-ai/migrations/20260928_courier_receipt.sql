-- Customer condition confirmation is separate from the driver's proof of delivery.
-- It records evidence for a future POS-governed payout decision; it never pays a courier.
CREATE TABLE IF NOT EXISTS courier_customer_receipts (
 pickup_id UUID PRIMARY KEY REFERENCES courier_pickups(id), customer_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('accepted','problem_reported')),
 reason TEXT CHECK(reason IN ('damaged','missing_items','wrong_items','not_received','other')),
 idempotency_key UUID NOT NULL, request_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(customer_id,idempotency_key),
 CHECK((status='accepted' AND reason IS NULL) OR (status='problem_reported' AND reason IS NOT NULL))
);

CREATE OR REPLACE FUNCTION courier_customer_receipt(actor JSONB,command JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE pickup courier_pickups; prior courier_customer_receipts; by_key courier_customer_receipts;
 actor_id TEXT:=actor->>'customerId'; action TEXT:=command->>'action'; request_id UUID:=(command->>'idempotencyKey')::uuid;
 fingerprint TEXT:=encode(sha256(convert_to(command::text,'UTF8')),'hex'); outcome TEXT; result JSONB;
BEGIN
 IF actor->>'kind' IS DISTINCT FROM 'owner' OR actor_id IS NULL OR actor_id='' THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
 IF action NOT IN ('confirm_receipt','report_problem') OR request_id IS NULL OR (command->>'expectedVersion')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
 IF action='confirm_receipt' AND command ? 'reason' THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
 IF action='report_problem' AND command->>'reason' NOT IN ('damaged','missing_items','wrong_items','not_received','other') THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
 SELECT * INTO pickup FROM courier_pickups WHERE id=(command->>'id')::uuid FOR UPDATE;
 IF pickup.id IS NULL OR pickup.customer_account_id IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
 SELECT * INTO by_key FROM courier_customer_receipts WHERE customer_id=actor_id AND idempotency_key=request_id;
 IF FOUND THEN
   IF by_key.pickup_id<>pickup.id OR by_key.request_hash<>fingerprint THEN RAISE EXCEPTION 'COURIER_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN jsonb_build_object('id',pickup.id,'status',by_key.status,'reason',by_key.reason,'recordedAt',by_key.created_at);
 END IF;
 SELECT * INTO prior FROM courier_customer_receipts WHERE pickup_id=pickup.id;
 IF FOUND THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
 IF pickup.status<>'collected' OR NOT EXISTS(SELECT 1 FROM courier_delivery_state WHERE pickup_id=pickup.id AND status='delivered')
   OR NOT EXISTS(SELECT 1 FROM courier_delivery_proofs WHERE pickup_id=pickup.id) THEN RAISE EXCEPTION 'COURIER_RECEIPT_NOT_READY'; END IF;
 outcome:=CASE WHEN action='confirm_receipt' THEN 'accepted' ELSE 'problem_reported' END;
 INSERT INTO courier_customer_receipts(pickup_id,customer_id,status,reason,idempotency_key,request_hash)
 VALUES(pickup.id,actor_id,outcome,CASE WHEN outcome='problem_reported' THEN command->>'reason' END,request_id,fingerprint)
 RETURNING * INTO prior;
 INSERT INTO courier_private_audit(actor_id,action,subject_id,reason) VALUES(actor_id,'customer_receipt_'||outcome,pickup.id::text,prior.reason);
 result:=jsonb_build_object('id',pickup.id,'status',prior.status,'reason',prior.reason,'recordedAt',prior.created_at);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION courier_receipt_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END $$;
DROP TRIGGER IF EXISTS courier_receipt_no_rewrite ON courier_customer_receipts;
CREATE TRIGGER courier_receipt_no_rewrite BEFORE UPDATE OR DELETE ON courier_customer_receipts FOR EACH ROW EXECUTE FUNCTION courier_receipt_immutable();

-- A paid order, assigned shipment, driver proof and explicit customer acceptance
-- must all agree before any earning can become payable or enter a payout.
CREATE OR REPLACE FUNCTION courier_earning_has_evidence(earning courier_earnings) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
   SELECT 1 FROM courier_pickups p
   JOIN courier_delivery_state s ON s.pickup_id=p.id AND s.status='delivered'
   JOIN courier_delivery_proofs proof ON proof.pickup_id=p.id
   JOIN courier_customer_receipts receipt ON receipt.pickup_id=p.id AND receipt.status='accepted' AND receipt.customer_id=p.customer_account_id
   JOIN smartcommerce_payment_orders payment ON payment.id=p.order_id AND payment.customer_id=p.customer_account_id
   WHERE p.id::text=earning.delivery_reference AND p.order_id=earning.booking_id
     AND p.organization_id=earning.organization_id AND p.status='collected'
     AND payment.status='paid' AND payment.session_id=earning.payment_reference
     AND payment.currency=earning.currency AND earning.amount_minor<=payment.amount_minor
 )
$$;
CREATE OR REPLACE FUNCTION courier_earning_evidence_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IN ('payable','reserved','paid') AND NOT courier_earning_has_evidence(NEW) THEN RAISE EXCEPTION 'COURIER_EARNING_NOT_VERIFIED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_earning_requires_receipt ON courier_earnings;
CREATE TRIGGER courier_earning_requires_receipt BEFORE INSERT OR UPDATE OF status,booking_id,payment_reference,delivery_reference,organization_id,currency,amount_minor ON courier_earnings
FOR EACH ROW EXECUTE FUNCTION courier_earning_evidence_guard();
CREATE OR REPLACE FUNCTION courier_payout_earning_evidence_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE earning courier_earnings;
BEGIN
 SELECT * INTO earning FROM courier_earnings WHERE id=NEW.earning_id FOR SHARE;
 IF NEW.active AND (earning.id IS NULL OR earning.status<>'payable' OR NOT courier_earning_has_evidence(earning)) THEN RAISE EXCEPTION 'COURIER_EARNING_NOT_VERIFIED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_payout_requires_receipt ON courier_payout_earnings;
CREATE TRIGGER courier_payout_requires_receipt BEFORE INSERT OR UPDATE OF active,earning_id ON courier_payout_earnings FOR EACH ROW EXECUTE FUNCTION courier_payout_earning_evidence_guard();
CREATE OR REPLACE FUNCTION courier_payout_evidence_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE linked_count BIGINT; linked_amount BIGINT; invalid_count BIGINT;
BEGIN
 IF NEW.status IN ('approved','transfer_pending','paid') THEN
   PERFORM 1 FROM courier_payout_earnings link JOIN courier_earnings earning ON earning.id=link.earning_id
     WHERE link.payout_id=NEW.id AND link.active FOR SHARE OF earning;
   SELECT count(*),COALESCE(sum(earning.amount_minor),0),count(*) FILTER (
     WHERE earning.organization_id<>NEW.organization_id OR earning.currency<>NEW.currency
       OR earning.status NOT IN ('payable','reserved','paid') OR NOT courier_earning_has_evidence(earning)
   ) INTO linked_count,linked_amount,invalid_count
   FROM courier_payout_earnings link JOIN courier_earnings earning ON earning.id=link.earning_id
   WHERE link.payout_id=NEW.id AND link.active;
   IF linked_count=0 OR linked_amount IS DISTINCT FROM NEW.amount_minor OR invalid_count>0 THEN RAISE EXCEPTION 'COURIER_EARNING_NOT_VERIFIED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_payout_requires_delivery_receipt ON courier_payouts;
CREATE TRIGGER courier_payout_requires_delivery_receipt BEFORE INSERT OR UPDATE OF status,amount_minor,organization_id,currency ON courier_payouts
FOR EACH ROW EXECUTE FUNCTION courier_payout_evidence_guard();

CREATE OR REPLACE FUNCTION courier_delivery_read(actor JSONB,audience TEXT,after_id UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE result JSONB;
BEGIN
 IF audience NOT IN ('courier','customer','staff') OR audience IS NULL THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
 IF audience='staff' THEN
   IF actor->>'kind' IS DISTINCT FROM 'staff' OR actor->'permissions'->'couriers_pickup' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
 ELSIF actor->>'kind' IS DISTINCT FROM 'owner' OR actor->>'customerId' IS NULL THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
 WITH eligible AS (
   SELECT p.*,d.account_id AS driver_account,d.active,o.owner_customer_id::text AS owner_account,
     o.status='approved' AND EXISTS(SELECT 1 FROM courier_identity_documents WHERE account_id=d.account_id AND kind='identity' AND status='verified')
     AND (SELECT count(*) FROM courier_identity_documents WHERE account_id=o.owner_customer_id::text AND kind IN ('identity','business') AND status='verified')=2 AS verified,
     COALESCE(s.status,p.status) AS delivery_status,COALESCE(s.version,0) AS delivery_version,
     COALESCE(s.updated_at,p.collected_at) AS updated_at,r.status AS receipt_status,r.reason AS receipt_reason,r.created_at AS receipt_at
   FROM courier_pickups p JOIN courier_drivers d ON d.id=p.driver_id AND d.organization_id=p.organization_id
   JOIN courier_organizations o ON o.id=p.organization_id LEFT JOIN courier_delivery_state s ON s.pickup_id=p.id
   LEFT JOIN courier_customer_receipts r ON r.pickup_id=p.id
   WHERE (after_id IS NULL OR p.id>after_id) AND (
     (audience='customer' AND p.customer_account_id=actor->>'customerId') OR
     (audience='courier' AND (o.owner_customer_id::text=actor->>'customerId' OR (d.account_id=actor->>'customerId' AND d.active))) OR
     (audience='staff' AND COALESCE(actor->'branchIds','[]'::jsonb) ? p.branch_id)
   ) ORDER BY p.id LIMIT 51
 ), page AS (SELECT * FROM eligible ORDER BY id LIMIT 50)
 SELECT jsonb_build_object('deliveries',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',p.id,'orderNumber',p.order_number,'items',p.items,'destination',p.destination,
   'status',p.delivery_status,'version',p.delivery_version,'updatedAt',p.updated_at,
   'canUpdate',audience='courier' AND p.driver_account=actor->>'customerId' AND p.active AND p.verified AND p.status='collected' AND p.delivery_status<>'delivered',
   'canConfirm',audience='customer' AND p.delivery_status='delivered' AND p.receipt_status IS NULL AND EXISTS(SELECT 1 FROM courier_delivery_proofs WHERE pickup_id=p.id),
   'receiptStatus',p.receipt_status,'receiptReason',p.receipt_reason,'receiptAt',p.receipt_at,
   'hasProof',EXISTS(SELECT 1 FROM courier_delivery_proofs WHERE pickup_id=p.id),
   'events',COALESCE((SELECT jsonb_agg(e.event ORDER BY e.version) FROM (
     SELECT version,jsonb_build_object('event',event,'status',stage,'reason',reason,'reportedAt',reported_at,'receivedAt',received_at,'version',version) AS event
     FROM courier_delivery_events WHERE pickup_id=p.id ORDER BY version DESC LIMIT 100
   ) e),'[]'::jsonb)
 ) ORDER BY p.id) FROM page p),'[]'::jsonb),'nextCursor',CASE WHEN (SELECT count(*) FROM eligible)>50 THEN (SELECT id::text FROM page ORDER BY id DESC LIMIT 1) END,'checkedAt',now()) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION courier_customer_receipt(JSONB,JSONB),courier_delivery_read(JSONB,TEXT,UUID),courier_earning_has_evidence(courier_earnings) FROM PUBLIC;
