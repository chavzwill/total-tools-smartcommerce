-- Apply explicitly to the existing customer-account database. No production seed data.
-- Preserve the deployed account ID type (installations may use text or UUID).
DO $$ DECLARE account_type text; BEGIN
  SELECT format_type(atttypid,atttypmod) INTO account_type FROM pg_attribute
    WHERE attrelid='customer_accounts'::regclass AND attname='id' AND NOT attisdropped;
  IF account_type NOT IN ('text','uuid','character varying') THEN RAISE EXCEPTION 'Unsupported customer identity type'; END IF;
  EXECUTE format('CREATE TABLE IF NOT EXISTS courier_organizations (
    id UUID PRIMARY KEY, owner_customer_id %s NOT NULL UNIQUE REFERENCES customer_accounts(id),
    profile JSONB NOT NULL CHECK(jsonb_typeof(profile)=''object''),
    status TEXT NOT NULL DEFAULT ''draft'' CHECK(status IN (''draft'',''submitted'',''approved'',''rejected'',''suspended'')),
    version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), decision_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )',account_type);
END $$;
-- Governed reference data is supplied by operations; no sample entries are installed.
CREATE TABLE IF NOT EXISTS courier_references (
  kind TEXT NOT NULL CHECK(kind IN ('area','category','collection_point','currency')),
  id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 120), name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true, PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS courier_services (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES courier_organizations(id),
  version INTEGER NOT NULL CHECK(version>0), published BOOLEAN NOT NULL DEFAULT false,
  input JSONB NOT NULL CHECK(jsonb_typeof(input)='object'), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_service_versions (
  service_id UUID NOT NULL REFERENCES courier_services(id), version INTEGER NOT NULL,
  input JSONB NOT NULL, published BOOLEAN NOT NULL, actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(service_id,version)
);
CREATE OR REPLACE VIEW courier_available_services AS
  SELECT s.* FROM courier_services s JOIN courier_organizations o ON o.id=s.organization_id
  WHERE o.status='approved' AND s.published AND s.input->'available'='true'::jsonb;
CREATE INDEX IF NOT EXISTS courier_review_queue ON courier_organizations(updated_at,id);
CREATE TABLE IF NOT EXISTS courier_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES courier_organizations(id),
  actor_kind TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  old_status TEXT, new_status TEXT NOT NULL, reason TEXT,
  version INTEGER NOT NULL, request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_mutation_keys (
  actor_key TEXT NOT NULL, request_id UUID NOT NULL, request_hash TEXT NOT NULL,
  result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_key,request_id)
);
CREATE OR REPLACE FUNCTION courier_application_json(subject courier_organizations) RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT subject.profile || jsonb_build_object('id',subject.id,'status',subject.status,'version',subject.version,
    'decisionReason',subject.decision_reason,'updatedAt',subject.updated_at);
$$;

-- Invoked only by the server with an authenticated actor, never by a browser SQL client.
-- A single function call makes mutation, replay evidence and audit one transaction.
CREATE OR REPLACE FUNCTION courier_mutate(actor JSONB, command JSONB) RETURNS JSONB
LANGUAGE plpgsql AS $$
<<mutation>>
DECLARE
  actor_kind TEXT := actor->>'kind';
  actor_id TEXT := CASE WHEN actor->>'kind'='owner' THEN actor->>'customerId' ELSE actor->>'employeeId' END;
  actor_key TEXT;
  request_id UUID := (command->>'idempotencyKey')::uuid;
  request_hash TEXT := encode(sha256(convert_to(command::text,'UTF8')),'hex');
  prior courier_mutation_keys;
  org courier_organizations;
  action TEXT := command->>'action';
  target_id UUID := (command->>'id')::uuid;
  next_status TEXT;
  old_status TEXT;
  reason TEXT := nullif(btrim(command->>'reason'),'');
  result JSONB;
BEGIN
  IF actor_kind NOT IN ('owner','staff') OR actor_id IS NULL OR actor_id='' OR request_id IS NULL OR target_id IS NULL THEN
    RAISE EXCEPTION 'COURIER_INVALID_COMMAND';
  END IF;
  actor_key:=actor_kind||':'||actor_id;
  IF actor_kind='staff' AND actor->'permissions'->'couriers_manage' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'COURIER_FORBIDDEN';
  END IF;
  IF (actor_kind='owner' AND action NOT IN ('create_application','save_application','submit_application')) OR
     (actor_kind='staff' AND action NOT IN ('approve','reject','suspend','reinstate')) THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor_key||':'||request_id::text,0));
  SELECT * INTO prior FROM courier_mutation_keys k WHERE k.actor_key=mutation.actor_key AND k.request_id=mutation.request_id;
  IF FOUND THEN
    IF prior.request_hash<>request_hash THEN RAISE EXCEPTION 'COURIER_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN prior.result;
  END IF;
  IF action='create_application' THEN
    IF command->'input' IS NULL OR jsonb_typeof(command->'input')<>'object' THEN RAISE EXCEPTION 'COURIER_INVALID_APPLICATION'; END IF;
    -- Assign owner using the real account row; avoids coercing a deployed identity type.
    INSERT INTO courier_organizations(id,owner_customer_id,profile)
      SELECT target_id,c.id,command->'input' FROM customer_accounts c WHERE c.id::text=actor_id
      RETURNING * INTO org;
    IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
  ELSE
    SELECT * INTO org FROM courier_organizations WHERE id=target_id FOR UPDATE;
    IF NOT FOUND OR (actor_kind='owner' AND org.owner_customer_id::text<>actor_id) THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
    IF org.version IS DISTINCT FROM (command->>'expectedVersion')::integer THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    old_status:=org.status;
    next_status:=CASE
      WHEN action='save_application' AND org.status IN ('draft','rejected') THEN org.status
      WHEN action='submit_application' AND org.status IN ('draft','rejected') THEN 'submitted'
      WHEN action='approve' AND org.status='submitted' THEN 'approved'
      WHEN action='reject' AND org.status='submitted' THEN 'rejected'
      WHEN action='suspend' AND org.status='approved' THEN 'suspended'
      WHEN action='reinstate' AND org.status='suspended' THEN 'approved' END;
    IF next_status IS NULL THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    IF actor_kind='staff' AND (reason IS NULL OR length(reason)>1000) THEN RAISE EXCEPTION 'COURIER_REASON_REQUIRED'; END IF;
    UPDATE courier_organizations SET status=next_status,version=version+1,updated_at=now(),
      profile=CASE WHEN action='save_application' THEN command->'input' ELSE profile END,
      decision_reason=CASE WHEN actor_kind='staff' THEN reason WHEN action='submit_application' THEN NULL ELSE decision_reason END
      WHERE id=target_id RETURNING * INTO org;
  END IF;
  INSERT INTO courier_events(organization_id,actor_kind,actor_id,action,old_status,new_status,reason,version,request_id)
    VALUES(org.id,actor_kind,actor_id,action,old_status,org.status,reason,org.version,request_id);
  result:=courier_application_json(org);
  INSERT INTO courier_mutation_keys(actor_key,request_id,request_hash,result) VALUES(actor_key,request_id,request_hash,result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION courier_service_mutate(customer_id TEXT, command JSONB) RETURNS JSONB
LANGUAGE plpgsql AS $$
<<service_mutation>>
DECLARE
  actor_key TEXT := 'owner:'||customer_id;
  request_id UUID := (command->>'idempotencyKey')::uuid;
  request_hash TEXT := encode(sha256(convert_to(command::text,'UTF8')),'hex');
  prior courier_mutation_keys; org courier_organizations; service courier_services;
  target_id UUID := (command->>'id')::uuid;
  org_id UUID := (command->>'organizationId')::uuid;
  action TEXT := command->>'action'; result JSONB;
BEGIN
  IF customer_id IS NULL OR customer_id='' OR request_id IS NULL OR target_id IS NULL OR org_id IS NULL OR action NOT IN ('save_service','publish_service','pause_service') THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor_key||':'||request_id::text,0));
  SELECT * INTO prior FROM courier_mutation_keys k WHERE k.actor_key=service_mutation.actor_key AND k.request_id=service_mutation.request_id;
  IF FOUND THEN
    IF prior.request_hash<>request_hash THEN RAISE EXCEPTION 'COURIER_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN prior.result;
  END IF;
  SELECT * INTO org FROM courier_organizations WHERE id=org_id FOR UPDATE;
  IF NOT FOUND OR org.owner_customer_id::text<>customer_id THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
  SELECT * INTO service FROM courier_services WHERE id=target_id FOR UPDATE;
  IF NOT FOUND THEN
    IF action<>'save_service' OR (command->>'expectedVersion')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    IF (SELECT count(*) FROM courier_services WHERE organization_id=org_id)>=50 THEN RAISE EXCEPTION 'COURIER_SERVICE_LIMIT'; END IF;
    INSERT INTO courier_services(id,organization_id,version,input) VALUES(target_id,org_id,1,command->'input') RETURNING * INTO service;
  ELSE
    IF service.organization_id<>org_id THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
    IF service.version IS DISTINCT FROM (command->>'expectedVersion')::integer THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    IF action='publish_service' AND org.status<>'approved' THEN RAISE EXCEPTION 'COURIER_NOT_APPROVED'; END IF;
    UPDATE courier_services SET version=version+1,
      input=CASE WHEN action='save_service' THEN command->'input' ELSE input END,
      published=(action='publish_service'),updated_at=now()
      WHERE id=target_id RETURNING * INTO service;
  END IF;
  INSERT INTO courier_service_versions(service_id,version,input,published,actor_id) VALUES(service.id,service.version,service.input,service.published,customer_id);
  INSERT INTO courier_events(organization_id,actor_kind,actor_id,action,old_status,new_status,version,request_id)
    VALUES(org_id,'owner',customer_id,action,org.status,org.status,org.version,request_id);
  result:=jsonb_build_object('id',service.id,'organizationId',org_id,'version',service.version,'published',service.published,'input',service.input);
  INSERT INTO courier_mutation_keys(actor_key,request_id,request_hash,result) VALUES(actor_key,request_id,request_hash,result);
  RETURN result;
END $$;
