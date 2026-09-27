-- Customer ownership is supplied by the trusted dispatch importer, never a browser.
ALTER TABLE courier_pickups ADD COLUMN IF NOT EXISTS customer_account_id TEXT;
CREATE INDEX IF NOT EXISTS courier_pickup_customer ON courier_pickups(customer_account_id,id);
CREATE TABLE IF NOT EXISTS courier_delivery_state (
  pickup_id UUID PRIMARY KEY REFERENCES courier_pickups(id),
  status TEXT NOT NULL CHECK(status IN ('collected','in_transit','out_for_delivery','delivered')),
  version INTEGER NOT NULL CHECK(version>0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_delivery_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pickup_id UUID NOT NULL REFERENCES courier_pickups(id), version INTEGER NOT NULL,
  event TEXT NOT NULL, stage TEXT NOT NULL, reason TEXT, actor_id TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pickup_id,version)
);
CREATE TABLE IF NOT EXISTS courier_delivery_proofs (
  pickup_id UUID PRIMARY KEY REFERENCES courier_pickups(id), encrypted JSONB NOT NULL,
  fingerprint TEXT NOT NULL, mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png')),
  created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION courier_delivery_mutate(actor JSONB, command JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
<<delivery_op>>
DECLARE
  actor_id TEXT:=actor->>'customerId';
  actor_key TEXT:='delivery:'||actor_id;
  req UUID:=(command->>'idempotencyKey')::uuid;
  fingerprint TEXT:=encode(sha256(convert_to((command #- '{proof,encrypted}')::text,'UTF8')),'hex');
  pickup courier_pickups; driver courier_drivers; org courier_organizations;
  previous courier_mutation_keys; current_state courier_delivery_state;
  stage TEXT; target TEXT:=command->>'status'; v INTEGER; result JSONB;
  reported TIMESTAMPTZ:=COALESCE((command->>'reportedAt')::timestamptz,now());
BEGIN
  IF actor->>'kind' IS DISTINCT FROM 'owner' OR actor_id IS NULL THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
  IF command->>'action' IS DISTINCT FROM 'update_status' OR target IS NULL THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor_key||':'||req::text,0));
  SELECT * INTO pickup FROM courier_pickups WHERE id=(command->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
  SELECT * INTO driver FROM courier_drivers WHERE id=pickup.driver_id AND organization_id=pickup.organization_id AND account_id=actor_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
  SELECT * INTO org FROM courier_organizations WHERE id=pickup.organization_id AND status='approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_VERIFICATION_REQUIRED'; END IF;
  -- Lock verification records so revocation and status reporting cannot race past one another.
  PERFORM 1 FROM courier_identity_documents WHERE account_id IN (actor_id,org.owner_customer_id::text) ORDER BY id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM courier_identity_documents WHERE account_id=actor_id AND kind='identity' AND status='verified')
    OR (SELECT count(*) FROM courier_identity_documents WHERE account_id=org.owner_customer_id::text AND kind IN ('identity','business') AND status='verified')<>2 THEN RAISE EXCEPTION 'COURIER_VERIFICATION_REQUIRED'; END IF;
  SELECT * INTO previous FROM courier_mutation_keys k WHERE k.actor_key=delivery_op.actor_key AND request_id=req;
  IF FOUND THEN
    IF previous.request_hash<>fingerprint THEN RAISE EXCEPTION 'COURIER_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN previous.result;
  END IF;
  IF pickup.status<>'collected' OR pickup.collected_at IS NULL THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
  SELECT * INTO current_state FROM courier_delivery_state WHERE pickup_id=pickup.id;
  stage:=COALESCE(current_state.status,'collected'); v:=COALESCE(current_state.version,0);
  IF (command->>'expectedVersion')::int IS DISTINCT FROM v THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
  IF reported>now()+interval '5 minutes' OR reported<pickup.collected_at-interval '5 minutes' THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
  IF target IN ('delayed','failed_attempt') THEN
    IF stage='delivered' OR (target='failed_attempt' AND stage<>'out_for_delivery') THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    IF command->>'reason' IS NULL OR command->>'reason' NOT IN ('traffic','weather','vehicle_issue','recipient_unavailable','address_issue','other') THEN RAISE EXCEPTION 'COURIER_REASON_REQUIRED'; END IF;
  ELSE
    IF NOT ((stage='collected' AND target='in_transit') OR (stage='in_transit' AND target='out_for_delivery') OR (stage='out_for_delivery' AND target='delivered')) THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    stage:=target;
  END IF;
  IF target='delivered' THEN
    IF jsonb_typeof(command->'proof'->'encrypted') IS DISTINCT FROM 'object' OR command->'proof'->>'mime' IS NULL OR command->'proof'->>'mime' NOT IN ('image/jpeg','image/png') OR COALESCE(command->'proof'->>'fingerprint','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'COURIER_PROOF_REQUIRED'; END IF;
    INSERT INTO courier_delivery_proofs(pickup_id,encrypted,fingerprint,mime,created_by) VALUES(pickup.id,command->'proof'->'encrypted',command->'proof'->>'fingerprint',command->'proof'->>'mime',actor_id);
  ELSIF command ? 'proof' THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
  v:=v+1;
  INSERT INTO courier_delivery_state(pickup_id,status,version) VALUES(pickup.id,stage,v)
    ON CONFLICT(pickup_id) DO UPDATE SET status=EXCLUDED.status,version=EXCLUDED.version,updated_at=now();
  INSERT INTO courier_delivery_events(pickup_id,version,event,stage,reason,actor_id,reported_at) VALUES(pickup.id,v,target,stage,CASE WHEN target IN ('delayed','failed_attempt') THEN command->>'reason' END,actor_id,reported);
  result:=jsonb_build_object('id',pickup.id,'status',stage,'event',target,'version',v,'updatedAt',now());
  INSERT INTO courier_mutation_keys(actor_key,request_id,request_hash,result) VALUES(actor_key,req,fingerprint,result);
  RETURN result;
END $$;

-- Audience comes from the server endpoint, never from request JSON or a query parameter.
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
      COALESCE(s.updated_at,p.collected_at) AS updated_at
    FROM courier_pickups p JOIN courier_drivers d ON d.id=p.driver_id AND d.organization_id=p.organization_id
    JOIN courier_organizations o ON o.id=p.organization_id LEFT JOIN courier_delivery_state s ON s.pickup_id=p.id
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
    'hasProof',EXISTS(SELECT 1 FROM courier_delivery_proofs WHERE pickup_id=p.id),
    'events',COALESCE((SELECT jsonb_agg(e.event ORDER BY e.version) FROM (
      SELECT version,jsonb_build_object('event',event,'status',stage,'reason',reason,'reportedAt',reported_at,'receivedAt',received_at,'version',version) AS event
      FROM courier_delivery_events WHERE pickup_id=p.id ORDER BY version DESC LIMIT 100
    ) e),'[]'::jsonb)
  ) ORDER BY p.id) FROM page p),'[]'::jsonb),'nextCursor',CASE WHEN (SELECT count(*) FROM eligible)>50 THEN (SELECT id::text FROM page ORDER BY id DESC LIMIT 1) END,'checkedAt',now()) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION courier_delivery_proof_read(actor JSONB,audience TEXT,shipment_id UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE proof courier_delivery_proofs;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM courier_pickups p JOIN courier_drivers d ON d.id=p.driver_id AND d.organization_id=p.organization_id
    JOIN courier_organizations o ON o.id=p.organization_id WHERE p.id=shipment_id AND (
      (audience='customer' AND actor->>'kind'='owner' AND p.customer_account_id=actor->>'customerId') OR
      (audience='courier' AND actor->>'kind'='owner' AND (o.owner_customer_id::text=actor->>'customerId' OR (d.account_id=actor->>'customerId' AND d.active))) OR
      (audience='staff' AND actor->>'kind'='staff' AND actor->'permissions'->'couriers_pickup'='true'::jsonb AND COALESCE(actor->'branchIds','[]'::jsonb) ? p.branch_id)
    )
  ) THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
  SELECT * INTO proof FROM courier_delivery_proofs WHERE pickup_id=shipment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
  INSERT INTO courier_private_audit(actor_id,action,subject_id) VALUES(CASE WHEN audience='staff' THEN actor->>'employeeId' ELSE actor->>'customerId' END,'read_delivery_proof',shipment_id::text);
  RETURN jsonb_build_object('encrypted',proof.encrypted,'mime',proof.mime,'fingerprint',proof.fingerprint,'createdAt',proof.created_at);
END $$;
