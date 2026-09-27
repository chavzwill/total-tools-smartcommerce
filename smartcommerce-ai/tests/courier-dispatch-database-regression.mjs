import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),url=process.env.COURIER_TEST_DATABASE_URL;
assert.ok(url);const parsed=new URL(url);assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname)&&parsed.pathname==='/courier_test');
async function sql(q){try{return (await exec(process.env.PSQL_PATH||'psql',['-X','-q','-t','-A','-w','-v','ON_ERROR_STOP=1','-c',q,'-d',url],{timeout:15000})).stdout.trim();}catch(e){throw new Error(e.stderr||'Local database command failed');}}
await sql(await readFile(new URL('../migrations/20260923_courier_dispatch.sql',import.meta.url),'utf8'));
await sql(await readFile(new URL('../migrations/20260925_courier_acceptance.sql',import.meta.url),'utf8'));
const id=()=>crypto.randomUUID(),owner=id(),customer=id(),org=id(),service=id(),driver=id(),driverAccount=id();
const j=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
await sql(`INSERT INTO customer_accounts(id) VALUES ('${owner}'),('${customer}'),('${driverAccount}');INSERT INTO courier_organizations(id,owner_customer_id,profile) VALUES ('${org}','${owner}','{}');INSERT INTO courier_identity_documents(id,account_id,kind,mime,encrypted,status) VALUES ('${id()}','${owner}','identity','image/png','{}','verified'),('${id()}','${owner}','business','image/png','{}','verified'),('${id()}','${driverAccount}','identity','image/png','{}','verified');UPDATE courier_organizations SET status='approved' WHERE id='${org}';INSERT INTO courier_services(id,organization_id,version,published,input) VALUES ('${service}','${org}',1,true,'{"available":true,"dailyCapacity":1}');INSERT INTO courier_drivers(id,organization_id,account_id) VALUES ('${driver}','${org}','${driverAccount}');`);
async function option(){const context=id(),quote=id();await sql(`INSERT INTO courier_shipping_contexts(id,checkout_quote_id,customer_id,cart_fingerprint,currency,order_total_minor,branch_id,items,destination,facts,source_reference,expires_at) VALUES ('${context}','checkout-${context}','${customer}','test-cart','JMD',10000,'test-branch','[{"name":"Test item","quantity":1}]','{"address":"Test address"}','{}','test-only',now()+interval '10 minutes');INSERT INTO courier_shipping_quotes(id,context_id,service_id,service_version,service_date,delivery_minor,tax_minor,total_minor,currency,expires_at,service_snapshot) VALUES ('${quote}','${context}','${service}',1,current_date,1500,0,11500,'JMD',now()+interval '10 minutes','{}');`);return {context,quote};}
async function reserve(q,key=id(),who=customer){return JSON.parse(await sql(`SELECT courier_shipping_reserve('${who}','${q}','${key}')`));}
const a=await option(),b=await option();
await assert.rejects(()=>reserve(a.quote,id(),id()),/COURIER_NOT_FOUND/);
const race=await Promise.allSettled([reserve(a.quote),reserve(b.quote)]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
const winning=race[0].status==='fulfilled'?a:b,losing=winning===a?b:a;
const hold=await reserve(winning.quote);assert.equal(hold.status,'held');assert.deepEqual(await reserve(winning.quote),hold);
await assert.rejects(()=>reserve(losing.quote),/COURIER_CAPACITY_FULL/);
const settlement={provider:'test-provider',eventId:id(),paymentId:id(),orderId:'order-'+id(),orderNumber:'TEST-ORDER',customerId:customer,shippingQuoteId:winning.quote,currency:'JMD',amountMinor:11500};
async function settle(s){return JSON.parse(await sql(`SELECT courier_dispatch_paid(${j(s)})`));}
const dispatched=await settle(settlement);assert.equal(dispatched.status,'awaiting_driver');assert.equal(await sql(`SELECT count(*) FROM courier_pickups WHERE order_id='${settlement.orderId}'`),'0');
assert.deepEqual(await settle(settlement),dispatched);
assert.deepEqual(await settle({...settlement,eventId:id()}),dispatched);
assert.equal(await sql(`SELECT count(*) FROM courier_dispatch_jobs WHERE order_id='${settlement.orderId}'`),'1');
async function assign(who,driverId=driver,version=2){return JSON.parse(await sql(`SELECT courier_dispatch_assign('${who}','${dispatched.id}','${driverId}',${version})`));}
await assert.rejects(()=>assign(owner,driver,1),/COURIER_ACCEPTANCE_REQUIRED/);
assert.equal(await sql(`SELECT count(*) FROM courier_pickups WHERE order_id='${settlement.orderId}'`),'0');
const acceptanceKey=id();
const respond=(who=owner,decision='accept',key=acceptanceKey)=>sql(`SELECT courier_dispatch_respond('${who}','${dispatched.id}','${decision}',1,'${key}',NULL)`).then(JSON.parse);
await assert.rejects(()=>respond(customer),/COURIER_NOT_FOUND/);
const accepted=await respond();assert.equal(accepted.acceptance,'accepted');assert.deepEqual(await respond(),accepted);
await assert.rejects(()=>respond(owner,'decline'),/COURIER_IDEMPOTENCY_CONFLICT/);
await assert.rejects(()=>assign(customer),/COURIER_NOT_FOUND/);
await assert.rejects(()=>assign(owner,id()),/COURIER_DRIVER_UNAVAILABLE/);
const assigned=await assign(owner);assert.equal(assigned.status,'assigned');assert.deepEqual(await assign(owner),assigned);
assert.equal(await sql(`SELECT customer_account_id FROM courier_pickups WHERE id='${assigned.pickupId}'`),customer);
assert.equal(await sql(`SELECT count(*) FROM courier_pickups WHERE order_id='${settlement.orderId}'`),'1');
// Changed payment contents never silently replay or create a second dispatch.
const conflict=await settle({...settlement,eventId:id(),amountMinor:100});assert.equal(conflict.status,'needs_review');
assert.equal(await sql(`SELECT count(*) FROM courier_dispatch_conflicts WHERE payment_id='${settlement.paymentId}'`),'1');
// An expired hold cannot steal a slot from a later customer.
await sql(`UPDATE courier_shipping_holds SET status='released' WHERE quote_id='${winning.quote}'`);
const expired=await reserve(losing.quote);
await sql(`UPDATE courier_shipping_holds SET expires_at=now()-interval '1 minute' WHERE id='${expired.id}'`);
const replacement=await option();await reserve(replacement.quote);
const late=await settle({...settlement,eventId:id(),paymentId:id(),orderId:'late-'+id(),shippingQuoteId:losing.quote});assert.equal(late.status,'needs_review');
assert.equal(late.reason,'reservation_expired');
const mismatch=await settle({...settlement,eventId:id(),paymentId:id(),orderId:'mismatch-'+id(),shippingQuoteId:replacement.quote,amountMinor:1});assert.equal(mismatch.status,'needs_review');
assert.equal(mismatch.reason,'payment_mismatch');
async function offered(){const q=await option(),job=id();await sql(`INSERT INTO courier_dispatch_jobs(id,order_id,quote_id,organization_id,settlement,status,receipt) VALUES ('${job}','fixture-${job}','${q.quote}','${org}','{"orderNumber":"FIXTURE"}','awaiting_driver','{}')`);return job;}
const timedOut=await offered();await sql(`UPDATE courier_dispatch_jobs SET acceptance_deadline=now()-interval '1 second' WHERE id='${timedOut}'`);
const staff={kind:'staff',employeeId:'test-staff',permissions:{couriers_pickup:true},branchIds:['test-branch']};
const queue=actor=>sql(`SELECT courier_dispatch_queue(${j(actor)})`).then(JSON.parse);
assert.equal((await queue({kind:'owner',customerId:customer})).jobs.length,0);
assert.equal(await sql(`SELECT acceptance FROM courier_dispatch_jobs WHERE id='${timedOut}'`),'pending');
assert.equal((await queue(staff)).jobs.find(x=>x.id===timedOut).acceptance,'expired');
assert.equal(await sql(`SELECT acceptance||':'||status||':'||reason FROM courier_dispatch_jobs WHERE id='${timedOut}'`),'expired:needs_review:acceptance_expired');
assert.equal(await sql(`SELECT count(*) FROM courier_dispatch_responses WHERE job_id='${timedOut}'`),'1');
await queue(staff);
assert.equal(await sql(`SELECT count(*) FROM courier_dispatch_responses WHERE job_id='${timedOut}'`),'1');
assert.equal(await sql(`SELECT count(*) FROM courier_private_audit WHERE subject_id='${timedOut}' AND action='dispatch_expired'`),'1');
const concurrentlyExpired=await offered();await sql(`UPDATE courier_dispatch_jobs SET acceptance_deadline=now()-interval '1 second' WHERE id='${concurrentlyExpired}'`);
await Promise.all([queue(staff),queue(staff)]);
assert.equal(await sql(`SELECT acceptance||':'||status FROM courier_dispatch_jobs WHERE id='${concurrentlyExpired}'`),'expired:needs_review');
assert.equal(await sql(`SELECT count(*) FROM courier_dispatch_responses WHERE job_id='${concurrentlyExpired}'`),'1');
assert.equal(await sql(`SELECT count(*) FROM courier_private_audit WHERE subject_id='${concurrentlyExpired}' AND action='dispatch_expired'`),'1');
assert.equal((await queue({...staff,branchIds:[]})).jobs.length,0);
assert.equal((await queue({kind:'owner',customerId:customer})).jobs.length,0);
await assert.rejects(()=>queue({...staff,permissions:{}}),/COURIER_FORBIDDEN/);
await assert.rejects(()=>sql(`SELECT courier_dispatch_respond('${owner}','${timedOut}','accept',1,'${id()}',NULL)`),/COURIER_STATE_CONFLICT/);
const declineJob=await offered();
await assert.rejects(()=>sql(`SELECT courier_dispatch_respond('${owner}','${declineJob}','decline',1,'${id()}',NULL)`),/COURIER_REASON_REQUIRED/);
const raceJob=await offered();
const decisions=await Promise.allSettled(['accept','decline'].map(decision=>sql(`SELECT courier_dispatch_respond('${owner}','${raceJob}','${decision}',1,'${id()}','capacity')`)));
assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);assert.equal(await sql(`SELECT count(*) FROM courier_dispatch_responses WHERE job_id='${raceJob}'`),'1');
const duplicateOrder=await settle({...settlement,eventId:id(),paymentId:id(),shippingQuoteId:replacement.quote});
assert.equal(duplicateOrder.reason,'order_conflict');
await sql(`UPDATE courier_services SET published=false WHERE id='${service}'`);
const suspended=await settle({...settlement,eventId:id(),paymentId:id(),orderId:'suspended-'+id(),shippingQuoteId:replacement.quote});
assert.equal(suspended.reason,'courier_unavailable');
await sql(`UPDATE courier_drivers SET active=false WHERE id='${driver}'`);
await assert.rejects(()=>assign(owner),/COURIER_DRIVER_UNAVAILABLE/);
console.log('Shipping capacity races, ownership, payment replay, amount conflicts, late payments and verified-driver assignment passed.');
