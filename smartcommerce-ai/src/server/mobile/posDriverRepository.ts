import {courierDb} from '../couriers/repository.js';
import type {DriverDecision} from './posDriverDecision.js';
export async function applyPosDriverDecision(event:DriverDecision){
 const rows=await courierDb()`SELECT mobile_apply_pos_driver_decision(${JSON.stringify(event)}::jsonb) AS result`;
 return rows[0].result as {disposition:'applied'|'replayed'|'stale'|'conflict'|'blocked'};
}
