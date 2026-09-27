import type {CourierReferences,CourierServiceInput,CourierRate} from '../../types/courier.js';
import {CourierError} from './policy.js';
function invalid():never {throw new CourierError('COURIER_INVALID_SERVICE');}
function integer(v:unknown,min:number,max:number):number {if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)invalid();return v;}
function text(v:unknown,max:number):string {if(typeof v!=='string'||!v.trim()||v.trim().length>max)invalid();return v.trim();}
function array(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)invalid();return v;}
function object(v:unknown,keys:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))invalid();return v as Record<string,unknown>;}
function clock(v:unknown):string{const s=text(v,5);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))invalid();return s;}
export function normalizeCourierService(input:unknown, refs:CourierReferences):CourierServiceInput {
  const d=object(input,['name','currency','timezone','originAreaIds','destinationAreaIds','categoryIds','mode','collectionPointIds','minBusinessDays','maxBusinessDays','cutoffLocal','dailyCapacity','available','maxWeightGrams','maxLengthMm','maxWidthMm','maxHeightMm','hours','closures','rates']);
  function ids(v:unknown,allowed:Array<{id:string}>,required=true){const result=array(v,100).map(x=>text(x,120));if((required&&!result.length)||new Set(result).size!==result.length||result.some(x=>!allowed.some(a=>a.id===x)))invalid();return result;}
  const name=text(d.name,120),currency=text(d.currency,3),timezone=text(d.timezone,80);
  if(!refs.currencies.includes(currency))invalid();
  try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{invalid();}
  const originAreaIds=ids(d.originAreaIds,refs.areas),destinationAreaIds=ids(d.destinationAreaIds,refs.areas),categoryIds=ids(d.categoryIds,refs.categories);
  if(!['branch_to_address','branch_to_collection_point'].includes(String(d.mode)))invalid();
  const mode=d.mode as CourierServiceInput['mode'];
  const collectionPointIds=ids(d.collectionPointIds,refs.collectionPoints,mode==='branch_to_collection_point');
  if(mode==='branch_to_address'&&collectionPointIds.length)invalid();
  if(typeof d.available!=='boolean')invalid();
  const available=d.available,dailyCapacity=integer(d.dailyCapacity,available?1:0,10000);
  const minBusinessDays=integer(d.minBusinessDays,0,90),maxBusinessDays=integer(d.maxBusinessDays,minBusinessDays,90);
  const maxWeightGrams=integer(d.maxWeightGrams,1,100000000),maxLengthMm=integer(d.maxLengthMm,1,50000),maxWidthMm=integer(d.maxWidthMm,1,50000),maxHeightMm=integer(d.maxHeightMm,1,50000);
  const hours=array(d.hours,7).map(x=>{const h=object(x,['weekday','opens','closes']);const weekday=integer(h.weekday,0,6),opens=clock(h.opens),closes=clock(h.closes);if(opens>=closes)invalid();return {weekday,opens,closes};});
  if(!hours.length||new Set(hours.map(h=>h.weekday)).size!==hours.length)invalid();
  const closures=array(d.closures,366).map(x=>{const s=text(x,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))invalid();const date=new Date(s+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s)invalid();return s;});
  if(new Set(closures).size!==closures.length)invalid();
  const rates:CourierRate[]=array(d.rates,200).map(x=>{
    const r=object(x,['categoryId','originAreaId','destinationAreaId','minWeightGrams','maxWeightGrams','priceMinor']);
    const categoryId=text(r.categoryId,120),originAreaId=text(r.originAreaId,120),destinationAreaId=text(r.destinationAreaId,120);
    if(!categoryIds.includes(categoryId)||!originAreaIds.includes(originAreaId)||!destinationAreaIds.includes(destinationAreaId))invalid();
    const minWeightGrams=integer(r.minWeightGrams,0,maxWeightGrams),upper=integer(r.maxWeightGrams,minWeightGrams+1,maxWeightGrams+1),priceMinor=integer(r.priceMinor,0,1000000000);
    return {categoryId,originAreaId,destinationAreaId,minWeightGrams,maxWeightGrams:upper,priceMinor};
  });
  if(!rates.length)invalid();
  for(let i=0;i<rates.length;i++)for(let j=i+1;j<rates.length;j++){const a=rates[i],b=rates[j];if(a.categoryId===b.categoryId&&a.originAreaId===b.originAreaId&&a.destinationAreaId===b.destinationAreaId&&a.minWeightGrams<b.maxWeightGrams&&b.minWeightGrams<a.maxWeightGrams)throw new CourierError('COURIER_OVERLAPPING_RATES');}
  return {name,currency,timezone,originAreaIds,destinationAreaIds,categoryIds,mode,collectionPointIds,minBusinessDays,maxBusinessDays,cutoffLocal:clock(d.cutoffLocal),dailyCapacity,available,maxWeightGrams,maxLengthMm,maxWidthMm,maxHeightMm,hours,closures,rates};
}
