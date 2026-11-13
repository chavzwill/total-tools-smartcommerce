BEGIN;
ALTER TABLE mobile_sessions ADD COLUMN mfa_stamp text;
CREATE TABLE mobile_totp_counters(authenticator_id text PRIMARY KEY,last_counter bigint NOT NULL);
CREATE FUNCTION mobile_factor_stamp(account text) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT md5(COALESCE(jsonb_agg(jsonb_build_array(a.id,a.authenticator_type,a.secret_encrypted) ORDER BY a.id)::text,'[]')) FROM customer_authenticators a WHERE a.customer_id=account AND a.status='active' AND a.revoked_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION mobile_rotate_refresh(old_hash text, requested_audience text, next_access_hash text, next_refresh_hash text)
RETURNS TABLE(session_id text) LANGUAGE plpgsql AS $$
DECLARE family mobile_sessions%ROWTYPE; consumed timestamptz; family_id text; stamp text;
BEGIN
 SELECT r.session_id INTO family_id FROM mobile_refresh_credentials r WHERE r.token_hash=old_hash;
 IF family_id IS NULL THEN RETURN; END IF;
 SELECT s.* INTO family FROM mobile_sessions s WHERE s.id=family_id FOR UPDATE;
 IF family.audience<>requested_audience OR family.revoked_at IS NOT NULL OR family.refresh_expires_at<=now() THEN RETURN; END IF;
 SELECT c.password_hash INTO stamp FROM customer_accounts c WHERE c.id=family.customer_id;
 IF stamp IS DISTINCT FROM family.credential_stamp OR (family.mfa_stamp IS NOT NULL AND family.mfa_stamp<>mobile_factor_stamp(family.customer_id)) OR (family.mfa_stamp IS NULL AND EXISTS(SELECT 1 FROM customer_authenticators a WHERE a.customer_id=family.customer_id AND a.status='active' AND a.revoked_at IS NULL)) THEN
  UPDATE mobile_sessions SET revoked_at=now() WHERE id=family_id; RETURN;
 END IF;
 SELECT r.consumed_at INTO consumed FROM mobile_refresh_credentials r WHERE r.token_hash=old_hash;
 IF consumed IS NOT NULL THEN
  UPDATE mobile_sessions SET revoked_at=now() WHERE id=family_id; RETURN;
 END IF;
 UPDATE mobile_refresh_credentials SET consumed_at=now() WHERE token_hash=old_hash;
 INSERT INTO mobile_refresh_credentials(token_hash,session_id) VALUES(next_refresh_hash,family_id);
 UPDATE mobile_sessions SET access_hash=next_access_hash,access_expires_at=LEAST(now()+interval '15 minutes',refresh_expires_at) WHERE id=family_id;
 RETURN QUERY SELECT family_id;
END;
$$;
COMMIT;
