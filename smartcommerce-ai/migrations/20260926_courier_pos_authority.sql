-- POS ingestion is deliberately not implemented here. There is no local override.
-- Preserve historical decisions; they are not proof of POS verification.
CREATE OR REPLACE VIEW courier_available_services AS SELECT s.* FROM courier_services s WHERE false;
CREATE OR REPLACE FUNCTION courier_registration_pos_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IN ('approved','rejected','suspended') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'COURIER_POS_AUTHORITY_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_registration_pos_authority ON courier_organizations;
CREATE TRIGGER courier_registration_pos_authority BEFORE INSERT OR UPDATE OF status ON courier_organizations FOR EACH ROW EXECUTE FUNCTION courier_registration_pos_only();
CREATE OR REPLACE FUNCTION courier_identity_pos_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IN ('verified','rejected','revoked') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'COURIER_POS_AUTHORITY_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_identity_pos_authority ON courier_identity_documents;
CREATE TRIGGER courier_identity_pos_authority BEFORE INSERT OR UPDATE OF status ON courier_identity_documents FOR EACH ROW EXECUTE FUNCTION courier_identity_pos_only();
CREATE OR REPLACE FUNCTION courier_pos_connection_required() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'COURIER_POS_VERIFICATION_PENDING'; END $$;
DROP TRIGGER IF EXISTS courier_pass_pos_required ON courier_pickup_passes;
CREATE TRIGGER courier_pass_pos_required BEFORE INSERT ON courier_pickup_passes FOR EACH ROW EXECUTE FUNCTION courier_pos_connection_required();
DROP TRIGGER IF EXISTS courier_dispatch_pos_required ON courier_dispatch_jobs;
CREATE TRIGGER courier_dispatch_pos_required BEFORE INSERT ON courier_dispatch_jobs FOR EACH ROW EXECUTE FUNCTION courier_pos_connection_required();
-- Existing pickups and locally approved drivers predate POS authority. They cannot
-- create new delivery state or events until the POS verification feed is connected.
DROP TRIGGER IF EXISTS courier_delivery_state_pos_required ON courier_delivery_state;
CREATE TRIGGER courier_delivery_state_pos_required BEFORE INSERT OR UPDATE ON courier_delivery_state FOR EACH ROW EXECUTE FUNCTION courier_pos_connection_required();
DROP TRIGGER IF EXISTS courier_delivery_events_pos_required ON courier_delivery_events;
CREATE TRIGGER courier_delivery_events_pos_required BEFORE INSERT ON courier_delivery_events FOR EACH ROW EXECUTE FUNCTION courier_pos_connection_required();
DROP TRIGGER IF EXISTS courier_delivery_proofs_pos_required ON courier_delivery_proofs;
CREATE TRIGGER courier_delivery_proofs_pos_required BEFORE INSERT OR UPDATE ON courier_delivery_proofs FOR EACH ROW EXECUTE FUNCTION courier_pos_connection_required();
-- Bank verification and all staff payout transitions are POS-owned.
DROP TRIGGER IF EXISTS courier_bank_pos_authority ON courier_bank_accounts;
CREATE TRIGGER courier_bank_pos_authority BEFORE INSERT OR UPDATE OF status ON courier_bank_accounts FOR EACH ROW EXECUTE FUNCTION courier_identity_pos_only();
CREATE OR REPLACE FUNCTION courier_payout_pos_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status <> 'pending_review' AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN RAISE EXCEPTION 'COURIER_POS_AUTHORITY_REQUIRED'; END IF;
 IF TG_OP='UPDATE' AND (NEW.transfer_reference IS DISTINCT FROM OLD.transfer_reference OR NEW.paid_at IS DISTINCT FROM OLD.paid_at) THEN RAISE EXCEPTION 'COURIER_POS_AUTHORITY_REQUIRED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS courier_payout_pos_authority ON courier_payouts;
CREATE TRIGGER courier_payout_pos_authority BEFORE INSERT OR UPDATE ON courier_payouts FOR EACH ROW EXECUTE FUNCTION courier_payout_pos_only();
