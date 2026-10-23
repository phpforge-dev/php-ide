// Browser rendering checks use a mock transport; real Git semantics are tested by Rust/native suites.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1424','--strictPort'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1424'))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:940}});
 await page.addInitScript(()=>localStorage.setItem('php-ide-language','en'));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 const branches=[{name:'main',current:true,remote:false,upstream:'origin/main',tracking:'[behind 2]'},{name:'feature/payments',current:false,remote:false,upstream:'',tracking:''},{name:'origin/main',current:false,remote:true,upstream:'',tracking:''},{name:'origin/feature/api',current:false,remote:true,upstream:'',tracking:''}];
 window.ide=new Proxy({}, {get:(_,method)=>{if(String(method).startsWith('on'))return ()=>()=>{};return async(...args)=>{
 if(method==='workspace')return {name:'PHP IDE',root:'/fixture',rootUri:'file:///fixture/'};
 if(method==='gitStatus')return {branch:branches.find(b=>b.current).name,head:'a'.repeat(40),changes:[],indexToken:'test',mergeHead:null};
 if(method==='gitTools')return {branches,remotes:['origin'],stashes:[]};
 if(method==='gitOperation'){const input=args[0];if(input.kind==='switch')branches.forEach(b=>b.current=b.name===input.target);if(input.kind==='delete-branch')branches.splice(branches.findIndex(b=>b.name===input.target),1);return 'OK';}
 if(method==='language')return null;return [];
 };}});await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();` }));
 await page.goto('http://127.0.0.1:1424');await page.locator('#workspace-branch').click();await page.locator('#git-branches-popup[open]').waitFor();
 await page.getByRole('heading',{name:'Local branches'}).waitFor();await page.getByRole('heading',{name:'Remote branches'}).waitFor();
 await page.locator('#branch-search').fill('payments');if(await page.locator('.branch-row').count()!==1)throw Error('Search did not filter');
 await page.locator('[data-checkout="feature/payments"]').click();await page.waitForFunction(()=>document.getElementById('branch-current').textContent==='Current branch: feature/payments');
 await page.locator('#branch-search').fill('');await page.locator('[data-delete="main"]').click();await page.locator('#branch-delete-cancel').click();if(await page.locator('[data-branch="main"]').count()!==1)throw Error('Cancel deleted branch');
 await page.locator('#branch-new').click();await page.locator('#branch-name').fill('feature/new');await page.locator('#branch-create-cancel').click();
 await page.locator('[data-checkout="main"]').click();await page.waitForFunction(()=>document.getElementById('branch-current').textContent==='Current branch: main');
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/git-branches-en.png'});
 const report={ok:true,transport:'mock',checks:['English local/remote groups','search','direct checkout action','delete cancellation','create form','current branch refreshed']};await writeFile('.artifacts/git-branches-browser.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser?.close();server.kill();}
