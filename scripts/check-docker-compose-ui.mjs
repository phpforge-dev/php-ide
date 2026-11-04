// Docker Compose in the real app shell (main.ts, editor chrome, tool plugins, Run widget) with simulated IPC:
// gutter ▶ and running state, status inlay → logs, Down with options, run configurations in the toolbar selector,
// and the gutter shared with the PHP debugger (a click on a Compose icon must not toggle a breakpoint).
// The Docker CLI itself is covered by the plugin's Rust tests and by scripts/fake-docker.mjs in test:native.
// Options: --chromium (default WebKit, the engine of the macOS Tauri WebView), --out=<dir>.
// DOCKER_SERVICES_PLUGIN=<dir> (default ~/Projects/plugin-docker-services), PHP_IDE_DEBUGGER_PLUGIN=<dir> (default: pinned package).
// Criteria: docs/research/docker-integration.md#compose-down-estado-e-run-configurations-2026-11-04.
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'.artifacts/docker-compose-fidelity';
const packages=['.tools/plugin-packages',join(homedir(),'Projects/php-ide/.tools/plugin-packages')].find(p=>existsSync(join(p,'php-debugger/plugin.json')));
const dockerDir=resolve(process.env.DOCKER_SERVICES_PLUGIN??join(homedir(),'Projects/plugin-docker-services'));
const debuggerDir=resolve(process.env.PHP_IDE_DEBUGGER_PLUGIN??join(packages,'php-debugger'));
const load=async(dir,key)=>{const manifest=JSON.parse(await readFile(join(dir,'plugin.json'),'utf8'));return {key:'user:'+manifest.id,manifest,code:await readFile(join(dir,'workbench.js'),'utf8'),style:await readFile(join(dir,'workbench.css'),'utf8')};};
const docker=await load(dockerDir),debug=await load(debuggerDir);
const compose=`name: shop
services:
  web:
    image: php:8.3-cli
    depends_on:
      - cache
  cache:
    image: redis:alpine
  worker:
    image: php:8.3-cli
volumes:
  data: {}
`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
let browser,page;const ok=[];const check=(cond,label)=>{if(!cond)throw Error('Falhou: '+label);ok.push(label);};
try{
 await new Promise((res,rej)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))res();});server.once('exit',rej);});
 browser=process.argv.includes('--chromium')?await chromium.launch({headless:true,channel:'chrome'}):await webkit.launch({headless:true});
 page=await browser.newPage({viewport:{width:1512,height:949},deviceScaleFactor:2,colorScheme:'dark'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/window-layout.ts',r=>r.fulfill({contentType:'application/javascript',body:'export async function welcomeWindow(){} export async function workbenchWindow(){}'}));
 await page.route('**/src/bootstrap.ts',r=>r.fulfill({contentType:'application/javascript',body:`
 window.__calls=[];window.__cbs={};window.__listeners={};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};let next=1;
 window.__TAURI_INTERNALS__={transformCallback(cb){const id=next++;window.__cbs[id]=cb;return id;},invoke:async(cmd,args)=>{if(cmd==='plugin:event|listen'){window.__listeners[args.event]=args.handler;return 1;}return null;}};
 const plugins=${JSON.stringify({docker,debug})};
 const files={'compose.yaml':${JSON.stringify(compose)},'index.php':'<?php\\necho 1;\\n'};
 // Engine state: containers per service of project "shop"; ps/up/stop/down change it.
 const id=c=>c.repeat(64);window.__engine={web:{state:'exited',exitCode:0},cache:{state:'running',exitCode:0}};
 const rows=()=>Object.entries(window.__engine).map(([s,v],i)=>({service:s,name:'shop-'+s+'-1',id:id('abcdef'[i]).slice(0,12),state:v.state,status:v.state==='running'?'Up 3 minutes':'Exited ('+v.exitCode+') 1 minute ago',exitCode:v.exitCode}));
 const containers=()=>rows().map(r=>({id:id(r.id[0]),name:r.name,image:'php:8.3-cli',state:r.state,status:r.status,ports:'',project:'shop',service:r.service}));
 const listing={defaults:[],permissions:[],ideVersion:'0.2.19',userDir:'/fixture-plugins',projectDir:'/fixture/.php-ide/plugins',plugins:Object.values(plugins).map(p=>({key:p.key,scope:'user',dir:'/fixture-plugins',manifest:p.manifest,enabled:true,needsConsent:false,consented:true,granted:p.manifest.permissions}))};
 window.ide=new Proxy({},{get:(_,method)=>{
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async(...args)=>{
   if(/^docker|^debugConfig/.test(String(method))&&!(method==='dockerCompose'&&args[2]==='ps'))window.__calls.push([method,...args]);
   if(method==='startupInfo')return {project:'/fixture'};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'shop'};
   if(method==='tree')return Object.keys(files).map(f=>({name:f,path:f,directory:false}));
   if(method==='read'){const p=String(args[0]).replace('/fixture/','');if(!(p in files))throw Error('missing '+p);return {path:p,uri:'file:///fixture/'+p,text:files[p],etag:'e'};}
   if(method==='pluginList')return listing;
   if(method==='pluginWorkbenchSource'||method==='pluginToolSource')return Object.values(plugins).find(p=>p.key===args[0]);
   if(method==='pluginSource')return {manifest:plugins.debug.manifest,code:'ide.register({detect:async()=>({})});',rootUri:'file:///fixture/'};
   if(method==='pluginToolCall')return window.ide[args[1]](...args[2]);
   if(method==='pluginAuthorizeService'||method==='pluginReleaseResources')return null;
   if(method==='debugStatus')return {listening:null,sessions:[]};
   if(method==='dockerContexts')return [{name:'fixture-local',current:true,endpoint:'unix:///fixture.sock'},{name:'fixture-remote',current:false,endpoint:'ssh://fixture'}];
   if(method==='dockerSnapshot')return {version:'27.0-fixture',os:'linux',containers:containers(),images:[],volumes:[{name:'shop_data',driver:'local'}],networks:[]};
   if(method==='dockerComposeFiles')return ['compose.yaml'];
   if(method==='dockerLogs')return 'cache ready to accept connections\\n';
   if(method==='dockerCompose'){const [ctx,file,action,,service,options]=args;const list=service==null?Object.keys(window.__engine):[].concat(service);
    if(action==='ps')return rows();
    if(action==='up'){for(const s of list)window.__engine[s]={state:'running',exitCode:0};return 'Container shop-'+list.join(' shop-')+' Started';}
    if(action==='stop'){for(const s of list)window.__engine[s]={state:'exited',exitCode:0};return 'Stopped';}
    if(action==='down'){window.__engine={};return 'Network shop_default Removed'+(options?.volumes?'\\nVolume shop_data Removed':'');}
    return '';}
   if(method==='language'||method==='gitStatus'||method==='phpMethodFamily')return null;
   return [];
  };
 }});
 document.getElementById('startup-splash')?.remove();
 await import('/src/main.ts');`}));
 await page.goto(`http://127.0.0.1:${port}`);
 await page.getByRole('button',{name:'compose.yaml',exact:true}).first().click();await page.locator('.view-lines .view-line').first().waitFor();
 await page.locator('.compose-run').first().waitFor();await page.locator('#docker-panel').waitFor({state:'attached'});await page.waitForTimeout(800);
 await mkdir(out,{recursive:true});
 const calls=()=>page.evaluate(()=>window.__calls);
 const composeCalls=async action=>(await calls()).filter(c=>c[0]==='dockerCompose'&&c[3]===action);
 const glyph=line=>page.locator('.glyph-margin-widgets .compose-run').nth(line);
 const breakpoints=()=>page.evaluate(()=>document.querySelectorAll('.margin-view-overlays .line-numbers.debug-bp').length);
 const debugConfigs=async()=>(await calls()).filter(c=>c[0]==='debugConfig').length;

 // 1. Icons, running state and status inlays (cache runs, web exited, worker has no container).
 check(await page.locator('.glyph-margin-widgets .compose-run').count()===4,'▶▶ em services: e ▶ em web, cache e worker');
 await page.waitForFunction(()=>document.querySelectorAll('.compose-state-hint').length===2);
 const hints=(await page.locator('.compose-state-hint').allTextContents()).map(t=>t.replace(/\u00a0/g,' '));
 check(hints.join('|')==='exited (0)|running','inlay de status: web exited (0), cache running, worker sem inlay');
 check(await page.locator('.glyph-margin-widgets .compose-run.compose-running').count()===2,'ícone de cache e ▶▶ de services: marcados como em execução');
 await page.screenshot({path:out+'/01-gutter-state.png',clip:{x:0,y:60,width:760,height:330}});

 // 4. Gutter shared with the debugger: clicking the Compose icon opens the run menu and does not toggle a breakpoint.
 const before=await debugConfigs();const box=await glyph(2).boundingBox();
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.locator('.compose-run-menu').waitFor();await page.waitForTimeout(200);
 check(await breakpoints()===0&&await debugConfigs()===before,'clique no ícone do Compose não cria breakpoint');
 check((await page.locator('.compose-run-menu [role=menuitem]').allTextContents()).join('|')==="Executar 'cache'|Parar 'cache'",'menu do ícone: Executar/Parar o serviço');
 await page.keyboard.press('Escape');
 // The line number itself still belongs to the debugger in project files.
 const number=await page.locator('.margin-view-overlays .line-numbers').filter({hasText:/^4$/}).first().boundingBox();
 await page.mouse.click(number.x+number.width-6,number.y+number.height/2);await page.waitForTimeout(250);
 check(await breakpoints()===0&&await debugConfigs()===before,'Compose: clique no número de linha não cria breakpoint');
 check(await page.locator('.view-overlays .selected-text').count()>0,'Compose: clique no número seleciona a linha');
 await page.mouse.click(number.x+number.width-6,number.y+number.height/2,{button:'right'});await page.waitForTimeout(200);
 check(await page.locator('.debug-gutter-menu').count()===0,'Compose: clique direito no número não abre o menu de breakpoint');
 await page.mouse.move(number.x+number.width-6,number.y+number.height/2);
 check(await page.evaluate(()=>{const n=[...document.querySelectorAll('.margin-view-overlays .line-numbers')].find(e=>e.matches(':hover'));return n?getComputedStyle(n,'::before').display:'none';})==='none','Compose: sem ponto de breakpoint ao passar o mouse no número');
 await page.getByRole('button',{name:'index.php',exact:true}).first().click();await page.waitForTimeout(400);
 const php=await page.locator('.margin-view-overlays .line-numbers').filter({hasText:/^2$/}).first().boundingBox();
 await page.mouse.click(php.x+php.width-6,php.y+php.height/2);await page.waitForTimeout(250);
 check(await breakpoints()===1,'no PHP o número de linha continua alternando breakpoint');
 await page.mouse.click(php.x+php.width-6,php.y+php.height/2);await page.waitForTimeout(250);
 await page.getByRole('button',{name:'compose.yaml',exact:true}).first().click();await page.locator('.compose-run').first().waitFor();await page.waitForTimeout(300);

 // 3. Gutter ▶ on web → temporary configuration selected in the toolbar, up -d web.
 await glyph(1).click();await page.locator('.compose-run-menu [data-compose-run=up]').click();
 await page.waitForFunction(()=>window.__calls.some(c=>c[0]==='dockerCompose'&&c[3]==='up'));
 const up=(await composeCalls('up'))[0];check(up[2]==='compose.yaml'&&up[5]==='web','▶ de web executa up -d web');
 await page.waitForFunction(()=>document.querySelector('#run-config-host .run-config-name')?.textContent==='compose.yaml: web');
 check(await page.locator('#run-config-host.temporary').count()===1,'configuração temporária "compose.yaml: web" selecionada no topo');
 check(!(await page.locator('#run-current').isDisabled()),'botão Executar do topo habilitado para a configuração');
 await page.waitForFunction(()=>[...document.querySelectorAll('.compose-state-hint')].map(e=>e.textContent.replace(/\u00a0/g,' ')).join('|')==='running|running',null,{timeout:8000});
 check(true,'após o up, web passa a running no inlay');
 await page.screenshot({path:out+'/02-toolbar-temporary.png',clip:{x:700,y:0,width:812,height:120}});

 // Toolbar popup: lists the configuration, Arquivo atual, Save and Edit Configurations.
 await page.locator('#run-config-host').click();const menu=page.locator('#run-config-host-menu');await menu.waitFor();
 const labels=await menu.locator('.run-config-menu-label').allTextContents();
 check(labels.join('|')==="compose.yaml: web|Arquivo atual|Salvar a configuração 'compose.yaml: web'|Editar configurações…",'popup do seletor: configuração, Arquivo atual, Salvar, Editar configurações…');
 await page.screenshot({path:out+'/03-toolbar-menu.png'});
 await menu.locator('[data-action=edit]').click();

 // Run configurations dialog: complete the configuration and keep it.
 const dialog=page.locator('.compose-config-dialog');await dialog.waitFor();
 await dialog.locator('[name=name]').fill('Shop web');await dialog.locator('[name=store] , input[name=store]').first().check();
 await dialog.locator('[name=services]').fill('web, cache');await dialog.locator('[name=projectName]').fill('Shop');
 await dialog.locator('[name=build]').selectOption('always');await dialog.locator('[name=downVolumes]').check();
 await dialog.getByRole('button',{name:'OK'}).click();
 await page.waitForFunction(()=>/Nome de projeto/.test(document.querySelector('.compose-config-errors')?.textContent??''));
 check(await dialog.isVisible(),'nome de projeto inválido: erro visível, diálogo continua aberto');
 await dialog.locator('[name=projectName]').fill('shop');await page.screenshot({path:out+'/04-config-dialog.png'});
 await dialog.getByRole('button',{name:'OK'}).click();await dialog.waitFor({state:'detached'});
 check(await page.locator('#run-config-host .run-config-name').textContent()==='Shop web'&&await page.locator('#run-config-host.temporary').count()===0,'configuração salva aparece no topo sem marca temporária');
 const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('php-ide-docker-compose-configs:/fixture')));
 check(saved.configurations[0].services.join(',')==='web,cache'&&saved.configurations[0].projectName==='shop'&&saved.configurations[0].downVolumes===true,'configuração persistida por projeto');
 // Run from the toolbar.
 await page.locator('#run-current').click();
 await page.waitForFunction(()=>window.__calls.filter(c=>c[0]==='dockerCompose'&&c[3]==='up').length===2);
 const run=(await composeCalls('up'))[1];
 check(JSON.stringify([run[5],run[6]])===JSON.stringify([['web','cache'],{build:'always',recreate:'',removeOrphans:false,projectName:'shop'}]),'Executar do topo: up -d --build -p shop web cache');

 // 1. Down from Services: options start from the configuration (volumes on), warning, then down --volumes.
 await page.locator('#docker-tab-compose').click();await page.locator('[data-compose=down]:not([disabled])').waitFor();
 await page.locator('[data-compose=down]').click();const down=page.locator('.compose-down-dialog');await down.waitFor();
 check(await down.locator('[name=volumes]').isChecked()&&await down.locator('.compose-down-warning').isVisible(),'Down: “Remover volumes” vem da configuração, com aviso de perda de dados');
 await down.locator('[name=removeOrphans]').check();await page.screenshot({path:out+'/05-down-dialog.png'});
 await down.getByRole('button',{name:'Down e remover volumes'}).click();
 await page.waitForFunction(()=>window.__calls.some(c=>c[0]==='dockerCompose'&&c[3]==='down'));
 const d=(await composeCalls('down'))[0];check(JSON.stringify(d[6])===JSON.stringify({volumes:true,removeOrphans:true,projectName:'shop'}),'Down envia --volumes --remove-orphans -p shop');
 await page.waitForFunction(()=>document.getElementById('docker-compose-output').textContent.includes('Volume shop_data Removed'));
 await page.waitForFunction(()=>document.querySelectorAll('.compose-state-hint').length===0,null,{timeout:8000});
 check(await page.locator('.glyph-margin-widgets .compose-run.compose-running').count()===0,'após o Down, sem inlays nem marcadores de execução');

 // 2. Services: Compose project group and the inlay opening logs.
 await page.evaluate(()=>{window.__engine={cache:{state:'running',exitCode:0},web:{state:'exited',exitCode:137}};});
 await page.locator('#docker-connect').click();await page.waitForFunction(()=>[...document.querySelectorAll('#docker-tree summary')].some(s=>s.textContent.startsWith('Compose: shop')));
 const group=page.locator('#docker-tree details[data-group="Compose: shop"]');
 check(await group.locator('summary').getAttribute('data-running')==='true','Services: grupo Compose: shop marcado em execução');
 check((await group.locator('.docker-resource').evaluateAll(b=>b.map(e=>e.dataset.state))).join(',')==='running,exited','Services: cache running, web exited');
 await page.waitForFunction(()=>[...document.querySelectorAll('.compose-state-hint')].map(e=>e.textContent.replace(/\u00a0/g,' ')).join('|')==='exited (137)|running',null,{timeout:8000});
 check(await page.locator('.compose-state-failed').count()===1,'saída 137 aparece como falha no inlay');
 await page.locator('.compose-state-hint').nth(1).click();
 await page.waitForFunction(()=>document.getElementById('docker-tab-logs').getAttribute('aria-selected')==='true'&&document.getElementById('docker-logs').textContent.includes('cache ready'));
 check(await page.locator('#docker-selection').textContent()==='shop-cache-1','clique no inlay abre os logs de cache no Services');
 await page.screenshot({path:out+'/06-services-compose.png'});
 check(!errors.length,'sem erros de página: '+errors.join('; '));
 console.log(ok.map(l=>'✓ '+l).join('\n'));console.log(`check-docker-compose-ui (${process.argv.includes('--chromium')?'Chromium':'WebKit'}): ${ok.length} verificações OK · capturas em ${out}`);
}catch(error){await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});console.error(ok.map(l=>'✓ '+l).join('\n'));throw error;}finally{await browser?.close();server.kill();}
