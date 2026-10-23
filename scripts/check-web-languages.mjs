import {webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1427','--strictPort'],{stdio:'pipe'});let browser;let bundledWorkerLoaded=false;
const watchdog=setTimeout(()=>{server.kill();void browser?.close();},45000);
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1427'))resolve();});server.once('exit',reject);});
 browser=await webkit.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(25000);
 const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.log('PAGE ERROR',String(e));});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 if(process.argv.includes('--bundled-workers')){const name=(await readdir('dist/assets')).find(n=>/^vue\.worker-.*\.js$/.test(n));if(!name)throw Error('Build the frontend first');const body=await readFile('dist/assets/'+name,'utf8');await page.route('**/src/vue.worker.ts?worker_file*',route=>{bundledWorkerLoaded=true;return route.fulfill({contentType:'application/javascript',body});});}
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');
 const {installEditorWorkers}=await import('/src/editor-workers.ts');installEditorWorkers();
 const {installWebLanguages}=await import('/src/web-languages.ts');window.webLanguages=installWebLanguages();window.monaco=monaco;
 document.getElementById('startup-splash').remove();document.getElementById('app').innerHTML='<div id="editor" style="height:100vh"></div>';
 window.ed=monaco.editor.create(document.getElementById('editor'),{automaticLayout:true,theme:'vs-dark',minimap:{enabled:false}});
 `}));await page.goto('http://127.0.0.1:1427');await page.waitForFunction(()=>!!window.ed);
 const base=await page.evaluate(async()=>{
  const m=window.monaco;const util=m.editor.createModel('export const person = { name: "Ada", age: 30 };','typescript',m.Uri.parse('file:///fixture/person.ts'));
  const text='import { person } from "./person";\nperson.na\nconst age: number = "wrong";';const model=m.editor.createModel(text,'typescript',m.Uri.parse('file:///fixture/main.ts'));window.ed.setModel(model);
  const worker=await window.webLanguages.typeScriptWorker(model);const completion=await worker.getCompletionsAtPosition(model.uri.toString(),text.indexOf('person.na')+9);
  const diagnostics=await worker.getSemanticDiagnostics(model.uri.toString());const definitions=await window.webLanguages.locations(model,new m.Position(2,3),'textDocument/definition');
  const references=await window.webLanguages.locations(util,new m.Position(1,15),'textDocument/references');return {names:completion?.entries.map(e=>e.name),errors:diagnostics.map(d=>d.code),definitions,references};
 });if(!base.names?.includes('name')||!base.errors.includes(2322)||!base.definitions.some(d=>d.uri.endsWith('/person.ts'))||!base.references.some(d=>d.uri.endsWith('/main.ts')))throw Error('TS engine failed: '+JSON.stringify(base));console.log('TypeScript passed');
 const javascript=await page.evaluate(async()=>{
  const m=window.monaco;const text='/** @param {{name: string}} user */\nfunction greet(user) { return user.na }';const model=m.editor.createModel(text,'javascript',m.Uri.parse('file:///fixture/example.js'));window.ed.setModel(model);
  const worker=await window.webLanguages.typeScriptWorker(model);const completion=await worker.getCompletionsAtPosition(model.uri.toString(),text.lastIndexOf('user.na')+7);return completion?.entries.map(e=>e.name);
 });if(!javascript?.includes('name'))throw Error('JavaScript JSDoc completion failed: '+JSON.stringify(javascript));console.log('JavaScript passed');
 const react=await page.evaluate(async()=>{
  const m=window.monaco;const text='import { useState } from "react";\nconst [count, setCount] = useState(0);\nsetCount("wrong");\nfunction Card(props: { title: string }) { return <div>{props.title}</div>; }\nconst card = <Card ti />;';
  const model=m.editor.createModel(text,'typescript',m.Uri.parse('file:///fixture/Card.tsx'));window.ed.setModel(model);const worker=await window.webLanguages.typeScriptWorker(model);
  const completion=await worker.getCompletionsAtPosition(model.uri.toString(),text.lastIndexOf('ti')+2);const diagnostics=await worker.getSemanticDiagnostics(model.uri.toString());return {names:completion?.entries.map(e=>e.name),errors:diagnostics.map(d=>({code:d.code,message:d.messageText}))};
 });if(!react.names?.includes('title')||!react.errors.some(d=>d.code===2345))throw Error('React engine failed: '+JSON.stringify(react));console.log('React passed');
 await page.evaluate(async()=>{const m=window.monaco;const text='<script setup lang="ts">\nconst user = { name: "Ada", age: 30 };\nconst count: number = "wrong";\n</script>\n<template><p>{{ user.na }}</p></template>';
  window.vueText=text;window.vueModel=m.editor.createModel(text,'vue',m.Uri.parse('file:///fixture/Example.vue'));window.ed.setModel(window.vueModel);await window.webLanguages.ensureVue();const p=window.vueModel.getPositionAt(text.lastIndexOf('user.na')+7);window.ed.setPosition(p);window.ed.focus();window.ed.trigger('web-test','editor.action.triggerSuggest',{});
 });
 await page.waitForFunction(()=>[...document.querySelectorAll('.suggest-widget .label-name')].some(e=>e.textContent==='name'));
 const vue=await page.evaluate(async()=>{const m=window.monaco;const model=window.vueModel;const p=model.getPositionAt(window.vueText.lastIndexOf('user.na')+2);return await window.webLanguages.locations(model,p,'textDocument/definition');});
 if(!vue.some(d=>d.uri.endsWith('/Example.vue')&&d.range.start.line===1))throw Error('Vue definition failed: '+JSON.stringify(vue));
 await page.waitForFunction(()=>window.monaco.editor.getModelMarkers({owner:'vue'}).some(d=>d.code==='2322'||d.code===2322));console.log('Vue passed');
 await page.evaluate(async()=>{
  const m=window.monaco;m.editor.createModel('<script setup lang="ts">defineProps<{ title: string; count?: number }>();</script><template><p>{{ title }}</p></template>','vue',m.Uri.parse('file:///fixture/UserCard.vue'));
  const text='<script setup lang="ts">import UserCard from "./UserCard.vue";</script><template><UserCard tit /></template>';
  const model=m.editor.createModel(text,'vue',m.Uri.parse('file:///fixture/Parent.vue'));window.ed.setModel(model);window.ed.setPosition(model.getPositionAt(text.indexOf('tit />')+3));window.ed.focus();window.ed.trigger('web-test','editor.action.triggerSuggest',{});
 });
 try{await page.waitForFunction(()=>[...document.querySelectorAll('.suggest-widget .label-name')].some(e=>e.textContent==='title'));}catch(error){console.log('Vue props state',await page.evaluate(()=>({labels:[...document.querySelectorAll('.suggest-widget .label-name')].map(e=>e.textContent),markers:window.monaco.editor.getModelMarkers({owner:'vue'}).map(m=>({path:m.resource.path,message:m.message,code:m.code}))})));throw error;}console.log('Vue component props passed');
 const snapshots=await page.evaluate(async()=>{
  const {WebProject}=await import('/src/web-project.ts');const m=window.monaco;const files={'first.ts':'export const first = 1;','closed.ts':'export const closed = 2;'};
  const api={workspace:async()=>({root:'/snapshot-fixture'}),listFiles:async()=>Object.keys(files),tree:async()=>[],read:async(path)=>{if(!(path in files))throw Error('Missing fixture');return {text:files[path]};}};
  const index=new WebProject(api,()=>{});await index.prepare();const uri=name=>m.Uri.file('/snapshot-fixture/'+name);const first=m.editor.getModel(uri('first.ts'));index.claim(first);first.setValue('export const unsaved = 3;');
  delete files['closed.ts'];files['new.ts']='export const added = true;';index.invalidate();await index.prepare();
  const result={preserved:first.getValue().includes('unsaved'),deleted:!m.editor.getModel(uri('closed.ts')),added:!!m.editor.getModel(uri('new.ts'))};index.reset();result.reset=!m.editor.getModel(uri('new.ts'))&&!first.isDisposed();first.dispose();return result;
 });if(Object.values(snapshots).some(value=>!value))throw Error('Project snapshot lifecycle failed: '+JSON.stringify(snapshots));console.log('Project snapshots passed');
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/vue-language-service.png'});
 if(process.argv.includes('--bundled-workers')&&!bundledWorkerLoaded)throw Error('Production worker was not requested');const report={ok:errors.length===0,workerBuild:bundledWorkerLoaded?'production':'development',checks:['JavaScript JSDoc completion','TypeScript completion, cross-file definition, references and diagnostics','React JSX props and useState type inference','Vue template completion, script definition and diagnostics','Vue imported component props','Project snapshots preserve open buffers, remove deleted files and reset'],errors};await writeFile('.artifacts/web-languages.json',JSON.stringify(report,null,2));console.log(report);if(errors.length)throw Error('Browser errors: '+errors.join('; '));
}finally{clearTimeout(watchdog);await browser?.close();server.kill();}
