// Interface do depurador (src/debug-panel.ts) no Monaco real com IPC simulado.
// O protocolo DBGp e o Xdebug real são verificados por scripts/check-xdebug.mjs.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
const port=await new Promise(resolve=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
let browser;const ok=[];
const check=(cond,label)=>{if(!cond)throw Error('Falhou: '+label);ok.push(label);};
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.once('exit',reject);});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:940}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const text=await readFile('fixtures/php-intelligence/probe.php','utf8');
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 window.__calls=[];window.__cbs={};window.__listeners={};let next=1;
 window.__TAURI_INTERNALS__={transformCallback(cb){const id=next++;window.__cbs[id]=cb;return id;},invoke:async(cmd,args)=>{if(cmd==='plugin:event|listen'){window.__listeners[args.event]=args.handler;return 1;}return null;}};
 window.__emit=payload=>window.__cbs[window.__listeners['debug-event']]({event:'debug-event',id:1,payload});
 const file={path:'probe.php',uri:'file:///fixture/probe.php',text:${JSON.stringify(text)},etag:'preview'};
 const prop=(name,type,value,extra={})=>({name,fullname:name,type,value,children:false,numchildren:0,page:0,items:[],...extra});
 const numbers=n=>Array.from({length:n},(_,i)=>prop('$numbers['+i+']','int',String(i+1)));
 window.ide=new Proxy({},{get:(_,method)=>{
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async(...args)=>{
   if(String(method).startsWith('debug'))window.__calls.push([method,...args]);
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'fixture'};
   if(method==='tree')return [{name:'probe.php',path:'probe.php',directory:false}];
   if(method==='read')return file;
   if(method==='debugStatus')return {listening:null,sessions:[]};
   if(method==='debugListen'){if(args[0]===9100)throw Error('A porta 9100 já está em uso (outro IDE ou processo escutando).');return {listening:{port:args[0],all:args[1]},sessions:[]};}
   if(method==='debugContexts')return [{id:0,name:'Locals'},{id:1,name:'Superglobals'}];
   if(method==='debugVariables')return [prop('$numbers','array','',{children:true,numchildren:250,pagesize:100,items:numbers(100)}),prop('$name','string','Ana',{size:3})];
   if(method==='debugProperty')return prop('$numbers','array','',{children:true,numchildren:250,page:args[4],pagesize:100,items:numbers(250).slice(args[4]*100,args[4]*100+100)});
   if(method==='debugEval')return prop('','int','2');
   if(method==='debugStack')return [{level:0,where:'{main}',type:'file',line:3,local:'probe.php',server:'/var/www/html/probe.php'},{level:1,where:'vendor',type:'file',line:9,local:'vendor/x.php',server:'/var/www/vendor/x.php'}];
   if(method==='pluginList')return {plugins:[]};
   if(method==='language'||method==='gitStatus')return null;
   return [];
  };
 }});
 document.getElementById('startup-splash')?.remove();
 await import('/src/main.ts');`}));
 await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('button',{name:'probe.php',exact:true}).click();await page.locator('.view-lines .view-line').first().waitFor();await page.waitForTimeout(500);
 const calls=()=>page.evaluate(()=>window.__calls);
 // Gutter: clique na margem de glifos da linha 3.
 const line=await page.locator('.view-lines .view-line').nth(2).boundingBox();const glyph=await page.locator('.monaco-editor .margin .glyph-margin').first().boundingBox();
 await page.mouse.click(glyph.x+glyph.width/2,line.y+line.height/2);await page.waitForTimeout(300);
 check(await page.locator('.debug-bp').count()===1,'clique na gutter cria breakpoint');
 check((await calls()).some(c=>c[0]==='debugConfig'&&c[1].some(b=>b.path==='probe.php'&&b.line===3)),'breakpoint enviado ao backend');
 check((await page.evaluate(()=>localStorage.getItem('php-ide-debug:/fixture'))).includes('"line":3'),'breakpoint persistido por projeto');
 await page.locator('.view-lines .view-line').nth(4).click();await page.keyboard.press('Meta+F8');await page.waitForTimeout(300);
 check(await page.locator('.debug-bp').count()===2,'Cmd+F8 alterna breakpoint na linha do cursor');
 await page.keyboard.press('Meta+F8');await page.waitForTimeout(200);check(await page.locator('.debug-bp').count()===1,'Cmd+F8 remove breakpoint');
 await page.keyboard.press('Alt+Digit5');check(await page.locator('#debug-panel').isVisible(),'Alt+5 abre o painel');
 await page.locator('#debug-listen').click();await page.waitForFunction(()=>document.querySelector('#debug-listen').textContent.includes('9003'));
 check((await calls()).some(c=>c[0]==='debugListen'&&c[1]===9003),'Escutar usa a porta 9003');
 await page.evaluate(()=>{window.__emit({kind:'session',session:'s1',info:{peer:'127.0.0.1:5000',idekey:'PHPSTORM',server:'/var/www/html/probe.php',local:'probe.php',engine:'Xdebug 3.4.5'}});window.__emit({kind:'break',session:'s1',reason:'ok',frames:[{level:0,where:'{main}',type:'file',line:3,local:'probe.php',server:'/var/www/html/probe.php'},{level:1,where:'vendor',type:'file',line:9,local:null,server:'/var/www/vendor/x.php'}]});});
 await page.locator('#debug-tree .debug-row').first().waitFor();
 check(await page.locator('.debug-current-line').count()===1,'linha atual destacada');
 check(await page.locator('#debug-frames > li').count()===2,'frames listados');
 check((await page.locator('#debug-state').textContent()).includes('Pausado'),'estado pausado visível');
 check((await page.locator('#debug-tree').textContent()).includes('array(250)'),'variáveis em árvore');
 await page.locator('#debug-tree .debug-twist').first().click();check(await page.locator('#debug-tree ul[role=group] > li').count()===101,'filhos da primeira página + "mostrar mais"');
 await page.getByRole('button',{name:/Mostrar mais \(150/}).click();await page.waitForFunction(()=>document.querySelectorAll('#debug-tree ul[role=group] > li').length===201);
 check((await calls()).some(c=>c[0]==='debugProperty'&&c[4]==='$numbers'&&c[5]===1),'paginação pede a página 1');
 await page.locator('#debug-watch').fill('$a + 1');await page.locator('#debug-watch').press('Enter');await page.locator('.debug-watch').first().waitFor();
 check((await calls()).some(c=>c[0]==='debugEval'&&c[2]==='$a + 1'),'watch avaliado');
 await page.locator('#debug-eval').fill('count($numbers)');await page.locator('#debug-eval').press('Enter');await page.waitForFunction(()=>document.querySelector('#debug-console').textContent.includes('int: 2'));
 check(true,'console avalia expressão');
 await page.locator('.monaco-editor').first().click();
 for(const [key,action] of [['F8','step_over'],['F7','step_into'],['Shift+F8','step_out'],['F9','run']]){await page.keyboard.press(key);await page.waitForTimeout(50);check((await calls()).some(c=>c[0]==='debugContinue'&&c[2]===action),`${key} → ${action}`);}
 await page.getByRole('button',{name:'Mapear caminho…'}).click();
 check(await page.locator('#debug-map-server').inputValue()==='/var/www/vendor','mapeamento ausente sugere a pasta do servidor');
 await page.locator('#debug-map-local').fill('vendor');await page.getByRole('button',{name:'Adicionar'}).click();
 await page.waitForTimeout(300);check((await calls()).some(c=>c[0]==='debugConfig'&&c[2].some(m=>m.server==='/var/www/vendor'&&m.local==='vendor')),'mapeamento enviado');
 check(await page.locator('#debug-frames .debug-unmapped').count()===0&&await page.locator('#debug-frames > li').count()===2,'frames remapeados após adicionar mapeamento');
 check(await page.locator('.debug-current-line').count()===1,'linha atual mantida após remapear');
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/debug-panel-preview.png'});
 await page.evaluate(()=>window.__emit({kind:'ended',session:'s1'}));await page.waitForTimeout(200);
 check(await page.locator('.debug-current-line').count()===0,'fim da sessão limpa a linha atual');
 await page.locator('#debug-listen').click();await page.waitForFunction(()=>document.querySelector('#debug-listen').getAttribute('aria-pressed')==='false');
 await page.locator('#debug-port').fill('9100');await page.locator('#debug-listen').click();await page.waitForFunction(()=>document.querySelector('#debug-console').textContent.includes('9100 já está em uso'));
 check(await page.locator('#debug-listen').getAttribute('aria-pressed')==='false','porta ocupada: erro visível e recuperável');
 check(!errors.length,'sem erros de página: '+errors.join('; '));
 console.log(ok.map(l=>'✓ '+l).join('\n'));console.log(`check-debug-ui: ${ok.length} verificações OK`);
} finally { await browser?.close(); server.kill(); }
