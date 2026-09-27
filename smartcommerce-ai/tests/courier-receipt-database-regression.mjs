import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
const url=process.env.COURIER_TEST_DATABASE_URL,parsed=new URL(url);
assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname)&&parsed.pathname==='/courier_test');
const exec=promisify(execFile);
async function sql(query){try{return (await exec(process.env.PSQL_PATH||'psql',['-X','-q','-t','-A','-w','-v','ON_ERROR_STOP=1','-c',query,'-d',url],{timeout:15000})).stdout.trim();}catch(error){throw new Error(error.stderr||'Local database command failed');}}
const id=()=>crypto.randomUUID(),owner=id(),customer=id(),outsider=id(),org=id(),driver=id(),pickup=id(),problemPickup=id();
const json=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
await sql(await readFile(new URL('../migrations/20260928_courier_receipt.sql',import.meta.url),'utf8'));
await sql(`INSERT INTO customer_accounts(id) VALUES ('${owner}'),('${customer}'),('${outsider}');
INSERT INTO courier_organizations(id,owner_customer_id,profile) VALUES ('${org}','${owner}','{}');
INSERT INTO courier_drivers(id,organization_id,account_id) VALUES ('${driver}','${org}','${owner}');
INSERT INTO courier_pickups(id,driver_id,organization_id,order_id,order_number,branch_id,items,destination,source_reference,customer_account_id,status,collected_at) VALUES
('${pickup}','${driver}','${org}','receipt-${pickup}','ORDER-RECEIPT','branch','[{"name":"Parcel","quantity":1}]','{"address":"Customer address"}','trusted-test','${customer}','collected',now()),
('${problemPickup}','${driver}','${org}','receipt-${problemPickup}','ORDER-PROBLEM','branch','[{"name":"Parcel","quantity":1}]','{"address":"Customer address"}','trusted-test','${customer}','collected',now());
INSERT INTO courier_delivery_state(pickup_id,status,version) VALUES ('${pickup}','delivered',3),('${problemPickup}','delivered',3);
INSERT INTO courier_delivery_proofs(pickup_id,encrypted,fingerprint,mime,created_by) VALUES ('${pickup}','{}','proof','image/png','${owner}'),('${problemPickup}','{}','proof','image/png','${owner}');`);
const command=(which,action,reason)=>({action,id:which,idempotencyKey:id(),expectedVersion:0,...(reason?{reason}:{})});
const actor={kind:'owner',customerId:customer};
const receipt=(who,cmd)=>sql(`SELECT courier_customer_receipt(${json(who)},${json(cmd)})`).then(JSON.parse);
const customerBefore=JSON.parse(await sql(`SELECT courier_delivery_read(${json(actor)},'customer',NULL)`));
assert.equal(customerBefore.deliveries.find(d=>d.id===pickup).canConfirm,true);
await sql(`INSERT INTO smartcommerce_payment_orders(id,customer_id,checkout_quote_id,amount_minor,currency,fulfillment_reference,reserved_until,status,session_id) VALUES
('receipt-${pickup}','${customer}','quote-${pickup}',1000,'JMD','paid-order',now()+interval '1 hour','paid','session-${pickup}'),
('receipt-${problemPickup}','${customer}','quote-${problemPickup}',1000,'JMD','paid-order',now()+interval '1 hour','paid','session-${problemPickup}');
INSERT INTO courier_earnings(id,organization_id,booking_id,payment_reference,delivery_reference,currency,amount_minor,status) VALUES
('${id()}','${org}','receipt-${pickup}','session-${pickup}','${pickup}','JMD',500,'held'),
('${id()}','${org}','receipt-${problemPickup}','session-${problemPickup}','${problemPickup}','JMD',500,'held');`);
await assert.rejects(()=>sql(`UPDATE courier_earnings SET status='payable' WHERE booking_id='receipt-${pickup}'`),/COURIER_EARNING_NOT_VERIFIED/);
await assert.rejects(()=>receipt({kind:'owner',customerId:outsider},command(pickup,'confirm_receipt')),/COURIER_NOT_FOUND/);
const accepted=command(pickup,'confirm_receipt');
assert.equal((await receipt(actor,accepted)).status,'accepted');
assert.equal((await receipt(actor,accepted)).status,'accepted');
await assert.rejects(()=>receipt(actor,command(pickup,'report_problem','damaged')),/COURIER_STATE_CONFLICT/);
assert.equal((await receipt(actor,command(problemPickup,'report_problem','damaged'))).status,'problem_reported');
await sql(`UPDATE courier_earnings SET status='payable' WHERE booking_id='receipt-${pickup}'`);
await assert.rejects(()=>sql(`UPDATE courier_earnings SET status='payable' WHERE booking_id='receipt-${problemPickup}'`),/COURIER_EARNING_NOT_VERIFIED/);
const payout=id(),problemPayout=id();
await sql(`INSERT INTO courier_payouts(id,organization_id,currency,amount_minor,bank_version,bank_snapshot,status) VALUES ('${payout}','${org}','JMD',500,1,'{}','pending_review'),('${problemPayout}','${org}','JMD',500,1,'{}','pending_review')`);
await assert.rejects(()=>sql(`UPDATE courier_payouts SET status='paid' WHERE id='${payout}'`),/COURIER_EARNING_NOT_VERIFIED/);
await sql(`INSERT INTO courier_payout_earnings(payout_id,earning_id) SELECT '${payout}',id FROM courier_earnings WHERE booking_id='receipt-${pickup}'`);
await assert.rejects(()=>sql(`INSERT INTO courier_payout_earnings(payout_id,earning_id) SELECT '${problemPayout}',id FROM courier_earnings WHERE booking_id='receipt-${problemPickup}'`),/COURIER_EARNING_NOT_VERIFIED/);
const read=JSON.parse(await sql(`SELECT courier_delivery_read(${json(actor)},'customer',NULL)`));
assert.equal(read.deliveries.find(d=>d.id===pickup).receiptStatus,'accepted');
assert.equal(read.deliveries.find(d=>d.id===problemPickup).receiptStatus,'problem_reported');
assert.equal(read.deliveries.find(d=>d.id===pickup).canConfirm,false);
const courierRead=JSON.parse(await sql(`SELECT courier_delivery_read(${json({kind:'owner',customerId:owner})},'courier',NULL)`));
const staffRead=JSON.parse(await sql(`SELECT courier_delivery_read(${json({kind:'staff',employeeId:'branch-reviewer',permissions:{couriers_pickup:true},branchIds:['branch']})},'staff',NULL)`));
assert.equal(courierRead.deliveries.find(d=>d.id===pickup).receiptStatus,'accepted');
assert.equal(staffRead.deliveries.find(d=>d.id===problemPickup).receiptStatus,'problem_reported');
console.log('Only the owning customer can confirm good condition or report a problem after recorded delivery proof; outcomes are immutable and replay-safe.');
