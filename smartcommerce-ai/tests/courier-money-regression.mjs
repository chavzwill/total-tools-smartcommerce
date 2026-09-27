import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../src/lib/courierMoney.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseCourierPrice,formatCourierMoney}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
assert.equal(parseCourierPrice('1500.25','JMD'),150025);assert.equal(parseCourierPrice('10','JPY'),10);assert.equal(parseCourierPrice('1.234','KWD'),1234);
for(const [amount,currency] of [['1.001','JMD'],['1.1','JPY'],['','JMD'],['-1','JMD'],['1e3','JMD'],['NaN','JMD']])assert.throws(()=>parseCourierPrice(amount,currency));
assert.match(formatCourierMoney('150025','JMD'),/1,500\.25/);
console.log('Courier rate entry preserves exact currency precision without rounding.');
