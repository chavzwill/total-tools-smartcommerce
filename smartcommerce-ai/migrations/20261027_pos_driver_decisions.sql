-- Additive receiving-side projection only. Existing POS-only courier guards remain.
CREATE TABLE IF NOT EXISTS mobile_pos_driver_decisions (
 driver_id uuid PRIMARY KEY REFERENCES courier_drivers(id),
 organization_id uuid NOT NULL REFERENCES courier_organizations(id), account_id text NOT NULL,
 pos_driver_id text NOT NULL UNIQUE, pos_organization_id text NOT NULL,
 entity_version bigint NOT NULL CHECK(entity_version>0), payload_hash text NOT NULL,
 organization_status text NOT NULL CHECK(organization_status IN ('approved','suspended','rejected')),
 driver_status text NOT NULL CHECK(driver_status IN ('approved','suspended','revoked')),
 valid_until timestamptz NOT NULL, occurred_at timestamptz NOT NULL,
 actor_id text NOT NULL, reason text NOT NULL, event_id text NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mobile_pos_driver_events (
 event_id text PRIMARY KEY, event_hash text NOT NULL, disposition text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mobile_pos_driver_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_id text NOT NULL,
 driver_id uuid NOT NULL, entity_version bigint NOT NULL, disposition text NOT NULL,
 actor_id text NOT NULL, reason text NOT NULL, correlation_id text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION mobile_apply_pos_driver_decision(e jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 p jsonb:=e->'payload'; d uuid:=(p->>'driverId')::uuid; org uuid:=(p->>'organizationId')::uuid;
 v bigint:=(e->>'entityVersion')::bigint; result text; prior mobile_pos_driver_events; current_row mobile_pos_driver_decisions;
 eh text:=encode(sha256(convert_to(e::text,'UTF8')),'hex'); ph text:=encode(sha256(convert_to((e-'eventId'-'correlationId')::text,'UTF8')),'hex');
BEGIN
 -- Shared ingestion lock serializes event IDs, POS identity uniqueness and versions.
 PERFORM pg_advisory_xact_lock(hashtextextended('mobile_pos_driver_ingestion',0));
 SELECT * INTO prior FROM mobile_pos_driver_events WHERE event_id=e->>'eventId';
 IF FOUND AND (prior.event_hash<>eh OR prior.disposition<>'blocked') THEN result:=CASE WHEN prior.event_hash=eh THEN CASE WHEN prior.disposition IN ('conflict','stale','blocked') THEN prior.disposition ELSE 'replayed' END ELSE 'conflict' END;
 ELSE
  SELECT * INTO current_row FROM mobile_pos_driver_decisions WHERE driver_id=d FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM courier_drivers cd WHERE cd.id=d AND cd.organization_id=org AND cd.account_id=p->>'accountId') THEN result:='blocked';
  ELSIF current_row.driver_id IS NOT NULL AND (current_row.pos_driver_id<>e->>'entityId' OR current_row.pos_organization_id<>p->>'posOrganizationId' OR current_row.organization_id<>org OR current_row.account_id<>p->>'accountId') THEN result:='conflict';
  ELSIF EXISTS(SELECT 1 FROM mobile_pos_driver_decisions WHERE pos_driver_id=e->>'entityId' AND driver_id<>d) THEN result:='conflict';
  ELSIF current_row.entity_version>v THEN result:='stale';
  ELSIF current_row.entity_version=v THEN result:=CASE WHEN current_row.payload_hash=ph THEN 'replayed' ELSE 'conflict' END;
  ELSE
   INSERT INTO mobile_pos_driver_decisions(driver_id,organization_id,account_id,pos_driver_id,pos_organization_id,entity_version,payload_hash,organization_status,driver_status,valid_until,occurred_at,actor_id,reason,event_id)
    VALUES(d,org,p->>'accountId',e->>'entityId',p->>'posOrganizationId',v,ph,p->>'organizationStatus',p->>'driverStatus',(p->>'validUntil')::timestamptz,(e->>'occurredAt')::timestamptz,p->>'actorId',p->>'reason',e->>'eventId')
    ON CONFLICT(driver_id) DO UPDATE SET entity_version=excluded.entity_version,payload_hash=excluded.payload_hash,organization_status=excluded.organization_status,driver_status=excluded.driver_status,valid_until=excluded.valid_until,occurred_at=excluded.occurred_at,actor_id=excluded.actor_id,reason=excluded.reason,event_id=excluded.event_id,received_at=now();
   result:='applied';
  END IF;
  -- Retain identity even when dependencies are missing; exact blocked retries recheck.
  INSERT INTO mobile_pos_driver_events(event_id,event_hash,disposition) VALUES(e->>'eventId',eh,result)
   ON CONFLICT(event_id) DO UPDATE SET disposition=excluded.disposition;
 END IF;
 INSERT INTO mobile_pos_driver_audit(event_id,driver_id,entity_version,disposition,actor_id,reason,correlation_id) VALUES(e->>'eventId',d,v,result,p->>'actorId',p->>'reason',e->>'correlationId');
 RETURN jsonb_build_object('disposition',result);
END $$;
CREATE OR REPLACE FUNCTION mobile_pos_driver_decision(account text,at_time timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('state',CASE WHEN NOT d.active THEN 'inactive' WHEN p.organization_status<>'approved' THEN p.organization_status WHEN p.driver_status<>'approved' THEN p.driver_status WHEN p.valid_until<=at_time THEN 'expired' ELSE 'approved' END,
  'version',p.entity_version,'validUntil',p.valid_until,'canUpdate',false)
 FROM mobile_pos_driver_decisions p JOIN courier_drivers d ON d.id=p.driver_id AND d.organization_id=p.organization_id AND d.account_id=p.account_id
 WHERE p.account_id=account;
$$;
-- Only the trusted server database role may call these; no API/client grants.
REVOKE ALL ON mobile_pos_driver_decisions,mobile_pos_driver_events,mobile_pos_driver_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION mobile_apply_pos_driver_decision(jsonb),mobile_pos_driver_decision(text,timestamptz) FROM PUBLIC;
