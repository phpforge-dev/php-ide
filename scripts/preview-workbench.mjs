// Visual fixture only: native behavior is verified separately by check-native.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1421','--strictPort'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1421'))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'}); const page=await browser.newPage({viewport:{width:1440,height:940},deviceScaleFactor:1});
 await page.emulateMedia({colorScheme:'dark'});
 const text=await readFile('fixtures/php-intelligence/probe.php','utf8');
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 const file={path:'probe.php',uri:'file:///fixture/probe.php',text:${JSON.stringify(text.replace('$user->label();','$user->label(); // local change'))},etag:'preview'};
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='dockerContexts')return [{name:'desktop-linux',current:true,endpoint:'unix:///docker.sock'}];
   if(method==='dockerSnapshot')return {version:'29.0',os:'linux',containers:[{id:'a'.repeat(64),name:'customer-api-php',image:'php:8.3-fpm',state:'running',status:'Up 12 minutes',ports:'9000/tcp'},{id:'b'.repeat(64),name:'customer-api-postgres',image:'postgres:16',state:'running',status:'Up 12 minutes',ports:'127.0.0.1:5432 → 5432/tcp'}],images:[{id:'sha256:fixture',repository:'php',tag:'8.3-fpm',size:'490 MB'}],volumes:[{name:'customer-api-data',driver:'local'}],networks:[{name:'customer-api_default',driver:'bridge',id:'preview'}]};
   if(method==='dockerLogs')return '2026-10-22T12:00:00Z [notice] fpm is running, pid 1\\n2026-10-22T12:00:00Z [notice] ready to handle connections\\n2026-10-22T12:02:14Z GET /api/customers 200 18ms';
   if(method==='dockerComposeFiles')return ['compose.yaml'];
   if(method==='recentProjects')return [{name:'customer-api',path:'/fixture',available:true},{name:'billing-service',path:'/Users/developer/Projects/billing-service',available:true},{name:'admin-panel',path:'/Users/developer/Projects/admin-panel',available:true},{name:'legacy-api',path:'/Users/developer/Archive/legacy-api',available:false}];
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'customer-api'};
   if(method==='tree')return [{name:'src',path:'src',directory:true},{name:'vendor',path:'vendor',directory:true},{name:'probe.php',path:'probe.php',directory:false},{name:'composer.json',path:'composer.json',directory:false}];
   if(method==='read')return file;
   if(method==='agents')return [{id:'codex',name:'Codex',available:true,detail:'Use sua conta conectada para iniciar uma conversa.'}];
   if(method==='gitStatus')return {branch:'main',files:[],indexToken:'preview'};
   if(method==='gitOperations')return {branches:[],remotes:[],stashes:[],head:'preview'};
   if(method==='gitEditorBase')return {text:${JSON.stringify(text)},label:'HEAD → editor'};
   if(method==='language')return args[0].method==='textDocument/references'?[{uri:file.uri,range:{start:{line:7,character:7},end:{line:7,character:12}}},{uri:file.uri,range:{start:{line:10,character:8},end:{line:10,character:13}}}]:null;
   return [];
  };
 }});
 await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();
 `}));
 await page.goto('http://127.0.0.1:1421');await page.getByRole('button',{name:'probe.php',exact:true}).click();await page.waitForTimeout(1000);
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/workbench-preview.png'});
 await page.waitForFunction(()=>[...document.querySelectorAll('.resource-icon img')].every(img=>img.complete&&img.naturalWidth===16));
 if(await page.locator('#tree button[data-ext="php"]').evaluate(el=>getComputedStyle(el,'::before').content)!=='none')throw Error('Old PHP glyph still visible');
 await page.locator('#appearance').click();await page.screenshot({path:'.artifacts/appearance-dark.png'});if(await page.locator('#appearance-dialog').evaluate(el=>el.matches(':modal')))throw Error('Aparência bloqueia a prévia do editor');await page.locator('[data-theme-option=light]').click();await page.waitForTimeout(300);await page.screenshot({path:'.artifacts/appearance-light.png'});await page.locator('#appearance-close').click();await page.screenshot({path:'.artifacts/file-icons-light-preview.png'});await page.locator('#appearance').click();await page.locator('#appearance-theme').selectOption('system');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await page.locator('#appearance-theme').selectOption('dark');await page.emulateMedia({colorScheme:'light'});if(await page.evaluate(()=>document.documentElement.dataset.theme)!=='dark')throw Error('Tema explícito foi substituído pelo sistema');await page.locator('#appearance-close').click();await page.locator('#theme-toggle').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.locator('#theme-toggle').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');

 await page.locator('#open').click();await page.locator('.recent-row').first().waitFor();await page.screenshot({path:'.artifacts/recent-projects-preview.png'});await page.locator('#open').click();
 await page.locator('.git-line-modified').click();await page.screenshot({path:'.artifacts/git-line-preview.png'});await page.getByRole('button',{name:'Fechar alterações Git',exact:true}).click();
 await page.locator('.view-lines .view-line').nth(7).click({position:{x:80,y:10}}); await page.locator('#references').click();await page.locator('.usage-result').first().waitFor();
 await page.screenshot({path:'.artifacts/usages-preview.png'});await page.getByRole('button',{name:'Fechar referências',exact:true}).click();
 await page.locator('#show-agent').click();await page.screenshot({path:'.artifacts/agent-preview.png'});
 await page.locator('#show-db').click();await page.locator('#db-add').click();await page.screenshot({path:'.artifacts/database-preview.png'});
 await page.locator('#db-dialog-close').click();await page.locator('.tools>.hide-tool').click();await page.locator('#show-docker').click();await page.locator('.docker-resource').first().waitFor();await page.locator('.docker-resource').first().click();await page.locator('#docker-tab-logs').click();await page.waitForTimeout(300);await page.screenshot({path:'.artifacts/docker-services-preview.png'});
 await page.locator('#theme-toggle').click();await page.reload();await page.locator('#theme-toggle').waitFor();if(await page.evaluate(()=>document.documentElement.dataset.theme)!=='light')throw Error('Tema não persistiu após recarregar');await writeFile('.artifacts/appearance-checks.json',JSON.stringify({ok:true,checks:['prévia sem modal','seleção por cards','sistema acompanha preferência do SO','tema explícito preservado','alternância rápida','persistência após recarga']},null,2));
 console.log('Visual fixtures: .artifacts/{workbench,agent,database}-preview.png');
} finally {await browser?.close();server.kill();}
