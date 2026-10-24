import assert from 'node:assert/strict';
import {webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1433','--strictPort'],{stdio:'pipe'});
let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1433'))resolve();});server.once('exit',code=>reject(Error('Vite exit '+code)));});
 browser=await webkit.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 import {mountPluginManager} from '/src/plugin-manager.ts';
 document.getElementById('startup-splash')?.remove();
 document.body.innerHTML='<button id="plugins"></button><div id="project"></div>';
 let installed=false;window.attempts=0;
 const api={workspace:async()=>({root:'/fixture',rootUri:'file:///fixture/'}),plugins:async()=>[],
 pluginList:async()=>({ideVersion:'0.2.10',userDir:'/plugins',projectDir:'/fixture/.php-ide/plugins',permissions:[],plugins:[],defaults:[{id:'phpforge.prettier',name:'Prettier',repository:'https://github.com/phpforge-dev/plugin-prettier',pending:!installed}]}),
 pluginInstallDefault:async()=>{window.attempts++;if(window.attempts===1)await new Promise((_,reject)=>window.failDownload=()=>reject(Error('offline fixture')));else installed=true;}};
 window.manager=mountPluginManager(api);window.manager.ready.then(()=>window.workbenchReady=true);
 `}));
 await page.goto('http://127.0.0.1:1433',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.workbenchReady&&window.attempts===1);
 await page.locator('#plugins').getByText('Instalando Prettier', {exact:false}).waitFor();
 await page.evaluate(()=>window.manager.show());
 await page.evaluate(()=>window.failDownload());
 await page.getByText('offline fixture',{exact:false}).waitFor();
 const retry=page.getByRole('button',{name:'Tentar novamente',exact:true});await retry.waitFor();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Tentar novamente')?.disabled);
 await retry.click();
 await page.waitForFunction(()=>window.attempts===2&&!document.querySelector('.plugin-error'));
 assert.equal(await page.getByRole('heading',{name:'Plugins padrão',exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('Default plugins UI OK: first paint before download, visible progress, offline error, retry and recovery.');
}finally{await browser?.close();server.kill();}
