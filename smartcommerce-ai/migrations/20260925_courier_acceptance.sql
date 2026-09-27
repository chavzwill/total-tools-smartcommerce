ALTER TABLE courier_dispatch_jobs ADD COLUMN IF NOT EXISTS acceptance TEXT NOT NULL DEFAULT 'pending' CHECK(acceptance IN ('pending','accepted','declined','expired'));
ALTER TABLE courier_dispatch_jobs ADD COLUMN IF NOT EXISTS acceptance_deadline TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '10 minutes');
ALTER TABLE courier_dispatch_jobs ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
-- Existing physical assignments predate this requirement; preserve their history.
UPDATE courier_dispatch_jobs SET acceptance='accepted' WHERE status='assigned' AND acceptance='pending';
CREATE TABLE IF NOT EXISTS courier_dispatch_responses (
 job_id UUID PRIMARY KEY REFERENCES courier_dispatch_jobs(id), owner_id TEXT NOT NULL,
 decision TEXT NOT NULL, reason TEXT, responded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION courier_dispatch_acceptance_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='assigned' AND OLD.status<>'assigned' AND OLD.acceptance<>'accepted' THEN RAISE EXCEPTION 'COURIER_ACCEPTANCE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_dispatch_acceptance_required ON courier_dispatch_jobs;
CREATE TRIGGER courier_dispatch_acceptance_required BEFORE UPDATE OF status ON courier_dispatch_jobs FOR EACH ROW EXECUTE FUNCTION courier_dispatch_acceptance_guard();

CREATE OR REPLACE FUNCTION courier_dispatch_respond(owner_id TEXT,job_id UUID,decision TEXT,expected_version INTEGER,request_id UUID,decline_reason TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
<<op>>
DECLARE job courier_dispatch_jobs; org courier_organizations; prior courier_mutation_keys;
 actor_key TEXT:='dispatch-response:'||owner_id; fingerprint TEXT; result JSONB;
BEGIN
 IF owner_id IS NULL OR request_id IS NULL OR decision IS NULL OR decision NOT IN ('accept','decline') THEN RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(job_id,decision,expected_version,decline_reason)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_key||':'||request_id,0));
 SELECT * INTO job FROM courier_dispatch_jobs WHERE id=job_id FOR UPDATE;
 SELECT * INTO org FROM courier_organizations WHERE id=job.organization_id FOR SHARE;
 IF org.id IS NULL OR org.owner_customer_id::text IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
 SELECT * INTO prior FROM courier_mutation_keys k WHERE k.actor_key=op.actor_key AND k.request_id=courier_dispatch_respond.request_id;
 IF FOUND THEN
   IF prior.request_hash<>fingerprint THEN RAISE EXCEPTION 'COURIER_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN prior.result;
 END IF;
 IF job.version IS DISTINCT FROM expected_version OR job.status<>'awaiting_driver' OR job.acceptance<>'pending' THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
 IF decision='decline' AND (decline_reason IS NULL OR decline_reason NOT IN ('capacity','vehicle_unavailable','coverage_issue','other')) THEN RAISE EXCEPTION 'COURIER_REASON_REQUIRED'; END IF;
 PERFORM 1 FROM courier_identity_documents WHERE account_id=owner_id ORDER BY id FOR SHARE;
 IF job.acceptance_deadline<=now() THEN
   UPDATE courier_dispatch_jobs SET acceptance='expired',status='needs_review',reason='acceptance_expired',version=version+1,responded_at=now() WHERE id=job.id RETURNING * INTO job;
 ELSIF decision='accept' THEN
   IF org.status<>'approved' OR (SELECT count(*) FROM courier_identity_documents WHERE account_id=owner_id AND status='verified' AND kind IN ('identity','business'))<>2 THEN RAISE EXCEPTION 'COURIER_VERIFICATION_REQUIRED'; END IF;
   UPDATE courier_dispatch_jobs SET acceptance='accepted',version=version+1,responded_at=now() WHERE id=job.id RETURNING * INTO job;
 ELSE
   UPDATE courier_dispatch_jobs SET acceptance='declined',status='needs_review',reason=decline_reason,version=version+1,responded_at=now() WHERE id=job.id RETURNING * INTO job;
 END IF;
 INSERT INTO courier_dispatch_responses(job_id,owner_id,decision,reason) VALUES(job.id,owner_id,job.acceptance,job.reason);
 result:=jsonb_build_object('id',job.id,'status',job.status,'acceptance',job.acceptance,'version',job.version,'reason',job.reason);
 INSERT INTO courier_mutation_keys(actor_key,request_id,request_hash,result) VALUES(actor_key,request_id,fingerprint,result);
 INSERT INTO courier_private_audit(actor_id,action,subject_id,version,reason) VALUES(owner_id,'dispatch_'||job.acceptance,job.id::text,job.version,job.reason);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION courier_dispatch_queue(actor JSONB,after_id UUID DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE result JSONB; reconciled BIGINT;
BEGIN
 IF actor->>'kind' NOT IN ('owner','staff') OR actor->>'kind' IS NULL THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
 IF actor->>'kind'='staff' AND actor->'permissions'->'couriers_pickup' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
 -- Reconcile only offers visible to this actor. Row locks and the pending predicate
 -- make concurrent reads record one terminal expiry, response and audit event.
 WITH candidates AS (
   SELECT j.id FROM courier_dispatch_jobs j JOIN courier_organizations o ON o.id=j.organization_id
   JOIN courier_shipping_quotes q ON q.id=j.quote_id JOIN courier_shipping_contexts c ON c.id=q.context_id
   WHERE j.status='awaiting_driver' AND j.acceptance='pending' AND j.acceptance_deadline<=now()
     AND ((actor->>'kind'='owner' AND o.owner_customer_id::text=actor->>'customerId') OR
          (actor->>'kind'='staff' AND COALESCE(actor->'branchIds','[]'::jsonb)?c.branch_id))
   ORDER BY j.id LIMIT 100 FOR UPDATE OF j SKIP LOCKED
 ), expired AS (
   UPDATE courier_dispatch_jobs j SET acceptance='expired',status='needs_review',reason='acceptance_expired',version=j.version+1,responded_at=now()
   FROM candidates c WHERE j.id=c.id AND j.status='awaiting_driver' AND j.acceptance='pending'
   RETURNING j.id,j.organization_id,j.version,j.reason
 ), recorded AS (
   INSERT INTO courier_dispatch_responses(job_id,owner_id,decision,reason)
   SELECT e.id,o.owner_customer_id::text,'expired',e.reason FROM expired e JOIN courier_organizations o ON o.id=e.organization_id
   ON CONFLICT(job_id) DO NOTHING RETURNING job_id
 ), audited AS (
   INSERT INTO courier_private_audit(actor_id,action,subject_id,version,reason)
   SELECT o.owner_customer_id::text,'dispatch_expired',e.id::text,e.version,e.reason FROM expired e JOIN courier_organizations o ON o.id=e.organization_id
   RETURNING subject_id
 ) SELECT count(*) INTO reconciled FROM audited;
 WITH visible AS (
 SELECT j.*,c.branch_id,c.items,
   (j.status='needs_review' OR (j.acceptance='pending' AND j.acceptance_deadline<=now())) AS attention
 FROM courier_dispatch_jobs j JOIN courier_organizations o ON o.id=j.organization_id
 JOIN courier_shipping_quotes q ON q.id=j.quote_id JOIN courier_shipping_contexts c ON c.id=q.context_id
 WHERE (after_id IS NULL OR j.id>after_id) AND
 ((actor->>'kind'='owner' AND o.owner_customer_id::text=actor->>'customerId') OR
 (actor->>'kind'='staff' AND COALESCE(actor->'branchIds','[]'::jsonb)?c.branch_id)) ORDER BY j.id LIMIT 51
 ), page AS (SELECT * FROM visible ORDER BY id LIMIT 50)
 SELECT jsonb_build_object('jobs',COALESCE(jsonb_agg(jsonb_build_object(
 'id',id,'orderNumber',settlement->>'orderNumber','branchId',branch_id,'items',items,
 'status',CASE WHEN attention THEN 'needs_review' ELSE status END,
 'acceptance',CASE WHEN acceptance='pending' AND acceptance_deadline<=now() THEN 'expired' ELSE acceptance END,
 'deadline',acceptance_deadline,'version',version,'reason',CASE WHEN acceptance='pending' AND acceptance_deadline<=now() THEN 'acceptance_expired' ELSE reason END,
 'attention',attention,'organizationId',organization_id) ORDER BY id),'[]'::jsonb),
 'nextCursor',CASE WHEN (SELECT count(*) FROM visible)>50 THEN (SELECT id::text FROM page ORDER BY id DESC LIMIT 1) ELSE NULL END,'checkedAt',now()) INTO result FROM page;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION courier_dispatch_respond(TEXT,UUID,TEXT,INTEGER,UUID,TEXT),courier_dispatch_queue(JSONB,UUID) FROM PUBLIC;
