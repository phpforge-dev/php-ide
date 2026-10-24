// Fixture visual do diálogo de fontes de dados (API simulada); o comportamento real é validado por check-native.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
// This fixture executes the pinned production plugin, never a sibling working checkout.
const packageRoot=new URL('../.tools/plugin-packages/database/',import.meta.url);
const expected=JSON.parse(await readFile(new URL('../default-plugins.json',import.meta.url),'utf8')).find(entry=>entry.plugin.id==='phpforge.database');
const manifest=await readFile(new URL('plugin.json',packageRoot),'utf8').then(JSON.parse).catch(()=>null);
const revision=await readFile(new URL('.revision',packageRoot),'utf8').catch(()=>null);
if(!expected||manifest?.id!==expected.plugin.id||manifest.version!==expected.plugin.version||revision!==expected.plugin.revision)throw Error('Pinned database test package is missing or stale. Run npm run setup:plugins first.');
if(createHash('sha256').update(await readFile(new URL(manifest.main,packageRoot))).digest('hex')!==expected.sha256)throw Error('Database plugin entry checksum mismatch');
const pluginCode=await readFile(new URL(manifest.workbench.main,packageRoot),'utf8');
const pluginStyle=await readFile(new URL(manifest.workbench.style,packageRoot),'utf8');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1422','--strictPort'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1422'))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:940}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({colorScheme:process.argv.includes('--light')?'light':'dark'});
 await page.route('**/fixture-database-plugin.js',route=>route.fulfill({contentType:'application/javascript',body:pluginCode}));
 await page.route('**/fixture-database-plugin.css',route=>route.fulfill({contentType:'text/css',body:pluginStyle}));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 let saved=[{id:'pg',name:'app@localhost',comment:'',driver:'postgres',host:'localhost',port:5432,database:'app',user:'postgres',file:'',auth:'password',savePassword:'session',ssl:{mode:'prefer',ca:''},ssh:{enabled:false,host:'',port:22,user:'',key:''},readOnly:false,startup:'',schemas:[]},{id:'rd',name:'cache',comment:'',driver:'redis',host:'localhost',port:6379,database:'0',user:'',file:'',auth:'none',savePassword:'session',ssl:{mode:'disable',ca:''},ssh:{enabled:false,host:'',port:22,user:'',key:''},readOnly:false,startup:'',schemas:[]}];
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='pluginList')return {plugins:[],directories:[]};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'customer-api'};
   if(method==='tree')return [];
   if(method==='databaseSources')return saved;
   if(method==='databaseSaveSources'){saved=args[0];return saved;}
   if(method==='databaseLaravelFiles')return ['.env','.env.testing','.env.invalid'];
   if(method==='databaseImportLaravel'){if(args[0]==='.env.invalid')throw Error('DB_CONNECTION não suportado na importação. Configure o driver manualmente.');return {driver:'mysql',host:'127.0.0.1',port:3307,database:args[0]==='.env.testing'?'laravel_test':'laravel',user:'sail',password:'synthetic-fixture-password',file:'',warnings:['Revise o host e a porta publicados pelo Docker.']};}
   if(method==='databasePasswordStored')return args[0]==='pg';
   if(method==='database')return {version:'PostgreSQL 16.4 on aarch64-unknown-linux-musl',schemas:['public','billing','audit']};
   if(method==='databaseConnect')return {id:'s-'+args[0].sourceId,label:args[0].name,driver:args[0].driver,schemas:args[0].driver==='redis'?['db0','db1']:['public','billing'],sourceId:args[0].sourceId,version:'16.4'};
   if(method==='databaseTables')return [{name:'customers',kind:'BASE TABLE'},{name:'invoices',kind:'BASE TABLE'},{name:'v_balance',kind:'VIEW'}];
   if(method==='gitStatus')return {branch:'main',files:[],indexToken:'p'};
   if(method==='gitOperations')return {branches:[],remotes:[],stashes:[],head:'p'};
   return [];
  };
 }});
 const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');
 const {t:tr,msg,html}=await import('/src/i18n.ts');const {toolIcon}=await import('/src/tool-window.ts');
 const {providePluginService}=await import('/src/plugin-services.ts');const {activate}=await import('/fixture-database-plugin.js');
 const owned=[];activate({api:window.ide,monaco,tr,msg,html,toolIcon,own:value=>{owned.push(typeof value==='function'?value:()=>value?.dispose?.());return value;},provide:(name,value)=>{const off=providePluginService('synthetic-database-fixture',name,value);owned.push(off);return off;}});
 window.addEventListener('beforeunload',()=>owned.reverse().forEach(dispose=>dispose()));
 const style=document.createElement('link');style.rel='stylesheet';style.href='/fixture-database-plugin.css';document.head.append(style);
 await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();
 `}));
 await page.goto('http://127.0.0.1:1422');await page.waitForTimeout(800);
 await mkdir('.artifacts',{recursive:true});
 await page.locator('#show-db').click();await page.locator('.db-source').first().waitFor();
 await page.locator('.db-source-title').first().dblclick();await page.locator('.db-source.expanded summary').first().waitFor();await page.locator('.db-source.expanded summary').first().click();await page.waitForTimeout(200);
 await page.screenshot({path:'.artifacts/database-tree-preview.png'});
 await page.locator('#db-properties').click();await page.waitForTimeout(200);await page.screenshot({path:'.artifacts/database-dialog-general.png'});
 const assert=(value,message)=>{if(!value)throw Error(message);};
 await page.locator('#ds-import-env').click();await page.locator('#ds-import-picker').waitFor();await page.locator('#ds-env-file').selectOption('.env.testing');await page.locator('#ds-import-read').click();await page.waitForFunction(()=>document.querySelector('[name=database]').value==='laravel_test');
 assert(await page.locator('[name=port]').inputValue()==='3307','import port');assert(await page.locator('#connection-form [name=password]').getAttribute('type')==='password','password not masked');assert(await page.locator('#connection-form [name=password]').inputValue()==='synthetic-fixture-password','password missing');
 assert(!(await page.locator('[name=url]').inputValue()).includes('synthetic'),'password in URL');assert(!(await page.locator('.datasources-dialog').innerText()).includes('synthetic'),'password exposed');
 await page.screenshot({path:'.artifacts/database-dialog-laravel.png'});
 await page.locator('#ds-import-env').click();await page.locator('#ds-env-file').selectOption('.env.invalid');await page.locator('#ds-import-read').click();await page.waitForFunction(()=>document.getElementById('ds-import-status').textContent.includes('não suportado'));assert(await page.locator('[name=database]').inputValue()==='laravel_test','failed import changed draft');
 await page.locator('#db-cancel').click();await page.locator('#db-properties').click();assert(await page.locator('#ds-list li').count()===2,'cancel saved imported source');assert(await page.locator('#connection-form [name=password]').inputValue()==='','password retained after cancel');

 await page.locator('#db-test').click();await page.waitForTimeout(200);await page.locator('[data-tab="schemas"]').click();await page.screenshot({path:'.artifacts/database-dialog-schemas.png'});
 await page.locator('[data-tab="ssh"]').click();await page.screenshot({path:'.artifacts/database-dialog-ssh.png'});
 await page.locator('#ds-new').click();await page.screenshot({path:'.artifacts/database-dialog-drivers.png'});
 await page.locator('.driver-menu [data-driver="sqlite"]').click();await page.screenshot({path:'.artifacts/database-dialog-sqlite.png'});
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile('.artifacts/database-plugin-fixture.json',JSON.stringify({ok:true,runtime:'Chromium with synthetic API',plugin:expected.plugin,checks:['Pinned database bundle mounted through SDK','Source tree and connection dialog','Laravel import preview and masked credentials','Recoverable invalid import without overwriting draft','Cancel clears imported password and keeps saved sources','Schema, SSH/SSL and driver tabs'],errors},null,2));
 console.log('Visual fixtures: .artifacts/database-*.png');
} finally {await browser?.close();server.kill();}
