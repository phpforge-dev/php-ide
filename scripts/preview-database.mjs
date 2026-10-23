// Fixture visual do diálogo de fontes de dados (API simulada); o comportamento real é validado por check-native.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1422','--strictPort'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1422'))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:940}});
 await page.emulateMedia({colorScheme:process.argv.includes('--light')?'light':'dark'});
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 let saved=[{id:'pg',name:'app@localhost',comment:'',driver:'postgres',host:'localhost',port:5432,database:'app',user:'postgres',file:'',auth:'password',savePassword:'session',ssl:{mode:'prefer',ca:''},ssh:{enabled:false,host:'',port:22,user:'',key:''},readOnly:false,startup:'',schemas:[]},{id:'rd',name:'cache',comment:'',driver:'redis',host:'localhost',port:6379,database:'0',user:'',file:'',auth:'none',savePassword:'session',ssl:{mode:'disable',ca:''},ssh:{enabled:false,host:'',port:22,user:'',key:''},readOnly:false,startup:'',schemas:[]}];
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'customer-api'};
   if(method==='tree')return [];
   if(method==='databaseSources')return saved;
   if(method==='databaseSaveSources'){saved=args[0];return saved;}
   if(method==='databasePasswordStored')return args[0]==='pg';
   if(method==='database')return {version:'PostgreSQL 16.4 on aarch64-unknown-linux-musl',schemas:['public','billing','audit']};
   if(method==='databaseConnect')return {id:'s-'+args[0].sourceId,label:args[0].name,driver:args[0].driver,schemas:args[0].driver==='redis'?['db0','db1']:['public','billing'],sourceId:args[0].sourceId,version:'16.4'};
   if(method==='databaseTables')return [{name:'customers',kind:'BASE TABLE'},{name:'invoices',kind:'BASE TABLE'},{name:'v_balance',kind:'VIEW'}];
   if(method==='gitStatus')return {branch:'main',files:[],indexToken:'p'};
   if(method==='gitOperations')return {branches:[],remotes:[],stashes:[],head:'p'};
   return [];
  };
 }});
 await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();
 `}));
 await page.goto('http://127.0.0.1:1422');await page.waitForTimeout(800);
 await mkdir('.artifacts',{recursive:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#show-db').click();await page.locator('.db-source').first().waitFor();
 await page.locator('.db-source-title').first().dblclick();await page.locator('.db-source.expanded summary').first().waitFor();await page.locator('.db-source.expanded summary').first().click();await page.waitForTimeout(200);
 await page.screenshot({path:'.artifacts/database-tree-preview.png'});
 await page.locator('#db-properties').click();await page.waitForTimeout(200);await page.screenshot({path:'.artifacts/database-dialog-general.png'});
 await page.locator('#db-test').click();await page.waitForTimeout(200);await page.locator('[data-tab="schemas"]').click();await page.screenshot({path:'.artifacts/database-dialog-schemas.png'});
 await page.locator('[data-tab="ssh"]').click();await page.screenshot({path:'.artifacts/database-dialog-ssh.png'});
 await page.locator('#ds-new').click();await page.screenshot({path:'.artifacts/database-dialog-drivers.png'});
 await page.locator('.driver-menu [data-driver="sqlite"]').click();await page.screenshot({path:'.artifacts/database-dialog-sqlite.png'});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Visual fixtures: .artifacts/database-*.png');
} finally {await browser?.close();server.kill();}
