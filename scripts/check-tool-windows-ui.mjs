// Visual fixture only: native behavior is verified separately by check-native.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1425','--strictPort'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1425'))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'}); const page=await browser.newPage({viewport:{width:1440,height:940},deviceScaleFactor:1});
 await page.emulateMedia({colorScheme:'dark'});
 const text=await readFile('fixtures/php-intelligence/probe.php','utf8');
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 const file={path:'probe.php',uri:'file:///fixture/probe.php',text:${JSON.stringify(text.replace('$user->label();','$user->label(); // local change'))},etag:'preview'};
 let changes=[{path:'src/Customer.php',index:'M',worktree:' '},{path:'src/Invoice.php',index:' ',worktree:'M'},{path:'tests/CustomerTest.php',index:'?',worktree:'?'}];
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='dockerContexts')return [{name:'desktop-linux',current:true,endpoint:'unix:///docker.sock'}];
   if(method==='dockerSnapshot')return {version:'29.0',os:'linux',containers:[{id:'a'.repeat(64),name:'customer-api-php',image:'php:8.3-fpm',state:'running',status:'Up 12 minutes',ports:'9000/tcp'},{id:'b'.repeat(64),name:'customer-api-postgres',image:'postgres:16',state:'exited',status:'Exited (0)',ports:'127.0.0.1:5432 → 5432/tcp'}],images:[{id:'sha256:fixture',repository:'php',tag:'8.3-fpm',size:'490 MB'}],volumes:[{name:'customer-api-data',driver:'local'}],networks:[{name:'customer-api_default',driver:'bridge',id:'preview'}]};
   if(method==='dockerLogs')return '2026-10-22T12:00:00Z [notice] fpm is running, pid 1\\n2026-10-22T12:00:00Z [notice] ready to handle connections\\n2026-10-22T12:02:14Z GET /api/customers 200 18ms';
   if(method==='dockerComposeFiles')return ['compose.yaml'];
   if(method==='recentProjects')return [{name:'customer-api',path:'/fixture',available:true},{name:'billing-service',path:'/Users/developer/Projects/billing-service',available:true},{name:'admin-panel',path:'/Users/developer/Projects/admin-panel',available:true},{name:'legacy-api',path:'/Users/developer/Archive/legacy-api',available:false}];
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'customer-api'};
   if(method==='tree')return [{name:'src',path:'src',directory:true},{name:'vendor',path:'vendor',directory:true},{name:'probe.php',path:'probe.php',directory:false},{name:'composer.json',path:'composer.json',directory:false}];
   if(method==='read')return file;
   if(method==='agents')return [{id:'codex',name:'Codex',available:true,detail:'Use sua conta conectada para iniciar uma conversa.'}];
   if(method==='gitStatus')return {branch:'main',head:'a'.repeat(40),changes,indexToken:'preview'};
   if(method==='gitDiff')return {path:args[0],before:'before',after:'after',beforeLabel:'index',afterLabel:'disk',token:'preview'};
   if(method==='gitStage'){const change=changes.find(c=>c.path===args[0]);change.index=args[1]?' ':'M';change.worktree=args[1]?'M':' ';return;}
   if(method==='gitCommit')return 'd'.repeat(40);
   if(method==='gitCommitMessage')return 'Previous subject\\n\\nPrevious body';
   if(method==='gitBranches')return [{name:'main',current:true,remote:false,upstream:'origin/main',tracking:''},{name:'feature/billing',current:false,remote:false,upstream:'',tracking:''},{name:'origin/main',current:false,remote:true,upstream:'',tracking:''}];
   if(method==='gitLog')return [{hash:'a'.repeat(40),parents:['b'.repeat(40)],refs:'HEAD -> main',subject:'Add customer billing workflow',author:'João Silva',date:'2026-10-22T12:00:00Z'},{hash:'b'.repeat(40),parents:['c'.repeat(40)],subject:'Improve invoice validation',author:'Maria Costa',date:'2026-10-21T10:00:00Z'},{hash:'c'.repeat(40),parents:[],subject:'Configure PHP test suite',author:'João Silva',date:'2026-10-20T08:00:00Z'}];
   if(method==='gitHistory')return {hash:args[0],parents:[],files:[{path:'src/Customer.php',status:'M'},{path:'tests/CustomerTest.php',status:'A'}]};
   if(method==='gitHistoryDiff')return {path:args[1],before:'<?php\\n// before',after:'<?php\\n// after',beforeLabel:'parent',afterLabel:args[0],token:'preview'};
   if(method==='gitTools')return {branches:[],remotes:[],stashes:[],head:'preview'};
   if(method==='gitEditorBase')return {text:${JSON.stringify(text)},label:'HEAD → editor'};
   if(method==='language')return args[0].method==='textDocument/references'?[{uri:file.uri,range:{start:{line:7,character:7},end:{line:7,character:12}}},{uri:file.uri,range:{start:{line:10,character:8},end:{line:10,character:13}}}]:null;
   return [];
  };
 }});
 await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();
 `}));
 await page.goto('http://127.0.0.1:1425');await page.locator('#show-git').click();await page.locator('.git-commit-row').first().waitFor();await page.locator('.git-commit-row').first().click();await page.locator('#git-history-files button').first().waitFor();
 const assert=(value,message)=>{if(!value)throw Error(message);};
 assert(await page.locator('.git-log-graph path').count()===2,'graph must use actual parent edges');
 await page.locator('#git-user-filter').selectOption('Maria Costa');assert(await page.locator('.git-commit-row').count()===1,'author filter');await page.locator('#git-user-filter').selectOption('');
 await page.locator('#git-date-filter').fill('2026-10-22');assert(await page.locator('.git-commit-row').count()===1,'date filter');await page.locator('#git-date-filter').fill('');
 await page.locator('#git-branch-search').fill('billing');assert(await page.locator('#git-log-refs details button').count()===1,'branch search');await page.locator('#git-branch-search').fill('');
 await page.locator('#git-toggle-branches').click();assert(await page.locator('.git-refs-pane').isHidden(),'hide branches');await page.locator('#git-toggle-branches').click();
 await page.locator('#git-log-search').fill('Maria');assert(await page.locator('.git-commit-row').count()===1,'commit search');await page.locator('#git-log-search').fill('');
 await page.locator('[data-ref="refs/heads/feature/billing"]').click();await page.waitForFunction(()=>document.querySelector('[data-ref="refs/heads/feature/billing"]')?.getAttribute('aria-pressed')==='true');await page.locator('.git-commit-row').first().click();await page.locator('#git-history-files button').first().waitFor();
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/git-log-redesign-dark.png'});
 await page.locator('#git-history-files button').first().click();await page.locator('#git-review').waitFor();await page.locator('#git-close-diff').click();
 await page.locator('#show-commit').click();await page.locator('#git-search-toggle').click();await page.locator('#git-file-filter').fill('Invoice');assert(await page.locator('#git-changes .git-file-row').count()===1,'change search');await page.locator('#git-file-filter').fill('');await page.locator('#git-search-toggle').click();
 await page.getByRole('checkbox',{name:'Preparar src/Invoice.php',exact:true}).check();await page.waitForFunction(()=>document.querySelector('[aria-label="Preparar src/Invoice.php"]')?.checked&&!document.querySelector('[aria-label="Preparar src/Invoice.php"]')?.disabled);
 await page.getByRole('checkbox',{name:'Preparar src/Invoice.php',exact:true}).uncheck();await page.waitForFunction(()=>!document.querySelector('[aria-label="Preparar src/Invoice.php"]')?.checked&&!document.querySelector('[aria-label="Preparar src/Invoice.php"]')?.disabled);
 await page.locator('#git-message').fill('Draft message');await page.locator('#git-amend').check();await page.waitForFunction(()=>document.querySelector('#git-message').value.includes('Previous body'));await page.locator('#git-amend').uncheck();assert(await page.locator('#git-message').inputValue()==='Draft message','amend did not restore draft');await page.locator('#git-message').fill('');
 await page.locator('#git-collapse-all').click();assert(await page.locator('#git-changes details[open]').count()===0,'collapse');await page.locator('#git-expand-all').click();
 await page.locator('#git-changes summary').first().click();await page.locator('#git-changes summary').first().click();await page.locator('#git-log-hide').click();await page.screenshot({path:'.artifacts/git-commit-redesign.png'});await page.locator('#git-panel').screenshot({path:'.artifacts/git-commit-reference-match.png'});
 await page.locator('#git-message').fill('Commit and push fixture');await page.locator('#git-commit-push').click();await page.locator('#git-confirm-commit').click();await page.locator('#git-operations[open]').waitFor();assert(await page.locator('#git-operation-kind').inputValue()==='push','commit and push did not open push review');await page.locator('#git-operation-close').click();
 await page.locator('#show-project').click();await page.locator('#show-docker').click();await page.locator('.docker-resource').first().waitFor();assert(await page.locator('#git-log-panel').isHidden(),'docker did not hide git dock');await page.locator('.docker-resource[data-state=running]').click();await page.locator('#docker-tab-details').click();await page.screenshot({path:'.artifacts/docker-dashboard-redesign-dark.png'});
 await page.locator('#docker-show-stopped').uncheck();assert(await page.locator('.docker-resource[data-state=exited]').count()===0,'stopped filter');await page.locator('#docker-show-stopped').check();
 await page.locator('.docker-resource[data-state=running]').click({button:'right'});assert(await page.getByRole('menuitem',{name:'Parar',exact:true}).isEnabled(),'context stop unavailable');await page.keyboard.press('Escape');
 await page.locator('#docker-tab-logs').click();await page.waitForFunction(()=>document.getElementById('docker-logs').textContent.includes('GET'));await page.locator('#docker-log-search').fill('GET');assert(!(await page.locator('#docker-logs').textContent()).includes('pid 1'),'log filter');await page.locator('#docker-log-search').fill('');await page.screenshot({path:'.artifacts/docker-logs-redesign-dark.png'});
 await page.locator('#theme-toggle').click();await page.screenshot({path:'.artifacts/docker-logs-redesign-light.png'});await page.locator('#show-git').click();assert(await page.locator('#docker-panel').isHidden(),'git did not hide docker');await page.locator('.git-commit-row').first().waitFor();await page.locator('.git-commit-row').first().click();await page.screenshot({path:'.artifacts/git-log-redesign-light.png'});
 await page.locator('#git-log-resize').focus();const before=await page.locator('#git-log-panel').evaluate(e=>e.clientHeight);await page.keyboard.press('ArrowUp');assert(await page.locator('#git-log-panel').evaluate(e=>e.clientHeight)>before,'keyboard resize');
 const report={ok:true,transport:'mock',checks:['commit and push opens push review','commit checkboxes stage and unstage','amend restores draft','collapse and expand changes','real parent graph','author and date filters','branch search and visibility','commit search','branch selection','commit details and file diff','changes search','dock mutual exclusion','Docker dashboard','stopped filter','container context actions','log filter','dark/light rendering','keyboard resize']};await writeFile('.artifacts/tools-redesign-browser.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser?.close();server.kill();}
