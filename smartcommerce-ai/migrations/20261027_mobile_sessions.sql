-- Additive native session storage; no production activation or cookie-session changes.
BEGIN;
CREATE TABLE mobile_sessions (
 id text PRIMARY KEY,
 customer_id text NOT NULL REFERENCES customer_accounts(id),
 audience text NOT NULL CHECK(audience IN ('customer','courier')),
 device_id text NOT NULL CHECK(length(device_id) BETWEEN 1 AND 200),
 credential_stamp text NOT NULL,
 access_hash text NOT NULL UNIQUE,
 access_expires_at timestamptz NOT NULL,
 refresh_expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mobile_sessions_account ON mobile_sessions(customer_id);
CREATE TABLE mobile_refresh_credentials (
 token_hash text PRIMARY KEY,
 session_id text NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mobile_refresh_session ON mobile_refresh_credentials(session_id);

-- Lock the family before checking consumption. A replay revokes the family and
-- RETURNS, rather than raising an exception which would roll back revocation.
CREATE FUNCTION mobile_rotate_refresh(old_hash text, requested_audience text, next_access_hash text, next_refresh_hash text)
RETURNS TABLE(session_id text) LANGUAGE plpgsql AS $$
DECLARE family mobile_sessions%ROWTYPE; consumed timestamptz; family_id text; stamp text;
BEGIN
 SELECT r.session_id INTO family_id FROM mobile_refresh_credentials r WHERE r.token_hash=old_hash;
 IF family_id IS NULL THEN RETURN; END IF;
 SELECT s.* INTO family FROM mobile_sessions s WHERE s.id=family_id FOR UPDATE;
 IF family.audience<>requested_audience OR family.revoked_at IS NOT NULL OR family.refresh_expires_at<=now() THEN RETURN; END IF;
 SELECT c.password_hash INTO stamp FROM customer_accounts c WHERE c.id=family.customer_id;
 IF stamp IS DISTINCT FROM family.credential_stamp OR EXISTS(SELECT 1 FROM customer_authenticators a WHERE a.customer_id=family.customer_id AND a.status='active' AND a.revoked_at IS NULL) THEN
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
CREATE FUNCTION mobile_revoke_account_sessions(account text, keep_browser_session text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE mobile_sessions SET revoked_at=now() WHERE customer_id=account AND revoked_at IS NULL;
 UPDATE customer_sessions SET revoked_at=now() WHERE customer_id=account AND (keep_browser_session IS NULL OR id<>keep_browser_session) AND revoked_at IS NULL;
 UPDATE courier_sessions SET revoked_at=now() WHERE account_id=account AND revoked_at IS NULL;
END;
$$;
COMMIT;
