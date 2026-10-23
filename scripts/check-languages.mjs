import {chromium} from 'playwright';import {spawn} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1423','--strictPort'],{stdio:'pipe'});let browser;
try{await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1423'))resolve();});server.once('exit',reject);});browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:940}});
 await page.addInitScript(()=>{if(!sessionStorage.getItem('language-test-init')){localStorage.setItem('php-ide-language','en');sessionStorage.setItem('language-test-init','1');}});
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 const source="<?php\\n// Projeto Salvar: never translate user code\\necho 'Olá';\\n";
 window.ide=new Proxy({}, {get:(_,method)=>{if(String(method).startsWith('on'))return ()=>()=>{};return async()=>{
 if(method==='workspace')return {name:'Projeto',root:'/fixture',rootUri:'file:///fixture/'};
 if(method==='tree')return [{name:'projeto.php',path:'projeto.php',directory:false}];
 if(method==='read')return {path:'projeto.php',uri:'file:///fixture/projeto.php',text:source,etag:'fixture'};
 if(method==='gitStatus')return {branch:'main',files:[],indexToken:'test'};
 if(method==='gitEditorBase')return {text:source,label:'HEAD'};
 if(method==='plugins'||method==='agents')return [];if(method==='language')return null;return [];
 };}});await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();` }));
 const assert=(value,message)=>{if(!value)throw Error(message);};
 await page.goto('http://127.0.0.1:1423');await page.locator('#theme-toggle').waitFor();assert(await page.locator('html').getAttribute('lang')==='en','HTML language not English');assert(await page.locator('#close-project').textContent()==='Close project','Toolbar not translated');assert(await page.locator('.project-pane h3').textContent()==='Project','Project panel not translated');assert(await page.locator('#project').textContent()==='Projeto','Project name was translated');
 await page.getByRole('button',{name:'projeto.php',exact:true}).click();await page.waitForFunction(()=>document.getElementById('editor')?.textContent?.includes('Projeto'));assert((await page.locator('#editor').textContent()).includes('Projeto'),'User code translated');
 await page.locator('#appearance').click();await page.locator('#interface-language').selectOption('pt-BR');await page.locator('#apply-language').click();await page.waitForFunction(()=>document.documentElement.lang==='pt-BR');await page.locator('#appearance').click();assert(await page.locator('#close-project').textContent()==='Fechar projeto','Portuguese not restored');
 await page.locator('#interface-language').selectOption('en');await page.evaluate(()=>{window.addEventListener('ide-before-language-change',event=>event.preventDefault());});await page.locator('#apply-language').click();assert(await page.locator('html').getAttribute('lang')==='pt-BR','Reload ignored guard');assert((await page.locator('#language-feedback').textContent()).includes('Salve'),'Missing guard feedback');
 await page.reload();await page.locator('#theme-toggle').waitFor();assert(await page.locator('html').getAttribute('lang')==='en','Saved locale not restored');await page.locator('#appearance').click();await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/language-settings-en.png'});
 await page.evaluate(()=>localStorage.setItem('php-ide-language','unknown'));await page.reload();await page.locator('#theme-toggle').waitFor();assert(await page.locator('html').getAttribute('lang')==='pt-BR','Unknown locale did not fall back');
 const report={ok:true,checks:['English interface','Portuguese interface','project names and code preserved','language applied through settings','reload guard respected','preference persisted','unknown locale falls back']};await writeFile('.artifacts/languages-browser.json',JSON.stringify(report,null,2));console.log(report);
}finally{await browser?.close();server.kill();}
