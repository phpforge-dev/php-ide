import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Workspace } from '../../electron/workspace';
import { PhpLanguage } from '../../electron/php-language';
test('PHP real: alias, trait, autocomplete e limite conhecido de generics', {timeout:120000}, async () => {
 const workspace = new Workspace(resolve('fixtures/php-intelligence'));
 const cache = await mkdtemp(resolve(tmpdir(),'php-ide-lsp-'));
 const language = new PhpLanguage(workspace,resolve('.tools'),cache,message=>console.log(message));
 try {
  const file=await workspace.read('probe.php');
  async function definition(needle:string) {
   const offset=file.text.indexOf(needle)+needle.indexOf('->')+3;
   const prefix=file.text.slice(0,offset).split('\n');
   const result:any=await language.request({method:'textDocument/definition',path:'probe.php',text:file.text,version:1,position:{line:prefix.length-1,character:prefix.at(-1)!.length}});
   return JSON.stringify(result);
  }
  assert.match(await definition('$user->label'),/User.php/);
  assert.match(await definition('$user->id'),/HasId.php/);
  // Lacuna explícita: este motor ainda não resolveu identity<T> neste fixture.
  assert.equal(await definition('$inferred->label'),'null');
  const text=file.text.replace('$user->label();','$user->');
  const prefix=text.slice(0,text.indexOf('$user->')+7).split('\n');
  const result:any=await language.request({method:'textDocument/completion',path:'probe.php',text,version:2,position:{line:prefix.length-1,character:prefix.at(-1)!.length}});
  const labels=(Array.isArray(result)?result:result.items).map((i:any)=>i.label);
  assert.ok(labels.some((s:string)=>s.includes('label')),JSON.stringify(labels));
  assert.ok(labels.some((s:string)=>s.includes('id')),JSON.stringify(labels));
 } finally {await language.dispose();await rm(cache,{recursive:true,force:true});}
});
