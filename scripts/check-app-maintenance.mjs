// Headless WebKit exercises the real UI with a profile-scoped synthetic Rust service.
import {webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const choices=JSON.parse(await readFile('default-plugins.json','utf8')).map(p=>({...p.plugin,permissions:p.permissions}));
const essentialCount=choices.filter(p=>['phpforge.php-intelligence','phpforge.php-formatter','phpforge.composer','phpforge.php-tests','phpforge.git','phpforge.terminal'].includes(p.id)).length;
const port='1476';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',port,'--strictPort'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(port))resolve();});server.once('exit',reject);});
 browser=await webkit.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:940}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
  document.getElementById('startup-splash').remove();
  const preferences=JSON.parse(localStorage.getItem('fixture-preferences')||'null')??{setupComplete:false,autoUpdatePlugins:false,autoUpdateIde:false,checkUpdates:true};
  const state={preferences,defaults:${JSON.stringify(choices)},jobs:[],updates:[],checking:false,errors:[],ideVersion:'0.2.13',ideAutoUpdateAvailable:false};
  window.fixtureCalls=[];
  const changed=()=>window.dispatchEvent(new Event('ide-app-maintenance'));
  const api=new Proxy({}, {get:(_,method)=>async(...args)=>{
   window.fixtureCalls.push({method,args});
   if(method==='appSetupComplete'){preferences.setupComplete=true;localStorage.setItem('fixture-preferences',JSON.stringify(preferences));}
   if(method==='appQueuePlugin'){const id=args[0],p=state.defaults.find(p=>p.id===id);state.jobs=state.jobs.filter(j=>j.id!==id);state.jobs.push({...p,kind:'install',status:'queued'});changed();}
   if(method==='appMaintenancePreferences'){Object.assign(preferences,args[0]);localStorage.setItem('fixture-preferences',JSON.stringify(preferences));}
   if(method==='appCheckUpdates'){state.updates=[{id:'phpforge.git',name:'Git',currentVersion:'1.0.1',version:'1.0.2'}];state.ide={version:'0.2.14',signed:false};state.checkedAt=Date.now()/1000;}
   if(method==='appQueuePluginUpdate'){state.jobs=state.jobs.filter(j=>j.id!==args[0]);state.jobs.push({id:args[0],name:'Git',kind:'update',status:'review',permissions:['network'],target:{version:'1.0.2'}});changed();}
   if(method==='appApprovePluginUpdate'){state.jobs.find(j=>j.id===args[0]).status='staged';changed();}
   return structuredClone(state);
  }});
  window.failInstall=()=>{state.jobs[0].status='failed';state.jobs[0].error='Offline fixture';changed();};
  window.finishInstalls=()=>{for(const job of state.jobs)job.status='installed';changed();};
  const {mountAppMaintenance}=await import('/src/app-maintenance.ts');const app=await mountAppMaintenance(api);
  app.setup().then(()=>{document.getElementById('app').innerHTML='<h1 id="fixture-workspace">IDE ready</h1>';app.start();});
 `}));
 const assert=(value,message)=>{if(!value)throw Error(message);};
 await page.goto('http://127.0.0.1:'+port);await page.locator('#first-run-plugins').waitFor();
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/first-run-plugins.png'});
 await page.locator('#setup-search').fill('Markdown');assert(await page.locator('.maintenance-choice:visible').count()===choices.filter(p=>`${p.name} ${p.description}`.toLocaleLowerCase().includes('markdown')).length,'plugin search did not filter choices');await page.locator('#setup-search').fill('');
 assert(!await page.locator('#first-run-plugins input[data-preference="autoUpdatePlugins"]').isChecked(),'plugin auto update should start off');
 assert(!await page.locator('#first-run-plugins input[data-preference="autoUpdateIde"]').isChecked(),'IDE auto update should start off');
 assert(await page.locator('#first-run-plugins input[data-preference="autoUpdateIde"]').isDisabled(),'unsigned updater should not claim automatic support');
 await page.getByRole('button',{name:'Selecionar PHP essencial',exact:true}).click();
 assert(await page.locator('input[data-plugin="phpforge.git"]').isChecked(),'essential preset did not select Git');
 assert(!await page.locator('input[data-plugin="phpforge.markdown"]').isChecked(),'preset installed an unrelated plugin');
 await page.locator('#setup-install').click();await page.waitForFunction(count=>window.fixtureCalls.filter(c=>c.method==='appQueuePlugin').length===count,essentialCount);
 await page.evaluate(()=>window.failInstall());await page.locator('#first-run-plugins').getByText('Offline fixture',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.waitForFunction(count=>window.fixtureCalls.filter(c=>c.method==='appQueuePlugin').length===count,essentialCount+1);
 await page.locator('#setup-continue').click();await page.locator('#fixture-workspace').waitFor();
 await page.evaluate(()=>window.finishInstalls());
 await page.locator('.maintenance-notice').waitFor({state:'visible'});
 assert(await page.evaluate(()=>!window.fixtureCalls.some(c=>c.method==='appQueuePluginUpdate'||c.method==='appPrepareIdeUpdate')),'default notification downloaded updates');
 await page.locator('.maintenance-notice').getByRole('button',{name:'Ver atualizações'}).click();
 await page.locator('.maintenance-dialog').getByRole('button',{name:'Baixar atualização',exact:true}).click();
 await page.getByRole('button',{name:'Permitir e baixar atualização'}).waitFor();assert(await page.evaluate(()=>!window.fixtureCalls.some(c=>c.method==='appApprovePluginUpdate')),'new permissions were granted automatically');
 await page.getByRole('button',{name:'Permitir e baixar atualização'}).click();
 await page.getByRole('button',{name:'Reiniciar para aplicar plugins'}).waitFor();
 await page.evaluate(()=>window.addEventListener('beforeunload',event=>event.preventDefault(),{once:true}));
 await page.getByRole('button',{name:'Reiniciar para aplicar plugins'}).click();await page.getByText('Salve os arquivos alterados antes de reiniciar.',{exact:true}).waitFor();
 assert(await page.evaluate(()=>!window.fixtureCalls.some(c=>c.method==='appRestart')),'restart discarded unsaved work');
 await page.locator('.maintenance-dialog').getByRole('button',{name:'Fechar',exact:true}).click();
 await page.reload();await page.locator('#fixture-workspace').waitFor();assert(await page.locator('#first-run-plugins').count()===0,'first-run setup appeared again');
 await page.locator('#app-maintenance').click();await page.locator('.maintenance-dialog input[data-preference="autoUpdatePlugins"]').check();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture-preferences')).autoUpdatePlugins===true);
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/app-maintenance.png'});assert(errors.length===0,errors.join('; '));
 const result={ok:true,runtime:'headless WebKit, synthetic service',checks:['first-run only profile state','auto updates off by default','unsigned build cannot enable app auto update','essential plugin selection and permission visibility','background queue, failure and retry','continue without waiting for downloads','notifications without default downloads','new permissions require explicit approval','manual download staged for restart','restart protects unsaved work','preferences persist across reload'],errors};
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/app-maintenance-ui.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser?.close();server.kill();}
