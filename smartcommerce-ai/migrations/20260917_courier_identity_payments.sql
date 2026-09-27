-- Requires courier onboarding migration. No live bookings, transfers or POS actions.
CREATE TABLE IF NOT EXISTS courier_sessions (
  token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE courier_sessions ADD COLUMN IF NOT EXISTS credential_stamp TEXT;
CREATE TABLE IF NOT EXISTS courier_staff_branches (
  employee_id TEXT NOT NULL, branch_id TEXT NOT NULL, PRIMARY KEY(employee_id,branch_id)
);
CREATE TABLE IF NOT EXISTS courier_identity_documents (
  id UUID PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('identity','business')),
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','application/pdf')),
  encrypted JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','revoked')),
  version INTEGER NOT NULL DEFAULT 1, reason TEXT, reviewed_by TEXT, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(account_id,kind)
);
CREATE TABLE IF NOT EXISTS courier_drivers (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES courier_organizations(id),
  account_id TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_driver_invites (
  token_hash TEXT PRIMARY KEY, organization_id UUID NOT NULL REFERENCES courier_organizations(id),
  email TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, accepted_by TEXT, accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_pickup_passes (
  token_hash TEXT PRIMARY KEY, driver_id UUID NOT NULL REFERENCES courier_drivers(id),
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS courier_one_active_pass ON courier_pickup_passes(driver_id) WHERE revoked_at IS NULL;
-- Populated only by a trusted order/dispatch adapter. No browser order creation endpoint.
CREATE TABLE IF NOT EXISTS courier_pickups (
  id UUID PRIMARY KEY, driver_id UUID NOT NULL REFERENCES courier_drivers(id),
  organization_id UUID NOT NULL REFERENCES courier_organizations(id), order_id TEXT NOT NULL,
  order_number TEXT NOT NULL, branch_id TEXT NOT NULL, items JSONB NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items)>0),
  destination JSONB NOT NULL CHECK(jsonb_typeof(destination)='object'), source_reference TEXT NOT NULL CHECK(length(source_reference)>0),
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','collected','cancelled')),
  version INTEGER NOT NULL DEFAULT 1, collected_by TEXT, collected_at TIMESTAMPTZ,
  UNIQUE(order_id,branch_id)
);
CREATE TABLE IF NOT EXISTS courier_bank_accounts (
  organization_id UUID PRIMARY KEY REFERENCES courier_organizations(id), encrypted JSONB NOT NULL,
  masked TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected')),
  reviewed_by TEXT, reason TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_private_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  subject_id TEXT NOT NULL, version INTEGER, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_document_versions (
  document_id UUID NOT NULL REFERENCES courier_identity_documents(id), version INTEGER NOT NULL,
  encrypted JSONB NOT NULL, mime TEXT NOT NULL, status TEXT NOT NULL, reviewed_by TEXT,
  reason TEXT, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(document_id,version)
);
ALTER TABLE courier_bank_accounts ADD COLUMN IF NOT EXISTS currency TEXT;
CREATE TABLE IF NOT EXISTS courier_earnings (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES courier_organizations(id),
  booking_id TEXT NOT NULL UNIQUE, payment_reference TEXT NOT NULL, delivery_reference TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3), amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
  status TEXT NOT NULL CHECK(status IN ('held','payable','reserved','paid','disputed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_payouts (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES courier_organizations(id),
  currency TEXT NOT NULL CHECK(length(currency)=3), amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
  bank_version INTEGER NOT NULL, bank_snapshot JSONB NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending_review','approved','transfer_pending','paid','rejected','cancelled','needs_review')),
  version INTEGER NOT NULL DEFAULT 1, transfer_reference TEXT UNIQUE, paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS courier_payout_earnings (
  payout_id UUID NOT NULL REFERENCES courier_payouts(id), earning_id UUID NOT NULL UNIQUE REFERENCES courier_earnings(id),
  PRIMARY KEY(payout_id,earning_id)
);
ALTER TABLE courier_payout_earnings ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE courier_payout_earnings DROP CONSTRAINT IF EXISTS courier_payout_earnings_earning_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS courier_one_reserved_earning ON courier_payout_earnings(earning_id) WHERE active;
-- Verification is required even when an old application was previously approved.
CREATE OR REPLACE VIEW courier_available_services AS
  SELECT s.* FROM courier_services s JOIN courier_organizations o ON o.id=s.organization_id
  WHERE o.status='approved' AND s.published AND s.input->'available'='true'::jsonb
  AND (SELECT count(*) FROM courier_identity_documents d WHERE d.account_id=o.owner_customer_id::text AND d.kind IN ('identity','business') AND d.status='verified')=2;

CREATE OR REPLACE FUNCTION courier_require_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('courier-private:'||NEW.owner_customer_id::text,0));
    IF (SELECT count(*) FROM courier_identity_documents WHERE account_id=NEW.owner_customer_id::text AND status='verified' AND kind IN ('identity','business'))<>2 THEN RAISE EXCEPTION 'COURIER_VERIFICATION_REQUIRED'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_approval_verification ON courier_organizations;
CREATE TRIGGER courier_approval_verification BEFORE UPDATE OF status ON courier_organizations FOR EACH ROW EXECUTE FUNCTION courier_require_verification();

CREATE OR REPLACE FUNCTION courier_private_mutate(actor JSONB, command JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
<<op>>
DECLARE
  actor_id TEXT:=CASE WHEN actor->>'kind'='owner' THEN actor->>'customerId' ELSE actor->>'employeeId' END;
  is_staff BOOLEAN:=actor->>'kind'='staff';
  action TEXT:=command->>'action';
  req UUID:=(command->>'idempotencyKey')::uuid;
  actor_key TEXT:='private:'||(actor->>'kind')||':'||actor_id;
  fingerprint TEXT:=encode(sha256(convert_to((command-'encrypted')::text,'UTF8')),'hex');
  prior courier_mutation_keys;
  org courier_organizations;
  doc courier_identity_documents;
  driver courier_drivers;
  invitation courier_driver_invites;
  bank courier_bank_accounts;
  payout courier_payouts;
  pickup courier_pickups;
  result JSONB;
  target TEXT;
  reason TEXT:=nullif(btrim(command->>'reason'),'');
  amount BIGINT;
BEGIN
  IF actor_id IS NULL OR actor_id='' OR req IS NULL OR actor->>'kind' NOT IN ('owner','staff') THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor_key||':'||req::text,0));
  SELECT * INTO prior FROM courier_mutation_keys WHERE courier_mutation_keys.actor_key=op.actor_key AND request_id=req;
  IF FOUND THEN IF prior.request_hash<>fingerprint THEN RAISE EXCEPTION 'COURIER_IDEMPOTENCY_CONFLICT'; END IF; RETURN prior.result; END IF;
  IF is_staff THEN
    IF action NOT IN ('review_document','read_document','review_bank','read_bank','read_payout_bank','scan_pass','confirm_pickup','payout_status') THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
    IF actor->'permissions'->(CASE WHEN action IN ('review_bank','read_bank','read_payout_bank','payout_status') THEN 'couriers_payments' WHEN action IN ('scan_pass','confirm_pickup') THEN 'couriers_pickup' ELSE 'couriers_verify' END) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
    IF action IN ('review_document','review_bank','payout_status') AND (reason IS NULL OR length(reason)>1000) THEN RAISE EXCEPTION 'COURIER_REASON_REQUIRED'; END IF;
  ELSIF action NOT IN ('upload_document','read_document','save_bank','invite_driver','accept_invite','remove_driver','issue_pass','revoke_pass','request_payout') THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;

  IF action IN ('upload_document','review_document','read_document') THEN
    IF action='upload_document' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('courier-private:'||actor_id,0));
      SELECT * INTO doc FROM courier_identity_documents WHERE account_id=actor_id AND kind=command->>'kind' FOR UPDATE;
      IF FOUND AND doc.version<>COALESCE((command->>'expectedVersion')::int,0) THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
      IF NOT FOUND AND COALESCE((command->>'expectedVersion')::int,0)<>0 THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
      IF doc.id IS NOT NULL THEN INSERT INTO courier_document_versions(document_id,version,encrypted,mime,status,reviewed_by,reason) VALUES(doc.id,doc.version,doc.encrypted,doc.mime,doc.status,doc.reviewed_by,doc.reason) ON CONFLICT DO NOTHING; END IF;
      INSERT INTO courier_identity_documents(id,account_id,kind,mime,encrypted) VALUES((command->>'id')::uuid,actor_id,command->>'kind',command->>'mime',command->'encrypted')
      ON CONFLICT(account_id,kind) DO UPDATE SET mime=EXCLUDED.mime,encrypted=EXCLUDED.encrypted,status='pending',version=courier_identity_documents.version+1,reviewed_by=NULL,reviewed_at=NULL,reason=NULL RETURNING * INTO doc;
    ELSE
      SELECT * INTO doc FROM courier_identity_documents WHERE id=(command->>'id')::uuid;
      IF NOT FOUND OR (NOT is_staff AND doc.account_id<>actor_id) THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended('courier-private:'||doc.account_id,0));
      SELECT * INTO doc FROM courier_identity_documents WHERE id=doc.id FOR UPDATE;
      IF action='review_document' THEN
        IF doc.version<>(command->>'expectedVersion')::int OR command->>'status' NOT IN ('verified','rejected','revoked') THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
        INSERT INTO courier_document_versions(document_id,version,encrypted,mime,status,reviewed_by,reason) VALUES(doc.id,doc.version,doc.encrypted,doc.mime,doc.status,doc.reviewed_by,doc.reason) ON CONFLICT DO NOTHING;
        UPDATE courier_identity_documents SET status=command->>'status',reason=op.reason,reviewed_by=actor_id,reviewed_at=now(),version=version+1 WHERE id=doc.id RETURNING * INTO doc;
      END IF;
    END IF;
    target:=doc.id::text;
    result:=jsonb_build_object('id',doc.id,'kind',doc.kind,'status',doc.status,'version',doc.version,'reason',doc.reason);
    IF action='read_document' THEN result:=result||jsonb_build_object('encrypted',doc.encrypted,'mime',doc.mime); END IF;

  ELSIF action IN ('save_bank','review_bank','read_bank','invite_driver','remove_driver','request_payout') THEN
    SELECT * INTO org FROM courier_organizations WHERE id=(command->>'organizationId')::uuid FOR UPDATE;
    IF NOT FOUND OR (NOT is_staff AND org.owner_customer_id::text<>actor_id) THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
    target:=org.id::text;
    IF action='invite_driver' THEN
      INSERT INTO courier_driver_invites(token_hash,organization_id,email,expires_at) VALUES(command->>'tokenHash',org.id,command->>'email',now()+interval '48 hours');
      result:=jsonb_build_object('id',org.id,'version',org.version,'expiresInHours',48);
    ELSIF action='remove_driver' THEN
      SELECT * INTO driver FROM courier_drivers WHERE id=(command->>'id')::uuid AND organization_id=org.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
      IF driver.version IS DISTINCT FROM (command->>'expectedVersion')::int OR NOT driver.active THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
      UPDATE courier_drivers SET active=false,version=version+1 WHERE id=driver.id RETURNING * INTO driver;
      UPDATE courier_pickup_passes SET revoked_at=now() WHERE driver_id=driver.id AND revoked_at IS NULL;
      result:=jsonb_build_object('id',driver.id,'version',driver.version,'active',false);
    ELSE
      SELECT * INTO bank FROM courier_bank_accounts WHERE organization_id=org.id FOR UPDATE;
      IF action='save_bank' THEN
        IF COALESCE(bank.version,0)<>(command->>'expectedVersion')::int THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
        INSERT INTO courier_bank_accounts(organization_id,encrypted,masked,currency) VALUES(org.id,command->'encrypted',command->>'masked',command->>'currency') ON CONFLICT(organization_id) DO UPDATE SET encrypted=EXCLUDED.encrypted,masked=EXCLUDED.masked,currency=EXCLUDED.currency,status='pending',version=courier_bank_accounts.version+1,reviewed_by=NULL,reason=NULL,updated_at=now() RETURNING * INTO bank;
      ELSIF action='review_bank' THEN
        IF bank.organization_id IS NULL OR bank.version<>(command->>'expectedVersion')::int OR command->>'status' NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
        UPDATE courier_bank_accounts SET status=command->>'status',reason=op.reason,reviewed_by=actor_id,version=version+1,updated_at=now() WHERE organization_id=org.id RETURNING * INTO bank;
      ELSIF action='read_bank' AND bank.organization_id IS NULL THEN RAISE EXCEPTION 'COURIER_NOT_FOUND';
      END IF;
      IF action='request_payout' THEN
        IF bank.status IS DISTINCT FROM 'verified' OR org.status<>'approved' OR bank.currency IS DISTINCT FROM command->>'currency' THEN RAISE EXCEPTION 'COURIER_NOT_APPROVED'; END IF;
        PERFORM 1 FROM courier_earnings WHERE organization_id=org.id AND currency=command->>'currency' AND status='payable' FOR UPDATE;
        SELECT sum(amount_minor) INTO amount FROM courier_earnings WHERE organization_id=org.id AND currency=command->>'currency' AND status='payable';
        IF amount IS NULL OR amount<=0 OR amount>9007199254740991 THEN RAISE EXCEPTION 'COURIER_NO_PAYABLE_EARNINGS'; END IF;
        INSERT INTO courier_payouts(id,organization_id,currency,amount_minor,bank_version,bank_snapshot,status) VALUES((command->>'id')::uuid,org.id,command->>'currency',amount,bank.version,bank.encrypted,'pending_review') RETURNING * INTO payout;
        INSERT INTO courier_payout_earnings(payout_id,earning_id) SELECT payout.id,id FROM courier_earnings WHERE organization_id=org.id AND currency=payout.currency AND status='payable';
        UPDATE courier_earnings SET status='reserved' WHERE id IN (SELECT earning_id FROM courier_payout_earnings WHERE payout_id=payout.id);
        result:=jsonb_build_object('id',payout.id,'version',payout.version,'status',payout.status,'amountMinor',payout.amount_minor,'currency',payout.currency);
      ELSE
        result:=jsonb_build_object('id',org.id,'version',bank.version,'status',bank.status,'masked',bank.masked,'reason',bank.reason);
        IF action='read_bank' THEN result:=result||jsonb_build_object('encrypted',bank.encrypted); END IF;
      END IF;
    END IF;

  ELSIF action='accept_invite' THEN
    SELECT * INTO invitation FROM courier_driver_invites WHERE token_hash=command->>'tokenHash' FOR UPDATE;
    IF NOT FOUND OR invitation.expires_at<=now() OR invitation.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'COURIER_INVITE_UNAVAILABLE'; END IF;
    -- Email is supplied from the authenticated account lookup, never the browser.
    IF invitation.email IS DISTINCT FROM command->>'authenticatedEmail' OR command->'emailVerified' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
    INSERT INTO courier_drivers(id,organization_id,account_id) VALUES((command->>'id')::uuid,invitation.organization_id,actor_id) RETURNING * INTO driver;
    UPDATE courier_driver_invites SET accepted_by=actor_id,accepted_at=now() WHERE token_hash=invitation.token_hash;
    target:=driver.id::text;result:=jsonb_build_object('id',driver.id,'version',driver.version,'organizationId',driver.organization_id);

  ELSIF action IN ('issue_pass','revoke_pass','scan_pass','confirm_pickup') THEN
    IF action IN ('scan_pass','confirm_pickup') THEN
      SELECT d.* INTO driver FROM courier_pickup_passes p JOIN courier_drivers d ON d.id=p.driver_id WHERE p.token_hash=command->>'tokenHash' AND p.revoked_at IS NULL AND p.expires_at>now() FOR UPDATE OF d;
    ELSE SELECT * INTO driver FROM courier_drivers WHERE account_id=actor_id FOR UPDATE; END IF;
    IF NOT FOUND OR NOT driver.active THEN RAISE EXCEPTION 'COURIER_PASS_UNAVAILABLE'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('courier-private:'||driver.account_id,0));
    IF action<>'revoke_pass' AND (NOT EXISTS(SELECT 1 FROM courier_identity_documents WHERE account_id=driver.account_id AND kind='identity' AND status='verified') OR NOT EXISTS(SELECT 1 FROM courier_organizations o WHERE id=driver.organization_id AND status='approved' AND (SELECT count(*) FROM courier_identity_documents WHERE account_id=o.owner_customer_id::text AND status='verified' AND kind IN ('identity','business'))=2)) THEN RAISE EXCEPTION 'COURIER_VERIFICATION_REQUIRED'; END IF;
    IF action IN ('issue_pass','revoke_pass') THEN UPDATE courier_pickup_passes SET revoked_at=now() WHERE driver_id=driver.id AND revoked_at IS NULL; END IF;
    IF action='issue_pass' THEN INSERT INTO courier_pickup_passes(token_hash,driver_id,expires_at) VALUES(command->>'tokenHash',driver.id,now()+interval '24 hours'); END IF;
    target:=driver.id::text;result:=jsonb_build_object('id',driver.id,'version',driver.version,'organizationId',driver.organization_id,'expiresAt',(SELECT expires_at FROM courier_pickup_passes WHERE driver_id=driver.id AND revoked_at IS NULL),'handoverAvailable',false);
    IF action='scan_pass' THEN
      result:=result||jsonb_build_object('driverName',(SELECT full_name FROM customer_accounts WHERE id::text=driver.account_id),'organizationName',(SELECT profile->>'businessName' FROM courier_organizations WHERE id=driver.organization_id));
      result:=result||jsonb_build_object('orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'orderNumber',p.order_number,'branchId',p.branch_id,'items',p.items,'destination',p.destination,'status',p.status) ORDER BY p.order_number) FROM courier_pickups p WHERE p.driver_id=driver.id AND p.organization_id=driver.organization_id AND p.status='ready' AND COALESCE(actor->'branchIds','[]'::jsonb) ? p.branch_id),'[]'::jsonb));
      result:=result||jsonb_build_object('handoverAvailable',jsonb_array_length(result->'orders')>0);
    ELSIF action='confirm_pickup' THEN
      SELECT * INTO pickup FROM courier_pickups WHERE id=(command->>'id')::uuid AND driver_id=driver.id AND organization_id=driver.organization_id FOR UPDATE;
      IF NOT FOUND OR NOT (COALESCE(actor->'branchIds','[]'::jsonb) ? pickup.branch_id) THEN RAISE EXCEPTION 'COURIER_FORBIDDEN'; END IF;
      IF pickup.status<>'ready' OR pickup.version<>(command->>'expectedVersion')::int THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
      UPDATE courier_pickups SET status='collected',version=version+1,collected_by=actor_id,collected_at=now() WHERE id=pickup.id RETURNING * INTO pickup;
      target:=pickup.id::text;result:=jsonb_build_object('id',pickup.id,'version',pickup.version,'status',pickup.status,'orderNumber',pickup.order_number,'collectedAt',pickup.collected_at);
    END IF;

  ELSIF action='read_payout_bank' THEN
    SELECT * INTO payout FROM courier_payouts WHERE id=(command->>'id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'COURIER_NOT_FOUND'; END IF;
    target:=payout.id::text;result:=jsonb_build_object('id',payout.id,'version',payout.version,'encrypted',payout.bank_snapshot);
  ELSIF action='payout_status' THEN
    SELECT * INTO payout FROM courier_payouts WHERE id=(command->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR payout.version<>(command->>'expectedVersion')::int THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    IF NOT ((payout.status='pending_review' AND command->>'status' IN ('approved','rejected')) OR (payout.status='approved' AND command->>'status' IN ('transfer_pending','cancelled')) OR (payout.status='transfer_pending' AND command->>'status' IN ('paid','needs_review')) OR (payout.status='needs_review' AND command->>'status' IN ('paid','cancelled'))) THEN RAISE EXCEPTION 'COURIER_STATE_CONFLICT'; END IF;
    IF command->>'status'='paid' AND (length(btrim(COALESCE(command->>'transferReference','')))<3 OR length(command->>'transferReference')>200) THEN RAISE EXCEPTION 'COURIER_REFERENCE_REQUIRED'; END IF;
    IF command->>'status'='transfer_pending' AND NOT EXISTS(SELECT 1 FROM courier_bank_accounts WHERE organization_id=payout.organization_id AND version=payout.bank_version AND status='verified') THEN RAISE EXCEPTION 'COURIER_BANK_CHANGED'; END IF;
    UPDATE courier_payouts SET status=command->>'status',version=version+1,transfer_reference=CASE WHEN command->>'status'='paid' THEN btrim(command->>'transferReference') ELSE transfer_reference END,paid_at=CASE WHEN command->>'status'='paid' THEN now() ELSE paid_at END WHERE id=payout.id RETURNING * INTO payout;
    IF payout.status='paid' THEN UPDATE courier_earnings SET status='paid' WHERE id IN (SELECT earning_id FROM courier_payout_earnings WHERE payout_id=payout.id); END IF;
    IF payout.status IN ('cancelled','rejected') THEN UPDATE courier_earnings SET status='payable' WHERE id IN (SELECT earning_id FROM courier_payout_earnings WHERE payout_id=payout.id AND active); UPDATE courier_payout_earnings SET active=false WHERE payout_id=payout.id; END IF;
    target:=payout.id::text;result:=jsonb_build_object('id',payout.id,'version',payout.version,'status',payout.status,'amountMinor',payout.amount_minor,'currency',payout.currency);
  ELSE RAISE EXCEPTION 'COURIER_INVALID_COMMAND'; END IF;
  INSERT INTO courier_private_audit(actor_id,action,subject_id,version,reason) VALUES(actor_id,action,target,(result->>'version')::int,reason);
  -- Never cache private document/bank contents in the replay ledger.
  IF action NOT IN ('read_document','read_bank','read_payout_bank','scan_pass') THEN INSERT INTO courier_mutation_keys VALUES(actor_key,req,fingerprint,result,now()); END IF;
  RETURN result;
END $$;
