import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {rankFilePaths} from '../src/file-search-results';

test('file ranking preserves the top 100 and yields so obsolete scans stop',async()=>{
 const paths=Array.from({length:5000},(_,i)=>`src/${i}/User.php`);
 paths.push('User.php');
 const result=await rankFilePaths(paths,'user.php',()=>true);
 const expected=[...paths].sort((a,b)=>a.length-b.length||a.localeCompare(b)).slice(0,100);
 assert.deepEqual(result,expected);
 let current=true;const pending=rankFilePaths(paths,'user',()=>current);
 current=false;assert.deepEqual(await pending,[]);
});

test('reference locations do not read files or allocate editor models',async()=>{
 const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const start=source.indexOf('async function toLocations(');
 const code=ts.transpileModule(source.slice(start,source.indexOf('const usages =',start)),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const convert=new Function('monaco','range',code+';return toLocations;')({Uri:{parse:(uri:string)=>({scheme:'file',toString:()=>uri})}},(value:unknown)=>value);
 const values=Array.from({length:5000},(_,i)=>({uri:`file:///fixture/${i}.php`,range:{start:{line:0,character:0},end:{line:0,character:1}}}));
 const result=await convert(values,false);
 assert.equal(result.length,5000);
 assert.equal(result[4999].uri.toString(),values[4999].uri);
});
