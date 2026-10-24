import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectUpdate} from '../scripts/collect-update.mjs';
import {mergeUpdateManifest} from '../scripts/merge-update-manifest.mjs';

test('release publication requires signed artifacts for every supported platform',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'php-ide-updates-'));
 try {
  const out=join(dir,'out');
  for(const [platform,name] of [['darwin-aarch64','PHP IDE.app.tar.gz'],['linux-x86_64','PHP IDE.AppImage'],['windows-x86_64','PHP IDE_0.2.13_x64-setup.exe']]){
   const bundle=join(dir,platform);await mkdir(bundle);await writeFile(join(bundle,name),'synthetic build artifact');
   await assert.rejects(collectUpdate({platform,bundle,out,tag:'v0.2.13',version:'0.2.13'}));
   // Signature contents are fixtures here; cryptographic verification belongs to the Tauri updater.
   await writeFile(join(bundle,name+'.sig'),'synthetic-signature');
   await collectUpdate({platform,bundle,out,tag:'v0.2.13',version:'0.2.13'});
   if(platform!=='windows-x86_64')await assert.rejects(mergeUpdateManifest(out,'0.2.13'),/Missing updater platform/);
  }
  const result=await mergeUpdateManifest(out,'0.2.13');assert.equal(Object.keys(result.platforms).length,3);
  assert.equal(result.platforms['darwin-aarch64'].url,'https://github.com/phpforge-dev/php-ide/releases/download/v0.2.13/PHP.IDE.app.tar.gz');
  assert.deepEqual(JSON.parse(await readFile(join(out,'latest.json'),'utf8')),result);
  await assert.rejects(mergeUpdateManifest(out,'0.2.14'),/Inconsistent/);
  await assert.rejects(collectUpdate({platform:'linux-x86_64',bundle:dir,out,tag:'v0.2.12',version:'0.2.13'}),/Invalid/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
