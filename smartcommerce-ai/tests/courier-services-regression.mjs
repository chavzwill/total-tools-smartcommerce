import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function moduleUrl(path,replacements={}){let code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const [a,b] of Object.entries(replacements))code=code.replaceAll(JSON.stringify(a),JSON.stringify(b)).replaceAll("'"+a+"'",JSON.stringify(b));return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;}
const policy=await moduleUrl('../src/server/couriers/policy.ts');
const {normalizeCourierService}=await import(await moduleUrl('../src/server/couriers/serviceValidation.ts',{'./policy.js':policy}));
const references={areas:[{id:'origin'},{id:'destination'}],categories:[{id:'tools'}],collectionPoints:[],currencies:['JMD']};
const rate={categoryId:'tools',originAreaId:'origin',destinationAreaId:'destination',minWeightGrams:0,maxWeightGrams:10001,priceMinor:50000};
const service={name:'Standard delivery',currency:'JMD',timezone:'America/Jamaica',originAreaIds:['origin'],destinationAreaIds:['destination'],categoryIds:['tools'],mode:'branch_to_address',collectionPointIds:[],minBusinessDays:1,maxBusinessDays:3,cutoffLocal:'14:00',dailyCapacity:10,available:true,maxWeightGrams:10000,maxLengthMm:1000,maxWidthMm:1000,maxHeightMm:1000,hours:[{weekday:1,opens:'08:00',closes:'17:00'}],closures:[],rates:[rate]};
assert.equal(normalizeCourierService(service,references).rates[0].priceMinor,50000);
for(const change of [{status:'published'},{rates:[{...rate,priceMinor:-1}]},{rates:[{...rate,priceMinor:0.1}]},{rates:[rate,rate]},{rates:[{...rate,categoryId:'unknown'}]},{timezone:'invalid'},{originAreaIds:[]},{maxBusinessDays:0},{dailyCapacity:0},{hours:[{weekday:1,opens:'18:00',closes:'08:00'}]},{closures:['2026-02-30']},{mode:'branch_to_collection_point'},{currency:'USD'}]) assert.throws(()=>normalizeCourierService({...service,...change},references),JSON.stringify(change));
assert.equal(normalizeCourierService({...service,available:false,dailyCapacity:0},references).available,false);
console.log('Courier coverage, capacity, hours, rate precision/overlap and shipping limits passed.');
