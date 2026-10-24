// Opening a workspace must not bypass the user's first-run choices.
import assert from 'node:assert/strict';
import {webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1433','--strictPort'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('1433'))resolve();});server.once('exit',reject);});
 browser=await webkit.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
  import {mountPluginManager} from '/src/plugin-manager.ts';document.getElementById('startup-splash')?.remove();document.body.innerHTML='<button id="plugins"></button><div id="project"></div>';
  let installed=false;window.attempts=0;
  const plugin={key:'user:phpforge.prettier',scope:'user',dir:'/plugins/phpforge.prettier',enabled:false,consented:false,needsConsent:true,granted:[],manifest:{id:'phpforge.prettier',name:'Prettier',version:'1.0.0',minIdeVersion:'0.2.13',main:'main.js',permissions:['project.read'],activation:{languages:[]}}};
  const api={nativeInfo:async()=>({smoke:true}),workspace:async()=>({root:'/fixture',rootUri:'file:///fixture/'}),plugins:async()=>[],pluginList:async()=>({ideVersion:'0.2.13',userDir:'/plugins',projectDir:'/fixture/.php-ide/plugins',permissions:[],plugins:installed?[plugin]:[],defaults:[{id:'phpforge.prettier',name:'Prettier',repository:'https://github.com/phpforge-dev/plugin-prettier',pending:!installed}]}),pluginInstallDefault:async()=>{window.attempts++;}};
  window.installedByBackgroundQueue=()=>{installed=true;window.dispatchEvent(new Event('ide-user-plugins-changed'));};window.manager=mountPluginManager(api);window.manager.ready.then(()=>window.workbenchReady=true);
 `}));
 await page.goto('http://127.0.0.1:1433');await page.waitForFunction(()=>window.workbenchReady);await page.evaluate(()=>window.manager.show());
 assert.equal(await page.evaluate(()=>window.attempts),0);assert.equal(await page.getByRole('heading',{name:'Plugins padrão',exact:true}).count(),0);
 await page.evaluate(()=>window.installedByBackgroundQueue());await page.locator('[data-installed-plugin="phpforge.prettier"]').waitFor();
 assert.equal(await page.evaluate(()=>window.attempts),0);assert.deepEqual(errors,[]);
 console.log('Plugin manager passed: no unselected downloads; background installation refreshes the manager.');
}finally{await browser?.close();server.kill();}
