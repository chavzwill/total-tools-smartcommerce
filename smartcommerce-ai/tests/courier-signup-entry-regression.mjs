import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const page=await readFile(new URL('../src/pages/CustomerAccountPage.tsx',import.meta.url),'utf8');
const courier=await readFile(new URL('../src/pages/CourierAccountPage.tsx',import.meta.url),'utf8');
assert.ok(page.includes('routeHref("/couriers/account?mode=signup")'),'Customer account must expose direct courier signup');
assert.ok(page.includes('Sign up as a courier'),'Courier signup must be explicitly labelled');
assert.ok(page.includes('Courier sign in'),'Returning couriers need a separate entry');
assert.match(courier,/useState\(\(\)=>getRoute\(\)\.query\.get\('mode'\)==='signup'\)/,'Direct signup URL must open signup form');
console.log('Courier signup and sign-in entry points passed.');
