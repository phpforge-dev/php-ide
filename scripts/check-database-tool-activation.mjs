// The Database rail icon reaches the installed plugin after the startup reload of tool plugins.
// Regression: a preview plugin (SVG/Markdown/Image) wrapped #editor in .editor-split for good, so the
// Database plugin's second activation threw NotFoundError and the icon opened the Plugins Marketplace.
// When the plugin is installed but not active, the icon opens its card in Plugins › Installed instead.
// DATABASE_PLUGIN_DIR checks a local plugin-database build before it is pinned; --serve keeps the harness up.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createServer} from 'vite';
import {webkit} from '@playwright/test';

const dirs={database:resolve(process.env.DATABASE_PLUGIN_DIR??'.tools/plugin-packages/database'),svg:resolve('.tools/plugin-packages/svg-preview')};
const pack=async dir=>{const manifest=JSON.parse(await readFile(join(dir,'plugin.json'),'utf8'));return {manifest,main:await readFile(join(dir,manifest.main),'utf8'),code:await readFile(join(dir,manifest.workbench.main),'utf8'),style:await readFile(join(dir,manifest.workbench.style),'utf8')};};
const packages={'user:phpforge.database':await pack(dirs.database),'user:phpforge.svg-preview':await pack(dirs.svg)};
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
  document.body.innerHTML='<div id="app"></div>';
  document.getElementById('app').innerHTML=${JSON.stringify(shell)};
  const packages=${JSON.stringify(packages)};
  const state=Object.fromEntries(Object.keys(packages).map(key=>[key,true]));
  const entry=key=>({key,scope:'user',dir:'/plugins/'+key,enabled:state[key],consented:true,needsConsent:false,granted:packages[key].manifest.permissions,manifest:packages[key].manifest});
  window.failures=[];window.addEventListener('ide-tool-state',e=>{if(e.detail.state==='failed')window.failures.push(e.detail.key+': '+e.detail.error);});
  const status=text=>{document.getElementById('status').textContent=text;};
  const api=new Proxy({
   workspace:async()=>({root:'/fixture',rootUri:'file:///fixture/',name:'fixture'}),
   plugins:async()=>[],gitStatus:async()=>({branch:'main'}),
   pluginList:async()=>({ideVersion:'0.2.16',userDir:'/plugins',projectDir:'/fixture/.php-ide/plugins',permissions:[],plugins:Object.keys(packages).map(entry),defaults:[]}),
   pluginSource:async key=>({manifest:packages[key].manifest,code:packages[key].main,rootUri:'file:///fixture/'}),
   pluginWorkbenchSource:async key=>({code:packages[key].code,style:packages[key].style}),
   pluginAuthorizeService:async()=>{},
  },{get:(target,key)=>target[key]??(async()=>[])});
  const editor=monaco.editor.create(document.getElementById('editor'));
  const consoleUi=optionalPluginService('database',p=>p.sqlConsole(api,editor,{virtual:()=>{},open:async()=>{},status,path:()=>undefined}));
  optionalPluginService('database',p=>p.mountDatabase(api,{openConsole:()=>{},disconnected:id=>consoleUi.forget(id)}));
  // Same entry point as src/main.ts.
  document.getElementById('show-db').onclick=()=>{if(!pluginService('database')){status('Ative o plugin Database em Plugins.');window.dispatchEvent(new CustomEvent('ide-show-plugins',{detail:{id:'phpforge.database'}}));return;}document.getElementById('agent').hidden=true;document.getElementById('db').hidden=false;};
  mountWorkbench(api);
  const manager=mountPluginManager(api);await manager.ready;
  const tools=mountToolPlugins(api,{path:()=>undefined,editor,status,changed:()=>{},open:async()=>{}});
  await tools.ready();
  window.setEnabled=async(key,value)=>{state[key]=value;await manager.reload();await tools.ready();};
  window.reloadTools=()=>tools.reload();
  window.ready=true;
 `;
// The bootstrap is a virtual module so Vite resolves its bare imports (monaco-editor).
const harness={name:'database-tool-harness',
 resolveId:id=>id==='/__database-tool.js'?'\0database-tool':undefined,
 load:id=>id==='\0database-tool'?bootstrap:undefined,
 configureServer(server){server.middlewares.use((req,res,next)=>{
  if(req.url!=='/__database-tool.html')return next();
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html data-theme="dark"><head><meta charset="utf-8"></head><body><script type="module" src="/__database-tool.js"></script></body></html>');
 });}};
const server=await createServer({plugins:[harness],server:{host:'127.0.0.1',port:1445,strictPort:true}});
await server.listen();
if(process.argv.includes('--serve')){console.log('Harness: http://127.0.0.1:1445/__database-tool.html');await new Promise(()=>{});}
let browser;
try{
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:760}});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('http://127.0.0.1:1445/__database-tool.html');await page.waitForFunction(()=>window.ready,undefined,{timeout:60000});
 // The startup reload: the project name lands after the first activation and re-activates every tool plugin.
 assert.equal(await page.locator('.code > .editor-split').count(),1,'SVG Preview did not wrap the editor');
 await page.evaluate(()=>window.reloadTools());
 assert.deepEqual(await page.evaluate(()=>window.failures),[]);
 await page.locator('#show-db').click();
 assert.equal(await page.locator('#plugins-dialog[open]').count(),0,'Database icon opened Plugins: '+await page.locator('#status').textContent());
 assert.equal(await page.locator('#db').isVisible(),true);
 assert.ok(await page.locator('.code > #sql-toolbar + .editor-split').count(),'SQL toolbar is not above the editor');
 await page.locator('#db-add').click();
 assert.equal(await page.locator('dialog.datasources-dialog[open]').count(),1,'New data source dialog did not open');
 await page.keyboard.press('Escape');
 // Disabled: the icon names the plugin and opens its card (state + Activate), even if Marketplace was the last tab.
 await page.evaluate(()=>window.setEnabled('user:phpforge.database',false));
 await page.evaluate(()=>{window.dispatchEvent(new Event('ide-show-plugins'));});
 await page.getByRole('tab',{name:'Marketplace'}).click();
 await page.keyboard.press('Escape');
 await page.locator('#show-db').click();
 await page.locator('#plugins-dialog[open]').waitFor();
 assert.equal(await page.getByRole('tab',{name:'Instalados'}).getAttribute('aria-selected'),'true');
 const card=page.locator('[data-installed-plugin="phpforge.database"]');
 assert.equal(await card.evaluate(el=>el===document.activeElement),true,'Database card is not focused');
 assert.match(await card.textContent(),/Desativado/);
 await card.getByRole('button',{name:'Ativar'}).click();
 assert.deepEqual(errors,[]);
 console.log('WebKit: Database survives the tool-plugin reload, the rail icon opens its data source flow, and a disabled plugin opens its card.');
}finally{await browser?.close();await server.close();}
