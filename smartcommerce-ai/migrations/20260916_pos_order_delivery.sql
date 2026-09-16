-- Apply after 20260915_pos_commerce_sync.sql. Duplicate existing order identities
-- intentionally fail this migration; reconcile them before enabling delivery.
ALTER TABLE pos_sync_outbox ADD COLUMN lease_token TEXT;
ALTER TABLE pos_sync_outbox ADD COLUMN lease_expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX pos_order_outbox_identity ON pos_sync_outbox(website_entity_id)
  WHERE operation='order.create' AND entity_type='order';
CREATE TABLE pos_order_delivery_attempts (
  outbox_id TEXT NOT NULL REFERENCES pos_sync_outbox(id),
  attempt INTEGER NOT NULL,
  lease_token TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  outcome TEXT,
  error_code TEXT,
  PRIMARY KEY(outbox_id, attempt)
);

CREATE FUNCTION protect_pos_outbox_payload() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.operation,NEW.entity_type,NEW.website_entity_id,NEW.idempotency_key,NEW.payload,NEW.correlation_id)
     IS DISTINCT FROM ROW(OLD.id,OLD.operation,OLD.entity_type,OLD.website_entity_id,OLD.idempotency_key,OLD.payload,OLD.correlation_id) THEN
    RAISE EXCEPTION 'POS_OUTBOX_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pos_outbox_payload_immutable BEFORE UPDATE ON pos_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION protect_pos_outbox_payload();

CREATE FUNCTION enqueue_pos_operation(p_id TEXT,p_operation TEXT,p_entity_type TEXT,p_website_id TEXT,
  p_key TEXT,p_payload JSONB,p_correlation TEXT)
RETURNS TABLE(created BOOLEAN,id TEXT,state TEXT) LANGUAGE plpgsql AS $$
DECLARE v_row pos_sync_outbox%ROWTYPE;
BEGIN
  -- Serialize repeated request keys before comparing immutable intent.
  PERFORM pg_advisory_xact_lock(hashtextextended('pos-outbox:' || p_key,0));
  SELECT * INTO v_row FROM pos_sync_outbox o WHERE o.idempotency_key=p_key;
  IF FOUND THEN
    IF v_row.operation<>p_operation OR v_row.entity_type<>p_entity_type
      OR v_row.website_entity_id<>p_website_id OR v_row.payload<>p_payload THEN
      RAISE EXCEPTION 'POS_OUTBOX_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT FALSE,v_row.id,v_row.state;
    RETURN;
  END IF;
  INSERT INTO pos_sync_outbox(id,operation,entity_type,website_entity_id,idempotency_key,payload,correlation_id)
    VALUES(p_id,p_operation,p_entity_type,p_website_id,p_key,p_payload,p_correlation);
  RETURN QUERY SELECT TRUE,p_id,'pending'::TEXT;
END;
$$;

CREATE FUNCTION claim_pos_order_delivery(p_token TEXT) RETURNS SETOF pos_sync_outbox LANGUAGE plpgsql AS $$
DECLARE v_row pos_sync_outbox%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token)=0 THEN RAISE EXCEPTION 'POS_ORDER_LEASE_REQUIRED'; END IF;
  SELECT * INTO v_row FROM pos_sync_outbox
    WHERE operation='order.create' AND entity_type='order'
      AND ((state='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=NOW()))
        OR (state='transferring' AND (lease_expires_at IS NULL OR lease_expires_at<=NOW())))
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE pos_order_delivery_attempts SET finished_at=NOW(),outcome='lease_expired'
    WHERE outbox_id=v_row.id AND finished_at IS NULL;
  UPDATE pos_sync_outbox SET state='transferring',attempts=attempts+1,
    lease_token=p_token,lease_expires_at=NOW()+INTERVAL '2 minutes',updated_at=NOW()
    WHERE id=v_row.id RETURNING * INTO v_row;
  INSERT INTO pos_order_delivery_attempts(outbox_id,attempt,lease_token) VALUES(v_row.id,v_row.attempts,p_token);
  RETURN NEXT v_row;
END;
$$;

CREATE FUNCTION finish_pos_order_delivery(p_id TEXT,p_token TEXT,p_state TEXT,p_reference TEXT,p_error TEXT,p_delay INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE v_attempt INTEGER;
BEGIN
  IF p_state NOT IN ('pending','accepted','failed','needs_review') OR p_state IS NULL
    OR (p_state='accepted' AND (p_reference IS NULL OR p_reference !~ '^[1-9][0-9]*$'))
    OR (p_error IS NOT NULL AND p_error !~ '^POS_ORDER_[A-Z0-9_]+$')
    OR p_delay IS NULL OR p_delay<0 OR p_delay>3600 THEN
    RAISE EXCEPTION 'POS_ORDER_INVALID_COMPLETION';
  END IF;
  UPDATE pos_sync_outbox SET state=p_state,pos_reference=p_reference,last_error_code=p_error,
    next_attempt_at=CASE WHEN p_state='pending' THEN NOW()+make_interval(secs=>p_delay) ELSE NULL END,
    lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
    WHERE id=p_id AND state='transferring' AND lease_token=p_token AND lease_expires_at>NOW()
    RETURNING attempts INTO v_attempt;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE pos_order_delivery_attempts SET finished_at=NOW(),outcome=p_state,error_code=p_error
    WHERE outbox_id=p_id AND attempt=v_attempt AND lease_token=p_token;
  RETURN TRUE;
END;
$$;
