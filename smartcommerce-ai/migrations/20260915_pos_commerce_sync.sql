CREATE TABLE pos_sync_entities (
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  pos_entity_id TEXT NOT NULL,
  website_id TEXT NOT NULL,
  entity_version BIGINT NOT NULL CHECK (entity_version >= 0),
  payload_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  publication_state TEXT NOT NULL DEFAULT 'accepted'
    CHECK (publication_state IN ('accepted','blocked','published','failed','needs_review')),
  last_event_id TEXT NOT NULL,
  authoritative_updated_at TIMESTAMPTZ NOT NULL,
  last_synchronized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, entity_type, pos_entity_id),
  UNIQUE (website_id)
);

CREATE TABLE pos_sync_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  pos_entity_id TEXT NOT NULL,
  entity_version BIGINT NOT NULL CHECK (entity_version >= 0),
  payload_hash TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disposition TEXT NOT NULL CHECK (disposition IN ('applied','replayed','stale','conflict','blocked','failed')),
  reason TEXT NOT NULL,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX pos_sync_events_entity_idx
  ON pos_sync_events (source, entity_type, pos_entity_id, entity_version DESC);
CREATE INDEX pos_sync_events_received_idx ON pos_sync_events (received_at DESC);

CREATE TABLE pos_sync_event_attempts (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX pos_sync_event_attempts_event_idx ON pos_sync_event_attempts (event_id, received_at DESC);

CREATE TABLE pos_sync_conflicts (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  pos_entity_id TEXT NOT NULL,
  incoming_version BIGINT NOT NULL,
  current_version BIGINT,
  incoming_hash TEXT NOT NULL,
  current_hash TEXT,
  conflict_type TEXT NOT NULL,
  incoming_payload JSONB NOT NULL,
  current_payload JSONB,
  state TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (state IN ('needs_review','resolved','dismissed')),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX pos_sync_conflicts_state_idx ON pos_sync_conflicts (state, created_at DESC);

CREATE TABLE pos_sync_outbox (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  website_entity_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','transferring','accepted','failed','needs_review')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ,
  pos_reference TEXT,
  last_error_code TEXT,
  correlation_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX pos_sync_outbox_work_idx ON pos_sync_outbox (state, next_attempt_at, created_at);
CREATE OR REPLACE FUNCTION apply_pos_sync_event(
  p_event_id TEXT, p_source TEXT, p_entity_type TEXT, p_entity_id TEXT,
  p_entity_version BIGINT, p_payload_hash TEXT, p_payload JSONB,
  p_dependencies JSONB, p_occurred_at TIMESTAMPTZ, p_correlation_id TEXT
) RETURNS TABLE(disposition TEXT, website_id TEXT, current_version BIGINT, current_hash TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_entity pos_sync_entities%ROWTYPE;
  v_event pos_sync_events%ROWTYPE;
  v_website_id TEXT;
  v_existing BOOLEAN := FALSE;
  v_missing_dependency JSONB;
  v_category_cycle BOOLEAN := FALSE;
  v_parent_id TEXT;
BEGIN
  IF p_event_id = '' OR p_entity_id = '' OR p_entity_version < 0 THEN
    RAISE EXCEPTION 'invalid sync envelope';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('event:' || p_event_id, 0));
  -- Reparenting distinct categories must observe committed hierarchy changes.
  -- Take the source hierarchy lock before entity locks to avoid write skew.
  IF p_entity_type = 'category' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('category-hierarchy:' || p_source, 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_source || ':' || p_entity_type || ':' || p_entity_id, 0));
  INSERT INTO pos_sync_event_attempts (event_id, payload_hash) VALUES (p_event_id, p_payload_hash);

  SELECT * INTO v_event FROM pos_sync_events WHERE event_id = p_event_id;
  IF FOUND THEN
    IF v_event.source = p_source AND v_event.entity_type = p_entity_type
       AND v_event.pos_entity_id = p_entity_id AND v_event.entity_version = p_entity_version
       AND v_event.payload_hash = p_payload_hash THEN
      IF v_event.disposition <> 'blocked' THEN
        RETURN QUERY SELECT
          CASE WHEN v_event.disposition IN ('applied','replayed') THEN 'replayed' ELSE v_event.disposition END,
          e.website_id, e.entity_version, e.payload_hash
          FROM (SELECT 1) AS receipt
          LEFT JOIN pos_sync_entities e
            ON e.source = p_source AND e.entity_type = p_entity_type AND e.pos_entity_id = p_entity_id;
        RETURN;
      END IF;
      DELETE FROM pos_sync_events WHERE event_id = p_event_id AND disposition = 'blocked';
    ELSE
      INSERT INTO pos_sync_conflicts (
        event_id, source, entity_type, pos_entity_id, incoming_version,
        current_version, incoming_hash, current_hash, conflict_type,
        incoming_payload, current_payload
      ) VALUES (
        p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
        v_event.entity_version, p_payload_hash, v_event.payload_hash, 'event_id_collision',
        p_payload, NULL
      );
      RETURN QUERY SELECT 'conflict', NULL::TEXT, v_event.entity_version, v_event.payload_hash;
      RETURN;
    END IF;
  END IF;
  SELECT * INTO v_entity
  FROM pos_sync_entities
  WHERE source = p_source AND entity_type = p_entity_type AND pos_entity_id = p_entity_id
  FOR UPDATE;
  v_existing := FOUND;

  IF v_existing AND p_entity_version < v_entity.entity_version THEN
    INSERT INTO pos_sync_events VALUES (
      p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
      p_payload_hash, p_correlation_id, p_occurred_at, NOW(),
      'stale', 'older_version', '{}'::jsonb
    );
    RETURN QUERY SELECT 'stale', v_entity.website_id, v_entity.entity_version, v_entity.payload_hash;
    RETURN;
  END IF;

  IF v_existing AND p_entity_version = v_entity.entity_version THEN
    IF p_payload_hash = v_entity.payload_hash THEN
      INSERT INTO pos_sync_events VALUES (
        p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
        p_payload_hash, p_correlation_id, p_occurred_at, NOW(),
        'replayed', 'identical_version_payload', '{}'::jsonb
      );
      RETURN QUERY SELECT 'replayed', v_entity.website_id, v_entity.entity_version, v_entity.payload_hash;
      RETURN;
    END IF;

    INSERT INTO pos_sync_events VALUES (
      p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
      p_payload_hash, p_correlation_id, p_occurred_at, NOW(),
      'conflict', 'same_version_conflict', '{}'::jsonb
    );
    INSERT INTO pos_sync_conflicts (
      event_id, source, entity_type, pos_entity_id, incoming_version,
      current_version, incoming_hash, current_hash, conflict_type,
      incoming_payload, current_payload
    ) VALUES (
      p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
      v_entity.entity_version, p_payload_hash, v_entity.payload_hash,
      'same_version_conflict', p_payload, v_entity.payload
    );
    RETURN QUERY SELECT 'conflict', v_entity.website_id, v_entity.entity_version, v_entity.payload_hash;
    RETURN;
  END IF;

  IF p_entity_type = 'category' THEN
    v_parent_id := NULLIF(p_payload->>'parentId', '');
    IF v_parent_id = p_entity_id THEN
      v_category_cycle := TRUE;
    ELSIF v_parent_id IS NOT NULL THEN
      WITH RECURSIVE ancestors(id) AS (
        SELECT v_parent_id
        UNION
        SELECT NULLIF(e.payload->>'parentId', '')
        FROM pos_sync_entities e
        JOIN ancestors a ON e.pos_entity_id = a.id
        WHERE e.source = p_source AND e.entity_type = 'category' AND a.id IS NOT NULL
      )
      SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = p_entity_id) INTO v_category_cycle;
    END IF;
    IF v_category_cycle THEN
      INSERT INTO pos_sync_events VALUES (
        p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
        p_payload_hash, p_correlation_id, p_occurred_at, NOW(),
        'conflict', 'category_cycle', '{}'::jsonb
      );
      INSERT INTO pos_sync_conflicts (
        event_id, source, entity_type, pos_entity_id, incoming_version,
        current_version, incoming_hash, current_hash, conflict_type,
        incoming_payload, current_payload
      ) VALUES (
        p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
        CASE WHEN v_existing THEN v_entity.entity_version ELSE NULL END,
        p_payload_hash, CASE WHEN v_existing THEN v_entity.payload_hash ELSE NULL END,
        'category_cycle', p_payload, CASE WHEN v_existing THEN v_entity.payload ELSE NULL END
      );
      RETURN QUERY SELECT 'conflict', CASE WHEN v_existing THEN v_entity.website_id ELSE NULL END,
        CASE WHEN v_existing THEN v_entity.entity_version ELSE NULL END,
        CASE WHEN v_existing THEN v_entity.payload_hash ELSE NULL END;
      RETURN;
    END IF;
  END IF;

  SELECT dependency INTO v_missing_dependency
  FROM jsonb_array_elements(p_dependencies) AS dependency
  WHERE NOT EXISTS (
    SELECT 1 FROM pos_sync_entities e
    WHERE e.source = p_source
      AND e.entity_type = dependency->>'entityType'
      AND e.pos_entity_id = dependency->>'entityId'
      AND e.publication_state IN ('accepted','published')
  )
  LIMIT 1;

  IF v_missing_dependency IS NOT NULL THEN
    INSERT INTO pos_sync_events VALUES (
      p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
      p_payload_hash, p_correlation_id, p_occurred_at, NOW(),
      'blocked', 'missing_dependency', jsonb_build_object('missingDependency', v_missing_dependency)
    );
    RETURN QUERY SELECT 'blocked', CASE WHEN v_existing THEN v_entity.website_id ELSE NULL END,
      CASE WHEN v_existing THEN v_entity.entity_version ELSE NULL END,
      CASE WHEN v_existing THEN v_entity.payload_hash ELSE NULL END;
    RETURN;
  END IF;

  IF v_existing THEN
    UPDATE pos_sync_entities
    SET entity_version = p_entity_version,
        payload_hash = p_payload_hash,
        payload = p_payload,
        publication_state = 'accepted',
        last_event_id = p_event_id,
        authoritative_updated_at = p_occurred_at,
        last_synchronized_at = NOW()
    WHERE source = p_source AND entity_type = p_entity_type AND pos_entity_id = p_entity_id
    RETURNING pos_sync_entities.website_id INTO v_website_id;
  ELSE
    v_website_id := 'web_' || p_entity_type || '_' || substr(md5(p_source || ':' || p_entity_id), 1, 24);
    INSERT INTO pos_sync_entities (
      source, entity_type, pos_entity_id, website_id, entity_version,
      payload_hash, payload, last_event_id, authoritative_updated_at
    ) VALUES (
      p_source, p_entity_type, p_entity_id, v_website_id, p_entity_version,
      p_payload_hash, p_payload, p_event_id, p_occurred_at
    );
  END IF;

  INSERT INTO pos_sync_events VALUES (
    p_event_id, p_source, p_entity_type, p_entity_id, p_entity_version,
    p_payload_hash, p_correlation_id, p_occurred_at, NOW(),
    'applied', CASE WHEN v_existing THEN 'newer_version' ELSE 'new_entity' END, '{}'::jsonb
  );

  RETURN QUERY SELECT 'applied', v_website_id, p_entity_version, p_payload_hash;
END;
$$;

COMMENT ON FUNCTION apply_pos_sync_event IS
  'Atomically admits POS events with replay, stale-write and same-version conflict protection.';
