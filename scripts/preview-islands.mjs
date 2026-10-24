import {pinnedWorkbenchFixture} from './pinned-workbench-fixture.mjs';
const fixture=await pinnedWorkbenchFixture(["git", "terminal", "agents", "php-intelligence"]);
// Visual fidelity fixture for the Islands foundation (recorte 28). Simulated API only; native behavior is
// verified by check-native. Writes .artifacts/fidelity/foundation-{workbench,welcome,tools}-{dark,light}.png at the
// reference window size (1512×949 logical) so they can be compared with .artifacts/phpstorm-reference/.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
const port=1422;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
let browser;
const out='.artifacts/fidelity';
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'});
 await mkdir(out,{recursive:true});
 const user=await readFile('tests/fixtures/projects/php-intelligence/src/User.php','utf8');
 const probe=await readFile('tests/fixtures/projects/php-intelligence/probe.php','utf8');
 const api=(welcome)=>`
 const files={'src/User.php':${JSON.stringify(user+'// changed\n')},'probe.php':${JSON.stringify(probe)},'README.md':'# Reference\\n','composer.json':'{}\\n'};
 const tree={'':[{name:'docs',path:'docs',directory:true},{name:'src',path:'src',directory:true},{name:'tests',path:'tests',directory:true},{name:'.gitignore',path:'.gitignore',directory:false},{name:'composer.json',path:'composer.json',directory:false},{name:'manifest.sha256.json',path:'manifest.sha256.json',directory:false},{name:'NOTES.md',path:'NOTES.md',directory:false},{name:'probe.php',path:'probe.php',directory:false},{name:'README.md',path:'README.md',directory:false}],
  src:['Admin.php','HasId.php','Named.php','State.php','Unrelated.php','User.php'].map(name=>({name,path:'src/'+name,directory:false}))};
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='startupInfo')return {project:${welcome?'null':'"/fixture"'}};
   if(method==='recentProjects')return [{name:'reference-project',path:'/Users/developer/Projects/reference-project',available:true},{name:'customer-api',path:'/Users/developer/Projects/customer-api',available:true},{name:'billing-service',path:'/Users/developer/Work/billing-service',available:true},{name:'admin-panel',path:'/Users/developer/Projects/admin-panel',available:true},{name:'legacy-api',path:'/Users/developer/Archive/legacy-api',available:false}];
   if(method==='pluginList')return {plugins:[],directories:[]};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'reference-project'};
   if(method==='tree')return tree[args[0]??'']??[];
   if(method==='read'){const path=String(args[0]??'');return {path,uri:'file:///fixture/'+path,text:files[path]??'',etag:'preview'};}
   if(method==='gitStatus')return {branch:'main',head:'a'.repeat(40),changes:[{path:'src/User.php',index:' ',worktree:'M'}],indexToken:'preview'};
   if(method==='gitTools')return {branches:[],remotes:[],stashes:[],head:'preview'};
   if(method==='gitEditorBase'){const path=String(args[0]??'');return {text:${JSON.stringify(user)},label:'HEAD → editor'};}
   if(method==='phpMethodFamily')return null;
   if(method==='terminalCreate')return {id:'fixture-terminal',cwd:'/fixture',shell:'/bin/zsh'};
   if(method==='agents')return [{id:'codex',name:'Codex',available:true,detail:''}];
   if(method==='dockerContexts')return [];
   return [];
  };
 }});`;
 for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width:1512,height:949},deviceScaleFactor:1});
  await page.emulateMedia({colorScheme:theme});await fixture.route(page);
  await page.addInitScript(t=>{try{localStorage.setItem('php-ide-appearance',JSON.stringify({theme:t}));}catch{}},theme);
  await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`${api(true)}
   await import('/src/theme.ts');const {showWelcome}=await import('/src/welcome.ts');await showWelcome(window.ide,async()=>{});document.getElementById('startup-splash')?.remove();`}));
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('.welcome-project').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${out}/foundation-welcome-${theme}.png`});
  await page.unroute('**/src/bootstrap.ts');
  await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`${api(false)}
   ${fixture.bootstrap}
   await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();`}));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#tree summary,#tree button').first().waitFor();
  const src=page.locator('#tree summary',{hasText:'src'}).first();if(await src.count())await src.click();
  for(const name of ['README.md','src/User.php']){const b=page.locator(`#tree [data-path="${name}"]`).first();if(await b.count())await b.click();await page.waitForTimeout(250);}
  await page.waitForTimeout(800);await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${out}/foundation-workbench-${theme}.png`});
  if(process.env.DUMP&&theme==='dark')console.log(await page.evaluate(()=>{const strip=e=>e.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g,'<svg/>').replace(/<div class="monaco[\s\S]*/,'…');return [[...document.querySelectorAll('.code > *, main > *')].map(e=>e.tagName+'#'+e.id+'.'+e.className+(e.hidden?'[hidden]':'')).join(' | '),...['header','.left-rail','.right-rail','.editor-strip','footer','.project-pane'].map(q=>{const e=document.querySelector(q);return q+': '+(e?strip(e).slice(0,3000):'none');})].join('\n\n');}));
  await page.locator('#agent-transcript').waitFor({state:'attached'});await page.locator('#show-terminal').click();await page.locator('#terminal-panel .xterm').waitFor();await page.waitForFunction(()=>document.getElementById('terminal-tabs')?.textContent.includes('/bin/zsh'));await page.waitForTimeout(200);
  await page.screenshot({path:`${out}/foundation-tools-${theme}.png`});
  await page.close();
 }
 fixture.assertClean();console.log(`Islands fixtures: ${out}/foundation-*.png`);
} finally {await browser?.close();server.kill();}
