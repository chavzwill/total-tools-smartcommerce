import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const url=process.env.COURIER_TEST_DATABASE_URL,parsed=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname)&&parsed.pathname==='/courier_test');
const migration=await readFile(new URL('../migrations/20260926_courier_pos_authority.sql',import.meta.url),'utf8');
// Roll back the isolation test so earlier migration regressions can keep testing historical contracts.
const checks=`DO $$ BEGIN
IF EXISTS(SELECT 1 FROM courier_available_services) THEN RAISE EXCEPTION 'Legacy services still eligible'; END IF;
BEGIN UPDATE courier_organizations SET status='rejected' WHERE id=(SELECT id FROM courier_organizations WHERE status<>'rejected' LIMIT 1); RAISE EXCEPTION 'Local decision permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_AUTHORITY_REQUIRED' THEN RAISE; END IF; END;
BEGIN INSERT INTO courier_identity_documents(id,account_id,kind,mime,encrypted,status) VALUES(gen_random_uuid(),'pos-gate-test','identity','image/png','{}','verified'); RAISE EXCEPTION 'Local identity verification permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_AUTHORITY_REQUIRED' THEN RAISE; END IF; END;
BEGIN INSERT INTO courier_pickup_passes(token_hash,driver_id,expires_at) VALUES('pos-gate-test',gen_random_uuid(),now()); RAISE EXCEPTION 'Pass permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_VERIFICATION_PENDING' THEN RAISE; END IF; END;
BEGIN INSERT INTO courier_delivery_state(pickup_id,status,version) VALUES(gen_random_uuid(),'in_transit',1); RAISE EXCEPTION 'Legacy delivery update permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_VERIFICATION_PENDING' THEN RAISE; END IF; END;
BEGIN INSERT INTO courier_delivery_events(pickup_id,version,event,stage,actor_id,reported_at) VALUES(gen_random_uuid(),1,'in_transit','in_transit','test',now()); RAISE EXCEPTION 'Legacy delivery event permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_VERIFICATION_PENDING' THEN RAISE; END IF; END;
BEGIN INSERT INTO courier_delivery_proofs(pickup_id,encrypted,fingerprint,mime,created_by) VALUES(gen_random_uuid(),'{}','test','image/png','test'); RAISE EXCEPTION 'Legacy delivery proof permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_VERIFICATION_PENDING' THEN RAISE; END IF; END;
BEGIN INSERT INTO courier_bank_accounts(organization_id,encrypted,masked,status) VALUES(gen_random_uuid(),'{}','test','verified'); RAISE EXCEPTION 'Local bank approval permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_AUTHORITY_REQUIRED' THEN RAISE; END IF; END;
BEGIN INSERT INTO courier_payouts(id,organization_id,currency,amount_minor,bank_version,bank_snapshot,status) VALUES(gen_random_uuid(),gen_random_uuid(),'JMD',100,1,'{}','paid'); RAISE EXCEPTION 'Local payout permitted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'COURIER_POS_AUTHORITY_REQUIRED' THEN RAISE; END IF; END;
END $$;`;
await promisify(execFile)(process.env.PSQL_PATH||'psql',['-X','-q','-w','-v','ON_ERROR_STOP=1','-c','BEGIN;'+migration+checks+'ROLLBACK;','-d',url]);
console.log('Database blocks local registration decisions, identity verification, legacy eligibility and pickup-pass issuance until POS integration.');
