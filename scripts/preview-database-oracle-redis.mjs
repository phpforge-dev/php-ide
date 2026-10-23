// Recorte 26: fixture visual do driver Oracle e da edição Redis (API simulada); comportamento real em check-databases-oracle-redis.mjs.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1423','--strictPort'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1423'))resolve();});server.once('exit',reject);});
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
   if(method==='databasePage'&&args[0].startsWith('s-rd'))return {columns:[{name:'field',type:'string',nullable:false,primary:true},{name:'value',type:'string',nullable:false,primary:false}],rows:Array.from({length:50},(_,i)=>['f'+(i+1+args[3]),'valor '+(i+1+args[3])]),offset:args[3],hasMore:true,cursor:'1536:0',ordered:true,cellLimit:512,kind:'hash',ttl:-1,size:12000,meta:'hash · 12000 itens · TTL sem expiração'};
   if(method==='databaseRedisEdit'){window.__edits=(window.__edits||[]).concat([args[2]]);return args[2].op==='get'?{value:'valor 3'}:{result:'1'};}
   if(method==='databaseTables'&&args[0].startsWith('s-rd'))return [{name:'session:42',kind:'hash'},{name:'queue',kind:'list'}];
   if(method==='databaseTables')return [{name:'customers',kind:'BASE TABLE'},{name:'invoices',kind:'BASE TABLE'},{name:'v_balance',kind:'VIEW'}];
   if(method==='gitStatus')return {branch:'main',files:[],indexToken:'p'};
   if(method==='gitOperations')return {branches:[],remotes:[],stashes:[],head:'p'};
   return [];
  };
 }});
 await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();
 `}));
 await page.goto('http://127.0.0.1:1423');await page.waitForTimeout(800);
 await mkdir('.artifacts',{recursive:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#show-db').click();await page.locator('.db-source').nth(1).waitFor();
 await page.locator('.db-source-title').nth(1).dblclick();await page.locator('.db-source.expanded summary').first().waitFor();await page.locator('.db-source.expanded summary').first().click();
 await page.locator('.db-table',{hasText:'session:42'}).click();await page.locator('#data-grid tbody tr').nth(2).click();await page.waitForTimeout(150);
 await page.screenshot({path:'.artifacts/database-redis-edit.png'});
 await page.locator('#data-grid tbody tr').nth(2).dblclick();await page.locator('.redis-edit-dialog[open]').waitFor();await page.screenshot({path:'.artifacts/database-redis-edit-dialog.png'});
 await page.locator('.redis-edit-dialog textarea').fill('novo');await page.locator('#redis-edit-ok').click();await page.waitForTimeout(150);
 const edits=await page.evaluate(()=>window.__edits);if(JSON.stringify(edits.at(-1))!==JSON.stringify({op:'hset',key:'session:42',field:'f3',old:'valor 3',newField:'f3',value:'novo'}))throw Error('edição: '+JSON.stringify(edits));
 await page.locator('#data-next').click();await page.waitForTimeout(150);await page.locator('#redis-delete').click();await page.locator('.redis-edit-dialog[open]').waitFor();await page.screenshot({path:'.artifacts/database-redis-delete.png'});await page.locator('#redis-edit-cancel').click();
 await page.locator('#db-add').click();await page.locator('.driver-menu [data-driver="oracle"]').click();await page.waitForTimeout(150);await page.screenshot({path:'.artifacts/database-dialog-oracle.png'});
 await page.locator('select[name="connectType"]').selectOption('sid');await page.waitForTimeout(100);
 const url=await page.locator('input[name="url"]').inputValue();if(url!=='oracle:thin:@localhost:1521:FREEPDB1')throw Error('URL Oracle: '+url);
 await page.locator('[data-tab="ssh"]').click();await page.screenshot({path:'.artifacts/database-dialog-oracle-ssl.png'});
 const own=errors.filter(e=>!e.includes('listing.plugins'));if(own.length)throw Error(own.join('\n'));
 console.log('Visual fixtures: .artifacts/database-redis-*.png, database-dialog-oracle*.png');
} finally {await browser?.close();server.kill();}
