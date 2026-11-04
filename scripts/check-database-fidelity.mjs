// Database fidelity (DataGrip-style) in WebKit, the macOS Tauri WebView, with the real host shell,
// Monaco and the plugin bundle: Stop/⌘F2, read-only per driver, Oracle TNS, table grid filters,
// sorting and Submit, tables without a primary key (row locator), Redis new key, stream entries,
// binary values and keys whose name is not UTF-8.
// The API is synthetic and records calls; driver behaviour against disposable containers lives in
// plugin-database tests/live-databases.mjs. DATABASE_PLUGIN_DIR picks a local plugin build.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createServer} from 'vite';
import {webkit} from '@playwright/test';

const dir=resolve(process.env.DATABASE_PLUGIN_DIR??'.tools/plugin-packages/database');
const manifest=JSON.parse(await readFile(join(dir,'plugin.json'),'utf8'));
const pack={manifest,main:await readFile(join(dir,manifest.main),'utf8'),code:await readFile(join(dir,manifest.workbench.main),'utf8'),style:await readFile(join(dir,manifest.workbench.style),'utf8')};
const source=await readFile('src/main.ts','utf8');
const shell=source.match(/innerHTML = html`([^`]+)`/)[1];
const bootstrap=`
  import * as monaco from 'monaco-editor';
  import {mountWorkbench} from '/src/workbench.ts';
  import {mountPluginManager} from '/src/plugin-manager.ts';
  import {mountToolPlugins} from '/src/tool-plugins.ts';
  import {pluginService,optionalPluginService} from '/src/plugin-services.ts';
  import '/src/style.css';import '/src/workbench.css';import '/src/plugin-manager.css';
  window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async()=>1};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  document.documentElement.dataset.theme='dark';
  document.body.innerHTML='<div id="app"></div>';
  document.getElementById('app').innerHTML=${JSON.stringify(shell)};
  const pack=${JSON.stringify(pack)};const key='user:phpforge.database';
  const entry={key,scope:'user',dir:'/plugins/'+key,enabled:true,consented:true,needsConsent:false,granted:pack.manifest.permissions,manifest:pack.manifest};
  window.failures=[];window.addEventListener('ide-tool-state',e=>{if(e.detail.state==='failed')window.failures.push(e.detail.key+': '+e.detail.error);});
  const status=text=>{document.getElementById('status').textContent=text;};
  const base={id:'',name:'',comment:'',host:'localhost',port:5432,database:'app',user:'app',file:'',auth:'password',savePassword:'session',ssl:{mode:'prefer',ca:''},ssh:{enabled:false,host:'',port:22,user:'',key:''},readOnly:false,startup:'',schemas:[]};
  let sources=[{...base,id:'pg',name:'app@localhost',driver:'postgres'},{...base,id:'rd',name:'cache',driver:'redis',port:6379,database:'0',auth:'none',ssl:{mode:'disable',ca:''}}];
  const people=[['1','Ana','a'],['2','Bruno','b'],['3','Carla',null]];
  window.calls=[];let pendingExecute;
  const record=(method,args)=>{window.calls.push({method,args:JSON.parse(JSON.stringify(args))});};
  const api=new Proxy({
   workspace:async()=>({root:'/fixture',rootUri:'file:///fixture/',name:'fixture'}),
   plugins:async()=>[],gitStatus:async()=>({branch:'main'}),
   pluginList:async()=>({ideVersion:'0.2.17',userDir:'/plugins',projectDir:'/fixture/.php-ide/plugins',permissions:[],plugins:[entry],defaults:[]}),
   pluginSource:async()=>({manifest:pack.manifest,code:pack.main,rootUri:'file:///fixture/'}),
   pluginWorkbenchSource:async()=>({code:pack.code,style:pack.style}),
   pluginAuthorizeService:async()=>{},
   databaseSources:async()=>sources,databaseSaveSources:async list=>(sources=list),databasePasswordStored:async()=>true,
   databaseConnect:async input=>({id:'s-'+input.sourceId,label:input.name,driver:input.driver,schemas:input.driver==='redis'?['db0']:['public'],sourceId:input.sourceId,version:'fixture',readOnly:!!input.readOnly}),
   databaseTables:async id=>id==='s-rd'?[{name:'events',kind:'stream'},{name:'blob',kind:'string'},{name:'"img:\\\\xff\\\\xd8"',kind:'string',binary:true}]:[{name:'people',kind:'BASE TABLE'},{name:'logs',kind:'BASE TABLE'}],
   databaseTnsNames:async input=>{record('databaseTnsNames',[input]);return {dir:input.tnsAdmin||'/opt/oracle/network/admin',names:[{name:'PROD',detail:'tcps://db.example:2484/prod'},{name:'DEV',detail:'tcp://10.0.0.5:1521/dev'},{name:'HA',detail:'tcp://db1:1521/ha (+1 endereço(s), failover, balanceamento)'}]};},
   databasePage:async (...args)=>{record('databasePage',args);const [id,,table,offset,,options]=args;
    if(id==='s-rd'&&table==='events')return {columns:[{name:'id',type:'stream id',nullable:false,primary:true},{name:'fields',type:'string',nullable:false,primary:false}],rows:[['1-0','a=1 b=ff']],binary:[[0,1]],entries:[[{field:'a',value:'1',hex:[false,false]},{field:'b',value:'ff',hex:[false,true]}]],offset:0,hasMore:false,ordered:true,cellLimit:512,kind:'stream',ttl:-1,size:1,meta:'stream · 1 item · TTL sem expiração'};
    if(id==='s-rd')return {columns:[{name:'value',type:'string',nullable:false,primary:false}],rows:[['ff0041']],binary:[[0,0]],offset:0,hasMore:false,ordered:true,cellLimit:512,kind:'string',ttl:-1,size:1,meta:'string · 1 item'};
    if(table==='logs')return {columns:[{name:'at',type:'text',nullable:true,primary:false},{name:'msg',type:'text',nullable:true,primary:false}],rows:[['10:00','boot'],['10:00','boot']],rowIds:['(0,1)','(0,2)'],identity:'rowid',offset,hasMore:false,ordered:false,cellLimit:512,editable:true,filtered:false};
    let rows=people.slice();if(options?.where)rows=rows.filter(r=>Number(r[0])>1);if(/DESC/.test(options?.orderBy??''))rows.reverse();
    return {columns:[{name:'id',type:'integer',nullable:false,primary:true},{name:'name',type:'text',nullable:false,primary:false},{name:'note',type:'text',nullable:true,primary:false}],rows,offset,hasMore:false,ordered:true,cellLimit:512,editable:true,filtered:!!options?.where};},
   databaseGridEdit:async (...args)=>{record('databaseGridEdit',args);return {applied:args[3].length};},
   databaseRedisEdit:async (...args)=>{record('databaseRedisEdit',args);const op=args[2];if(op.op==='get')return {value:'ff0041',hex:true};return {result:'1'};},
   databaseExecute:(...args)=>{record('databaseExecute',args);return new Promise(r=>{pendingExecute=r;});},
   databaseCancel:async (...args)=>{record('databaseCancel',args);pendingExecute?.([{statement:'SELECT pg_sleep(30)',ms:1500,kind:'error',error:'Consulta cancelada pelo usuário: canceling statement due to user request'}]);},
   databaseModel:async()=>({label:'app',database:'app',defaultSchema:'public',schemas:[]}),
   databaseCompletionContext:async()=>({database:'app',defaultSchema:'public',searchPath:['public'],schemas:['public'],schemasComplete:true,fallback:false}),
   databaseCompletionPage:async()=>({rows:[],hasMore:false}),
  },{get:(target,key)=>target[key]??(async()=>[])});
  const editor=monaco.editor.create(document.getElementById('editor'));
  const hooks={virtual:(path,text,language,kind,uri)=>{const model=monaco.editor.getModel(uri)??monaco.editor.createModel(text,language,uri);editor.setModel(model);return model;},open:async()=>{},status,path:()=>'consoles/app/console'};
  const consoleUi=optionalPluginService('database',p=>p.sqlConsole(api,editor,hooks));
  optionalPluginService('database',p=>p.mountDatabase(api,{openConsole:session=>{pluginService('database').sqlIntelligence.connect(session);void consoleUi.open(session);},disconnected:id=>consoleUi.forget(id)}));
  document.getElementById('show-db').onclick=()=>{document.getElementById('agent').hidden=true;document.getElementById('db').hidden=false;};
  mountWorkbench(api);
  const manager=mountPluginManager(api);await manager.ready;
  const tools=mountToolPlugins(api,{path:()=>undefined,editor,status,changed:()=>{},open:async()=>{}});
  await tools.ready();
  window.editor=editor;window.ready=true;
 `;
const harness={name:'database-fidelity-harness',
 resolveId:id=>id==='/__database-fidelity.js'?'\0database-fidelity':undefined,
 load:id=>id==='\0database-fidelity'?bootstrap:undefined,
 configureServer(server){server.middlewares.use((req,res,next)=>{
  if(req.url!=='/__database-fidelity.html')return next();
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html data-theme="dark"><head><meta charset="utf-8"></head><body><script type="module" src="/__database-fidelity.js"></script></body></html>');
 });}};
const port=Number(process.env.HARNESS_PORT??1457);
const server=await createServer({plugins:[harness],server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();
if(process.argv.includes('--serve')){console.log(`Harness: http://127.0.0.1:${port}/__database-fidelity.html`);await new Promise(()=>{});}
const calls=async(page,method)=>(await page.evaluate(()=>window.calls)).filter(c=>c.method===method);
const shot=async(page,name)=>{if(process.env.SHOTS)await page.screenshot({path:join(process.env.SHOTS,name+'.png')});};
let browser;
try{
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:820}});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(`http://127.0.0.1:${port}/__database-fidelity.html`);await page.waitForFunction(()=>window.ready,undefined,{timeout:90000});
 assert.deepEqual(await page.evaluate(()=>window.failures),[]);
 await page.locator('#show-db').click();
 await page.locator('.db-source').first().waitFor();

 // 1. Read-only offered for every driver; Oracle TNS lists aliases and hides host/port.
 await page.locator('#db-add').click();await page.locator('dialog.datasources-dialog[open]').waitFor();
 if(await page.locator('#ds-driver-menu').isHidden())await page.locator('#ds-new').click();await page.locator('#ds-driver-menu [data-driver="sqlserver"]').click();
 await page.getByRole('tab',{name:'Opções'}).click();
 assert.equal(await page.locator('[name="readOnly"]').isDisabled(),false,'SQL Server read-only disabled');
 assert.match(await page.locator('#ds-readonly-hint').textContent(),/ROLLBACK/);
 await page.getByRole('tab',{name:'Geral'}).click();
 await page.locator('select[name="driver"]').selectOption('oracle');
 await page.locator('select[name="connectType"]').selectOption('tns');
 await page.locator('select[name="tnsName"] option[value="PROD"]').waitFor({state:'attached'});
 assert.equal(await page.locator('.host-row').isVisible(),false,'host row visible in TNS');
 assert.equal(await page.locator('.tns-row').first().isVisible(),true);
 assert.equal(await page.locator('[name="url"]').inputValue(),'oracle:thin:@PROD');
 assert.match(await page.locator('select[name="tnsName"] option[value="HA"]').getAttribute('title'),/failover, balanceamento/);
 await page.locator('select[name="tnsName"]').selectOption('DEV');
 assert.equal(await page.locator('[name="url"]').inputValue(),'oracle:thin:@DEV');
 await page.getByRole('tab',{name:'Opções'}).click();
 assert.equal(await page.locator('[name="readOnly"]').isDisabled(),false,'Oracle read-only disabled');
 await shot(page,'oracle-tns');
 await page.locator('#db-cancel').click();

 // 2. Table grid: WHERE, header sort, edit, add row, Submit.
 await page.locator('.db-source[data-id="pg"] .db-source-title').click();
 await page.locator('.db-source[data-id="pg"] .db-source-title').dblclick();
 await page.locator('.db-source[data-id="pg"] summary',{hasText:'public'}).click();
 await page.getByRole('button',{name:'people'}).click();
 await page.locator('table.table-grid').waitFor();
 assert.equal(await page.locator('#data-filters').isVisible(),true);
 await page.locator('#data-where').fill('id > 1');await page.locator('#data-where').press('Enter');
 await page.waitForFunction(()=>document.querySelectorAll('table.table-grid tbody tr').length===2);
 assert.deepEqual((await calls(page,'databasePage')).at(-1).args[5],{where:'id > 1',orderBy:''});
 await page.locator('table.table-grid th',{hasText:'id'}).click();await page.locator('table.table-grid th',{hasText:'id'}).click();
 await page.waitForFunction(()=>document.querySelector('#data-order').value==='"id" DESC');
 assert.equal((await calls(page,'databasePage')).at(-1).args[5].orderBy,'"id" DESC');
 assert.equal(await page.locator('table.table-grid th[aria-sort="descending"]').count(),1);
 await page.locator('td[data-row="0"][data-col="1"]').dblclick();
 await page.locator('.cell-editor').fill('Carla Souza');await page.locator('.cell-editor').press('Enter');
 assert.equal(await page.locator('td.changed').count(),1);
 await page.locator('#data-grid').focus();await page.keyboard.press('Meta+n');
 await page.locator('.cell-editor').fill('9');await page.locator('.cell-editor').press('Tab');
 await page.locator('.cell-editor').fill('Nova');await page.locator('.cell-editor').press('Enter');
 assert.equal(await page.locator('tr.inserted').count(),1);
 assert.match(await page.locator('#grid-pending').textContent(),/2 alteração/);
 await page.locator('#data-refresh').click();
 assert.match(await page.locator('#data-message').textContent(),/Envie/);
 await shot(page,'grid-pending');
 await page.locator('#data-grid').focus();await page.keyboard.press('Meta+Enter');
 await page.waitForFunction(()=>window.calls.some(c=>c.method==='databaseGridEdit'));
 const [submit]=await calls(page,'databaseGridEdit');
 assert.deepEqual(submit.args[3],[{op:'update',key:{id:'3'},set:{name:'Carla Souza'}},{op:'insert',values:{id:'9',name:'Nova'}}]);
 await page.waitForFunction(()=>!document.querySelector('td.changed')&&!document.querySelector('tr.inserted'));

 // 2b. Table without a primary key: rows identified by the physical locator (ctid), even duplicates.
 await page.getByRole('button',{name:'logs'}).click();
 await page.waitForFunction(()=>document.querySelector('#data-message')?.textContent.includes('localizador físico'));
 await page.locator('td[data-row="1"][data-col="1"]').dblclick();
 await page.locator('.cell-editor').fill('shutdown');await page.locator('.cell-editor').press('Enter');
 await page.locator('#data-grid').focus();await page.keyboard.press('Meta+Enter');
 await page.waitForFunction(()=>window.calls.filter(c=>c.method==='databaseGridEdit').length===2);
 const nokey=(await calls(page,'databaseGridEdit')).at(-1);
 assert.equal(nokey.args[2],'logs');
 assert.deepEqual(nokey.args[3],[{op:'update',key:{$rowid:'(0,2)',at:'10:00',msg:'boot'},set:{msg:'shutdown'}}]);
 await shot(page,'grid-no-primary-key');

 // 3. Console: Stop button and ⌘F2 cancel the running statement.
 await page.locator('.db-source[data-id="pg"] .db-source-title').click();
 await page.locator('#db-console-open').click();
 await page.waitForFunction(()=>document.querySelector('#sql-connection')?.value);
 await page.evaluate(()=>{window.editor.setValue('SELECT pg_sleep(30)');window.editor.focus();});
 await page.locator('#sql-execute').click();
 await page.waitForFunction(()=>!document.querySelector('#sql-cancel').disabled);
 assert.equal(await page.locator('#sql-cancel').getAttribute('title'),'Parar (⌘F2)');
 await page.keyboard.press('Meta+F2');
 await page.waitForFunction(()=>document.querySelector('#sql-tabs [role="tab"]')?.textContent.startsWith('Cancelado'));
 assert.equal((await calls(page,'databaseCancel')).length,1);
 assert.equal(await page.locator('#sql-cancel').isDisabled(),true);
 await shot(page,'console-cancelled');

 // 4. Redis: binary value in hex, stream entry add/delete, new key.
 await page.locator('.db-source[data-id="rd"] .db-source-title').dblclick();
 await page.locator('.db-source[data-id="rd"] summary',{hasText:'db0'}).click();
 await page.getByRole('button',{name:'blob'}).click();
 await page.locator('#data-grid td.binary-value').waitFor();
 await page.locator('#redis-edit').click();
 assert.equal(await page.locator('#redis-edit-fields select[name="format"]').inputValue(),'hex');
 await page.locator('#redis-edit-fields textarea[name="value"]').fill('00ff');
 await page.locator('#redis-edit-ok').click();
 await page.waitForFunction(()=>window.calls.some(c=>c.method==='databaseRedisEdit'&&c.args[2].op==='set'));
 const set=(await calls(page,'databaseRedisEdit')).find(c=>c.args[2].op==='set').args[2];
 assert.deepEqual([set.old,set.value,set.hex],['ff0041','00ff',['old','value']]);
 await page.getByRole('button',{name:'events'}).click();
 await page.locator('#redis-add:not([disabled])').waitFor();
 await page.locator('#redis-add').click();
 await page.locator('#redis-edit-fields textarea[name="fields"]').fill('kind=login\nraw=0xff00');
 await page.locator('#redis-edit-ok').click();
 await page.waitForFunction(()=>window.calls.some(c=>c.method==='databaseRedisEdit'&&c.args[2].op==='xadd'));
 const xadd=(await calls(page,'databaseRedisEdit')).find(c=>c.args[2].op==='xadd').args[2];
 assert.deepEqual(xadd.fields,[{field:'kind',value:'login',hex:[false,false]},{field:'raw',value:'ff00',hex:[false,true]}]);
 assert.equal(xadd.id,'*');
 await page.locator('#data-grid tbody tr').first().click();
 await page.locator('#redis-remove').click();await page.locator('#redis-edit-ok').click();
 await page.waitForFunction(()=>window.calls.some(c=>c.method==='databaseRedisEdit'&&c.args[2].op==='xdel'));
 await page.locator('.db-new-key').click();
 await page.locator('#redis-edit-fields input[name="key"]').fill('queue:new');
 await page.locator('#redis-edit-fields select[name="kind"]').selectOption('hash');
 await page.locator('#redis-edit-ok').click();
 await page.locator('#redis-edit-fields input[name="field"]').fill('f');
 await page.locator('#redis-edit-fields textarea[name="value"]').fill('v');
 await page.locator('#redis-edit-fields input[name="ttl"]').fill('60');
 await page.locator('#redis-edit-ok').click();
 await page.waitForFunction(()=>window.calls.some(c=>c.method==='databaseRedisEdit'&&c.args[2].op==='create'));
 const create=(await calls(page,'databaseRedisEdit')).find(c=>c.args[2].op==='create').args[2];
 assert.deepEqual([create.key,create.kind,create.field,create.value,create.ttl],['queue:new','hash','f','v',60]);
 await shot(page,'redis-new-key');
 // Key whose name is not UTF-8: listed in redis-cli quoting and opened by that name.
 await page.getByRole('button',{name:'"img:\\xff\\xd8"'}).click();
 await page.waitForFunction(()=>window.calls.some(c=>c.method==='databasePage'&&c.args[2]==='"img:\\xff\\xd8"'));
 assert.deepEqual(errors,[]);
 console.log('WebKit: read-only per driver, Oracle TNS aliases (failover/balance detail), grid WHERE/ORDER BY/edit/Submit, no-PK grid by row locator, Stop with ⌘F2 and Redis hex, stream, new key and non-UTF-8 key flows OK.');
}finally{await browser?.close();await server.close();}
