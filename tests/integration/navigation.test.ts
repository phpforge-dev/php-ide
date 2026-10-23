import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Workspace } from '../../electron/workspace';
import { watchProject } from '../../electron/project-watcher';
import { PhpLanguage } from '../../electron/php-language';
import type { LanguageMethod } from '../../shared/contracts';

test('referências, implementações e índice incremental reais', { timeout: 150000 }, async () => {
 const root = await realpath(await mkdtemp(join(tmpdir(),'php-ide-navigation-')));
 const project=join(root,'project'); await mkdir(project);
 const sources:Record<string,string>={
  'composer.json': JSON.stringify({autoload:{'psr-4':{'Sample\\':'src/'}}}),
  'src/Worker.php':'<?php namespace Sample; interface Worker { public function run(): string; }',
  'src/First.php':"<?php namespace Sample; class First implements Worker { public function run(): string { return 'first'; } }",
  'src/Second.php':"<?php namespace Sample; class Second implements Worker { public function run(): string { return 'second'; } }",
  'src/Other.php':"<?php namespace Sample; class Other { public function run(): string { return 'other'; } }",
  'probe.php':"<?php\nnamespace Sample;\n$a = new First();\n$a->run();\n$b = new Other();\n$b->run();\n$text = 'run';\n"
 };
 await mkdir(join(project,'src'));
 for(const [path,text] of Object.entries(sources))await writeFile(join(project,path),text);
 const workspace=new Workspace(project);
 let language=new PhpLanguage(workspace,resolve('.tools'),join(root,'cache'),message=>console.log(message));
 const watcher=await watchProject(project,(path,type)=>language.changed(path,type));
 const normalize=(value:any)=>(value?(Array.isArray(value)?value:[value]):[]).map((v:any)=>({file:basename(fileURLToPath(v.uri??v.targetUri)),line:(v.range??v.targetSelectionRange).start.line})).sort((a:any,b:any)=>a.file.localeCompare(b.file)||a.line-b.line);
 async function request(method:LanguageMethod,path:string,needle:string){
  const text=sources[path];const offset=text.indexOf(needle);assert.ok(offset>=0);
  const lines=text.slice(0,offset).split('\n');
  return normalize(await language.request({method,path,text,version:1,position:{line:lines.length-1,character:lines.at(-1)!.length+1}}));
 }
 const measurements:Record<string,number>={};
 try {
  const coldStart=performance.now();
  await language.start();
  measurements.coldStartMs=Math.round(performance.now()-coldStart);
  const refs=await request('textDocument/references','src/First.php','run()');
  assert.deepEqual(refs,[{file:'probe.php',line:3}]);
  const implementations=await request('textDocument/implementation','src/Worker.php','run()');
  assert.deepEqual(implementations,[{file:'First.php',line:0},{file:'Second.php',line:0}]);
  sources['src/Third.php']="<?php namespace Sample; class Third implements Worker { public function run(): string { return 'third'; } }";
  await writeFile(join(project,'src/Third.php'),sources['src/Third.php']);
  async function expectImplementations(files:string[], name:string) {
   let actual: {file:string;line:number}[]=[];
   const started=performance.now();
   while(performance.now()-started<10000){
    try { actual=await request('textDocument/implementation','src/Worker.php','run()'); }
    catch(error) {
     if(!String(error).includes('Could not read file at URI')) throw error;
     measurements.transientMissingFileErrors=(measurements.transientMissingFileErrors??0)+1;
     await new Promise(resolve=>setTimeout(resolve,200));continue;
    }
    if(JSON.stringify(actual.map(r=>r.file))===JSON.stringify(files)) {
     measurements[name]=Math.round(performance.now()-started); return;
    }
    await new Promise(resolve=>setTimeout(resolve,200));
   }
   assert.deepEqual(actual.map(r=>r.file),files);
  }
  await expectImplementations(['First.php','Second.php','Third.php'],'addMs');
  const third=await workspace.read('src/Third.php');
  await workspace.save('src/Third.php',"<?php namespace Sample; class Third { public function run(): string { return 'third'; } }",third.etag);
  await expectImplementations(['First.php','Second.php'],'editMs');
  await rm(join(project,'src/Second.php'));
  await expectImplementations(['First.php'],'deleteMs');
  await language.dispose();
  language=new PhpLanguage(workspace,resolve('.tools'),join(root,'cache'),()=>{});
  const warmStart=performance.now();await language.start();
  measurements.warmStartMs=Math.round(performance.now()-warmStart);
  assert.deepEqual(await request('textDocument/implementation','src/Worker.php','run()'),[{file:'First.php',line:0}]);
  assert.deepEqual(await request('textDocument/references','src/First.php','run()'),[{file:'probe.php',line:3}]);
  await mkdir('.artifacts',{recursive:true});
  await writeFile('.artifacts/navigation-results.json',JSON.stringify({engine:'Phpactor 2026.10.07.0',platform:process.platform,passed:true,measurements},null,2)+'\n');
  console.log(JSON.stringify(measurements));
 }finally{await watcher.close();await language.dispose();await rm(root,{recursive:true,force:true});}
});
