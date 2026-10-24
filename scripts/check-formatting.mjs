import {webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1428','--strictPort'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1428'))resolve();});server.once('exit',reject);});
 browser=await webkit.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack||String(e)));
 const phpManifest=JSON.parse(await readFile('.tools/plugin-packages/php-formatter/plugin.json','utf8'));const phpCode=await readFile('.tools/plugin-packages/php-formatter/main.js','utf8');
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');const {installEditorWorkers}=await import('/src/editor-workers.ts');installEditorWorkers();
 const {SandboxedPlugin,WORKER_SOURCE}=await import('/shared/language/plugins/sandbox.ts');
 const files={root:'/fixture',read:async()=>null,list:async()=>[],exists:async()=>false,uri:path=>'file:///fixture/'+path};
 const channel=()=>{const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));const worker=new Worker(url);return {post:message=>worker.postMessage(message),listen:(receive,fail)=>{worker.onmessage=event=>receive(event.data);worker.onerror=event=>fail(String(event.message||event.type));},terminate:()=>{worker.terminate();URL.revokeObjectURL(url);}};};
 const phpPlugin=new SandboxedPlugin('user:phpforge.php-formatter',${JSON.stringify(phpManifest)},${JSON.stringify(phpCode)},['project.read'],{files,write:async()=>null,exec:async()=>'',fetch:async()=>({status:0,body:''})},channel,{rootUri:'file:///fixture/'});if(!await phpPlugin.ready)throw Error(phpPlugin.info.errors.join('\\n'));
 const {mountFormatting}=await import('/src/formatting.ts');document.getElementById('startup-splash').remove();document.getElementById('app').innerHTML='<div id="editor" style="height:100vh"></div>';
 const ed=monaco.editor.create(document.getElementById('editor'),{automaticLayout:true});const model=monaco.editor.createModel('const x=1','javascript',monaco.Uri.file('/fixture/a.js'));ed.setModel(model);
 let calls=0;const format=mountFormatting(ed,{formatDocument:request=>{calls++;return request.language==='php'?phpPlugin.format(request):new Promise(resolve=>window.finish=resolve);}}, {path:()=>ed.getModel()?.uri.path.split('/').pop(),status:s=>window.statusText=s});Object.assign(window,{ed,model,format,monaco,calls:()=>calls});
 `}));await page.goto('http://127.0.0.1:1428');await page.waitForFunction(()=>!!window.ed,{},{timeout:8000}).catch(error=>{throw Error(errors.join('; ')+'; '+error);});
 const result=await page.evaluate(async()=>{
  const assert=(value,message)=>{if(!value)throw Error(message);};const wait=async()=>{while(!window.finish)await new Promise(r=>setTimeout(r,10));};
  let pending=window.format.run();await wait();window.model.setValue('new edit');window.finish({text:'const x = 1;\n'});await pending;assert(window.model.getValue()==='new edit','stale reply replaced newer edit');assert(window.statusText.includes('descartada'),'missing stale feedback');
  window.finish=null;pending=window.format.run();await wait();const other=window.monaco.editor.createModel('other','javascript',window.monaco.Uri.file('/fixture/b.js'));window.ed.setModel(other);window.finish({text:'wrong'});await pending;assert(other.getValue()==='other'&&window.model.getValue()==='new edit','reply after model switch changed a buffer');
  window.ed.setModel(window.model);window.finish=null;pending=window.format.run();await wait();window.finish({text:'new formatted edit'});await pending;assert(window.model.getValue()==='new formatted edit','edit was not applied');window.ed.trigger('format-test','undo',{});assert(window.model.getValue()==='new edit','undo did not restore whole formatting');
  window.ed.updateOptions({readOnly:true});const before=window.calls();await window.format.run();assert(window.calls()===before,'readonly buffer was formatted');
  window.ed.updateOptions({readOnly:false});const php=window.monaco.editor.createModel('<?php class A{public function f(){return 1;}}','php',window.monaco.Uri.file('/fixture/p.php'));window.ed.setModel(php);await window.format.run();assert(php.getValue().includes('class A\n{'),'PHP plugin did not format: '+window.statusText);
  return {ok:true,checks:['stale version discarded','model switch discarded','single undo unit','readonly buffer protected','packaged PHP formatter runs in sandbox worker in WebKit']};
 });if(errors.length)throw Error(errors.join('; '));await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/formatting-ui.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser?.close();server.kill();}
