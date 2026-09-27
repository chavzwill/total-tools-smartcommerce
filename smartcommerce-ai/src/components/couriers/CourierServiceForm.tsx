import {useState,type ReactNode} from 'react';
import type {CourierReferences,CourierService,CourierServiceInput,CourierRate} from '../../types/courier';
import {courierCommand} from '../../lib/couriers';
import {normalizeCourierService} from '../../server/couriers/serviceValidation';
import {useCourierMutation} from './useCourierMutation';
import Button from '../shared/Button';
import {parseCourierPrice,courierPriceInput} from '../../lib/courierMoney';
type Props={organizationId:string;service?:CourierService;references:CourierReferences;onSaved:(service:CourierService)=>void;onCancel:()=>void};
export default function CourierServiceForm({organizationId,service,references:refs,onSaved,onCancel}:Props){
  const [id]=useState(()=>service?.id||crypto.randomUUID());
  const initial=service?.input;
  const [currency,setCurrency]=useState(initial?.currency||"");
  const [mode,setMode]=useState(initial?.mode||'branch_to_address');
  const [rows,setRows]=useState<Array<{key:string;rate:CourierRate|null}>>(()=>initial?.rates.map((rate)=>({key:crypto.randomUUID(),rate}))||[{key:crypto.randomUUID(),rate:null}]);
  const [validation,setValidation]=useState('');
  const mutation=useCourierMutation(courierCommand<CourierService>,onSaved);
  const choices=(label:string,name:'originAreaIds'|'destinationAreaIds'|'categoryIds'|'collectionPointIds',options:CourierReferences['areas'])=><fieldset className="courier-choices"><legend>{label}</legend>{options.map(o=><label key={o.id} className="courier-check"><input type="checkbox" name={name} value={o.id} defaultChecked={initial?.[name].includes(o.id)}/>{o.name||o.id}</label>)}</fieldset>;
  const number=(label:string,name:string,value?:number,min=0,max=100000000):ReactNode=><label>{label}<input name={name} type="number" min={min} max={max} step="1" required defaultValue={value}/></label>;
  const select=(label:string,name:string,options:CourierReferences['areas'],value?:string)=><label>{label}<select name={name} defaultValue={value||''} onChange={e=>{if(name==="currency")setCurrency(e.target.value);}} required><option value="">Select…</option>{options.map(o=><option key={o.id} value={o.id}>{o.name||o.id}</option>)}</select></label>;
  return <section className="courier-card"><h2>{service?'Edit service':'Add a delivery service'}</h2><p>Saving creates an unpublished version. Review your rates before publishing. Checkout bookings are not enabled yet.</p>
    <form onSubmit={e=>{e.preventDefault();setValidation('');const f=new FormData(e.currentTarget);const str=(k:string)=>String(f.get(k)||'');const num=(k:string)=>Number(str(k));const list=(k:string)=>f.getAll(k).map(String);
      let input:CourierServiceInput;try{input={name:str('name'),currency:str('currency'),timezone:str('timezone'),originAreaIds:list('originAreaIds'),destinationAreaIds:list('destinationAreaIds'),categoryIds:list('categoryIds'),collectionPointIds:mode==='branch_to_collection_point'?list('collectionPointIds'):[],mode,minBusinessDays:num('minBusinessDays'),maxBusinessDays:num('maxBusinessDays'),cutoffLocal:str('cutoffLocal'),dailyCapacity:num('dailyCapacity'),available:f.has('available'),maxWeightGrams:num('maxWeightGrams'),maxLengthMm:num('maxLengthMm'),maxWidthMm:num('maxWidthMm'),maxHeightMm:num('maxHeightMm'),hours:Array.from({length:7},(_,weekday)=>({weekday,opens:str(`opens${weekday}`),closes:str(`closes${weekday}`)})).filter(h=>f.has(`day${h.weekday}`)),closures:str('closures').split(/[\s,]+/).filter(Boolean),rates:rows.map(({key})=>({categoryId:str(`${key}category`),originAreaId:str(`${key}origin`),destinationAreaId:str(`${key}destination`),minWeightGrams:num(`${key}min`),maxWeightGrams:num(`${key}max`)+1,priceMinor:parseCourierPrice(str(`${key}price`),str("currency"))}))};}catch{setValidation("Enter a valid price in the selected currency without extra decimal places.");return;}
      try{normalizeCourierService(input,refs);}catch{setValidation('Check selected areas and categories, working hours, dates, capacity, and weight ranges. Rates must use selected areas and categories, fit the maximum weight, and must not overlap.');return;}
      void mutation.execute({action:'save_service',id,organizationId,expectedVersion:service?.version||0,input});
    }}>
      <fieldset className="courier-fields" disabled={mutation.busy||mutation.pending}>
        <label>Service name<input name="name" required maxLength={120} defaultValue={initial?.name}/></label>
        <div className="courier-grid">{select('Currency','currency',refs.currencies.map(id=>({id})),initial?.currency)}<label>Time zone<input name="timezone" required defaultValue={initial?.timezone} placeholder="America/Jamaica"/><small>Use an IANA time zone, such as America/Jamaica.</small></label></div>
        <h3>Coverage & item categories</h3><div className="courier-grid">{choices('Pickup areas','originAreaIds',refs.areas)}{choices('Delivery areas','destinationAreaIds',refs.areas)}</div>{choices('Items you can carry','categoryIds',refs.categories)}
        <label>Delivery option<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="branch_to_address">Branch pickup → customer address</option><option value="branch_to_collection_point">Branch pickup → collection point</option></select></label>
        {mode==='branch_to_collection_point'&&choices('Collection points','collectionPointIds',refs.collectionPoints)}
        <h3>Parcel limits</h3><div className="courier-grid">{number('Maximum weight (grams)','maxWeightGrams',initial?.maxWeightGrams,1)}{number('Maximum length (mm)','maxLengthMm',initial?.maxLengthMm,1,50000)}{number('Maximum width (mm)','maxWidthMm',initial?.maxWidthMm,1,50000)}{number('Maximum height (mm)','maxHeightMm',initial?.maxHeightMm,1,50000)}</div>
        <h3>Delivery speed & availability</h3><div className="courier-grid">{number('Minimum business days','minBusinessDays',initial?.minBusinessDays,0,90)}{number('Maximum business days','maxBusinessDays',initial?.maxBusinessDays,0,90)}<label>Daily booking cutoff<input name="cutoffLocal" type="time" required defaultValue={initial?.cutoffLocal}/></label>{number('Daily delivery capacity','dailyCapacity',initial?.dailyCapacity,0,10000)}</div>
        <label className="courier-check"><input name="available" type="checkbox" defaultChecked={initial?.available||false}/>Available for delivery work</label>
        <h3>Working hours</h3><p>Select at least one day. Hours and cutoff use your service time zone; overnight shifts are not supported.</p>
        {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,weekday)=>{const hours=initial?.hours.find(h=>h.weekday===weekday);return <div className="courier-row" key={day}><label className="courier-check"><input type="checkbox" name={`day${weekday}`} defaultChecked={!!hours}/>{day}</label><div className="courier-grid"><label>{day} opens<input type="time" name={`opens${weekday}`} defaultValue={hours?.opens}/></label><label>{day} closes<input type="time" name={`closes${weekday}`} defaultValue={hours?.closes}/></label></div></div>;})}
        <label>Closure dates (optional)<textarea name="closures" rows={2} defaultValue={initial?.closures.join('\n')} placeholder="YYYY-MM-DD, one per line"/></label>
        <h3>Rates by category & route</h3><p>Enter prices in the selected currency and weights in whole grams. Weight limits include both endpoints. Only configured routes have a rate.</p>
        {rows.map(({key,rate},index)=><div className="courier-row" key={key}><h3>Rate {index+1}</h3><div className="courier-grid">{select('Item category',`${key}category`,refs.categories,rate?.categoryId)}{select('Pickup area',`${key}origin`,refs.areas,rate?.originAreaId)}{select('Delivery area',`${key}destination`,refs.areas,rate?.destinationAreaId)}{number('From weight (grams)',`${key}min`,rate?.minWeightGrams)}{number('Through weight (grams)',`${key}max`,rate?rate.maxWeightGrams-1:undefined)}<label>Price ({currency||"select currency"})<input name={`${key}price`} inputMode="decimal" required defaultValue={rate&&initial?courierPriceInput(rate.priceMinor,initial.currency):undefined}/></label></div><Button type="button" variant="ghost" disabled={rows.length===1} onClick={()=>setRows(rows.filter(r=>r.key!==key))}>Remove rate {index+1}</Button></div>)}
        <Button type="button" variant="secondary" disabled={rows.length>=200} onClick={()=>setRows([...rows,{key:crypto.randomUUID(),rate:null}])}>Add rate</Button>
        <div className="courier-actions"><Button type="submit">Save unpublished service</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
      </fieldset>
    </form>
    {(validation||mutation.error)&&<p role="alert">{validation||mutation.error}</p>}{mutation.pending&&<Button disabled={mutation.busy} onClick={()=>void mutation.execute()}>Retry same request</Button>}
  </section>;
}
