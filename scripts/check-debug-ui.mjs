// Debugger plugin UI (breakpoints over line numbers, View Breakpoints, exception breakpoints, Debug window,
// watches, Evaluate Expression, inline values, pause) on real Monaco with simulated native tool IPC.
// The DBGp protocol and real Xdebug are covered by the plugin's own tests (scripts/check-xdebug.mjs).
// Criteria: docs/research/xdebug-fidelity.md. Options: --webkit (engine of the macOS Tauri WebView),
// --out=<dir> for screenshots, --light for the light theme (default dark, like the Islands Dark reference). PHP_IDE_DEBUGGER_PLUGIN=<dir> tests a local plugin checkout instead of the pin.
import { chromium, webkit } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
const port=await new Promise(resolve=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'.artifacts/debugger-fidelity';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
let browser,page;const ok=[];
const check=(cond,label)=>{if(!cond)throw Error('Falhou: '+label);ok.push(label);};
const text=`<?php

final class Order
{
    public function __construct(public string $id, public array $items = [])
    {
    }

    public function total(): int
    {
        $sum = 0;
        foreach ($this->items as $price) {
            $sum += $price;
        }
        return $sum;
    }
}

function checkout(Order $order): int
{
    $total = $order->total();
    if ($total > 100) {
        throw new InvalidArgumentException("Too expensive: $total");
    }
    return $total;
}

$order = new Order('A-1', [10, 20, 30]);
$name = 'Ana';
$count = count($order->items);
$total = checkout($order);
echo "Total: $total\\n";
`;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.once('exit',reject);});
 browser=process.argv.includes('--webkit')?await webkit.launch({headless:true}):await chromium.launch({headless:true,channel:'chrome'});
 page=await browser.newPage({viewport:{width:1512,height:949},deviceScaleFactor:2,colorScheme:process.argv.includes('--light')?'light':'dark'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const pluginDir=process.env.PHP_IDE_DEBUGGER_PLUGIN??'.tools/plugin-packages/php-debugger';
 const manifest=JSON.parse(await readFile(pluginDir+'/plugin.json','utf8'));
 const source={key:'user:'+manifest.id,manifest,code:await readFile(pluginDir+'/workbench.js','utf8'),style:await readFile(pluginDir+'/workbench.css','utf8')};
 await page.route('**/src/window-layout.ts',route=>route.fulfill({contentType:'application/javascript',body:'export async function welcomeWindow(){} export async function workbenchWindow(){}'}));
 await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 window.__calls=[];window.__cbs={};window.__listeners={};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};let next=1;
 window.__TAURI_INTERNALS__={transformCallback(cb){const id=next++;window.__cbs[id]=cb;return id;},invoke:async(cmd,args)=>{if(cmd==='plugin:event|listen'){window.__listeners[args.event]=args.handler;return 1;}return null;}};
 window.__emit=payload=>window.__cbs[window.__listeners['plugin-tool-event']]({event:'plugin-tool-event',id:1,payload:{key:'user:phpforge.php-debugger',root:'/fixture',channel:'debug-event',payload}});
 const file={path:'debug.php',uri:'file:///fixture/debug.php',text:${JSON.stringify(text)},etag:'preview'};
 const prop=(name,type,value,extra={})=>({name,fullname:name,type,value,children:false,numchildren:0,page:0,items:[],...extra});
 window.__vars=[prop('$order','object','',{classname:'Order',children:true,numchildren:2,items:[prop('id','string','A-1',{fullname:'$order->id',size:3}),prop('items','array','',{fullname:'$order->items',children:true,numchildren:3})]}),prop('$total','int','60')];
 window.__pause=false;
 window.ide=new Proxy({},{get:(_,method)=>{
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async(...args)=>{
   if(String(method).startsWith('debug'))window.__calls.push([method,...args]);
   if(method==='startupInfo')return {project:'/fixture'};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'debug-reference'};
   if(method==='tree')return [{name:'debug.php',path:'debug.php',directory:false}];
   if(method==='read')return file;
   if(method==='debugStatus')return {listening:null,sessions:[]};
   if(method==='debugListen'){if(args[0]===9100)throw Error('A porta 9100 já está em uso (outro IDE ou processo escutando).');return {listening:{port:args[0],all:args[1]},sessions:[]};}
   if(method==='debugContexts')return [{id:0,name:'Locals'},{id:1,name:'Superglobals'}];
   if(method==='debugVariables')return args[2]===1?[prop('$_SERVER','array','',{children:true,numchildren:23})]:window.__vars;
   if(method==='debugProperty')return prop(args[3],'array','',{children:true,numchildren:3,items:[prop('0','int','10',{fullname:args[3]+'[0]'}),prop('1','int','20',{fullname:args[3]+'[1]'}),prop('2','int','30',{fullname:args[3]+'[2]'})]});
   if(method==='debugEval'){if(args[1]==='$missing->x(')throw Error('error evaluating code (DBGp 206)');if(args[1]==='$order')return prop('','object','',{classname:'Order',children:true,numchildren:2,items:[prop('id','string','A-1',{fullname:'$order->id',size:3})]});return prop('','int','61');}
   if(method==='debugPause'){window.__pause=true;return null;}
   if(method==='debugStack')return [{level:0,where:'checkout',type:'file',line:21,local:'debug.php',server:'/app/debug.php'}];
   if(method==='pluginToolSource')return ${JSON.stringify(source)};
   if(method==='pluginToolCall')return window.ide[args[1]](...args[2]);
   if(method==='pluginSource')return {manifest:${JSON.stringify(manifest)},code:'ide.register({detect:async()=>({})});',rootUri:'file:///fixture/'};
   if(method==='pluginList')return {defaults:[],permissions:${JSON.stringify(manifest.permissions)},ideVersion:'0.2.17',userDir:'/fixture-plugins',projectDir:'/fixture/.php-ide/plugins',plugins:[{key:'user:phpforge.php-debugger',scope:'user',dir:'/fixture-plugins',manifest:${JSON.stringify(manifest)},enabled:true,needsConsent:false,consented:true,granted:${JSON.stringify(manifest.permissions)}}]};
   if(method==='language'||method==='gitStatus'||method==='phpMethodFamily')return null;
   return [];
  };
 }});
 document.getElementById('startup-splash')?.remove();
 await import('/src/main.ts');`}));
 await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('button',{name:'debug.php',exact:true}).first().click();await page.locator('.view-lines .view-line').first().waitFor();await page.locator('#debug-panel').waitFor({state:'attached'});await page.waitForTimeout(600);
 const calls=()=>page.evaluate(()=>window.__calls);
 const lastConfig=async()=>(await calls()).filter(c=>c[0]==='debugConfig').at(-1);
 const number=async line=>{const box=await page.locator('.margin-view-overlays .line-numbers').filter({hasText:new RegExp('^'+line+'$')}).first().boundingBox();return box;};
 const clickNumber=async(line,opts={})=>{const b=await number(line);await page.mouse.move(b.x+b.width-6,b.y+b.height/2);if(opts.modifiers)for(const m of opts.modifiers)await page.keyboard.down(m);await page.mouse.down({button:opts.button??'left'});await page.mouse.up({button:opts.button??'left'});if(opts.modifiers)for(const m of opts.modifiers)await page.keyboard.up(m);await page.waitForTimeout(250);};
 const classesOf=async line=>{const b=await number(line).catch(()=>null);return page.evaluate(([y])=>{const el=[...document.querySelectorAll('.margin-view-overlays .line-numbers')].find(e=>{const r=e.getBoundingClientRect();return Math.abs(r.top+r.height/2-y)<3;});return el?el.className:'';},[b?b.y+b.height/2:0]);};
 await mkdir(out,{recursive:true});

 // 1. Breakpoint no número da linha.
 check(!/debug-bp/.test(await classesOf(11)),'linha 11 começa sem breakpoint');
 const before=await page.evaluate(()=>window.__calls.length);
 await clickNumber(11);
 check(/debug-bp-line/.test(await classesOf(11)),'clique no número cria breakpoint no lugar do número');
 check(await page.evaluate(()=>!!document.querySelector('.debug-bp-row')),'linha com breakpoint recebe fundo');
 check((await lastConfig())?.[1].some(b=>b.path==='debug.php'&&b.line===11),'breakpoint enviado ao serviço');
 check((await page.evaluate(()=>localStorage.getItem('php-ide-debug:/fixture'))).includes('"line":11'),'breakpoint persistido por projeto');
 check(await page.locator('.view-overlays .selected-text').count()===0,'clicar no número não seleciona a linha');
 await clickNumber(21);check(/debug-bp-line/.test(await classesOf(21)),'segundo breakpoint (linha 21)');
 await clickNumber(21,{modifiers:['Alt']});check(/debug-bp-disabled/.test(await classesOf(21)),'⌥+clique desativa (anel vazado)');
 await clickNumber(21,{modifiers:['Alt']});check(/debug-bp-line/.test(await classesOf(21))&&!/disabled/.test(await classesOf(21)),'⌥+clique reativa');
 await clickNumber(30,{modifiers:['Shift']});check(/debug-bp-log/.test(await classesOf(30)),'⇧+clique cria breakpoint de log (não suspende)');
 check((await lastConfig())[1].some(b=>b.line===30&&b.suspend===false&&b.log===true),'breakpoint de log enviado com suspend=false');
 await clickNumber(30);check(!/debug-bp/.test(await classesOf(30)),'clique no breakpoint remove');

 // Popup de propriedades (clique direito no breakpoint).
 await clickNumber(11,{button:'right'});
 const popup=page.locator('.debug-bp-popup');await popup.waitFor();
 check((await popup.locator('strong').textContent())==='debug.php:11','popup ancorado mostra arquivo:linha');
 check(await popup.getByLabel('Ativado').isChecked()&&await popup.getByLabel('Suspender execução').isChecked(),'popup: Enabled e Suspend execution marcados');
 check((await popup.getByRole('button').allTextContents()).some(t=>t.includes('⇧⌘F8')),'popup: link Mais (⇧⌘F8)');
 await page.keyboard.type('$sum > 5');await page.screenshot({path:out+'/01-bp-popup.png'});
 await popup.getByRole('button',{name:'Concluir'}).click();
 check(/debug-bp-conditional/.test(await classesOf(11)),'condição torna o ícone condicional (?)');
 await page.waitForTimeout(250);check((await lastConfig())[1].some(b=>b.line===11&&b.condition==='$sum > 5'),'condição enviada ao Xdebug');
 // Menu do número sem breakpoint.
 await clickNumber(29,{button:'right'});
 const menu=page.locator('.debug-gutter-menu');await menu.waitFor();
 check((await menu.getByRole('menuitem').allTextContents()).join('|')==='Adicionar breakpoint|Adicionar breakpoint condicional…|Adicionar breakpoint de log…','menu do número: Add / Conditional / Logging');
 await page.screenshot({path:out+'/02-number-menu.png'});
 await menu.getByRole('menuitem',{name:'Adicionar breakpoint',exact:true}).click();await page.waitForTimeout(250);check(/debug-bp-line/.test(await classesOf(29)),'menu adiciona breakpoint');
 // ⌘F8 na linha do cursor.
 await page.locator('.view-lines .view-line').nth(27).click();await page.keyboard.press('Meta+F8');await page.waitForTimeout(250);
 check(/debug-bp-line/.test(await classesOf(28)),'⌘F8 alterna breakpoint na linha do cursor');
 await page.keyboard.press('Meta+F8');await page.waitForTimeout(250);check(!/debug-bp/.test(await classesOf(28)),'⌘F8 remove');
 await page.screenshot({path:out+'/03-gutter-breakpoints.png'});

 // 3. View Breakpoints + exceção.
 await page.keyboard.press('Shift+Meta+F8');
 const dialog=page.locator('.debug-breakpoints-dialog');await dialog.waitFor();
 check((await dialog.locator('.debug-bp-tree').textContent()).includes('Breakpoints de linha PHP'),'⇧⌘F8 abre o diálogo Breakpoints com o grupo de linha');
 check(await dialog.locator('.debug-bp-tree li[role=treeitem] li').count()===3,'três breakpoints de linha listados');
 await dialog.getByRole('button',{name:'Adicionar breakpoint'}).click();
 await page.locator('.debug-add-menu').getByRole('menuitem',{name:'Breakpoints de exceção PHP'}).click();
 const ask=page.locator('.debug-add-exception');await ask.waitFor();
 await ask.getByRole('button',{name:'OK'}).click();check((await ask.locator('.debug-field-error').textContent()).length>0,'nome vazio: erro visível e recuperável');
 await ask.locator('input').fill('App\\Boom');await page.screenshot({path:out+'/04-add-exception.png'});await ask.locator('input').press('Enter');
 await page.waitForTimeout(300);
 check((await dialog.locator('.debug-bp-tree').textContent()).includes('Breakpoints de exceção PHP')&&(await dialog.locator('.debug-bp-tree').textContent()).includes('App\\Boom'),'breakpoint de exceção listado no grupo próprio');
 check((await lastConfig())[4].some(e=>e.name==='App\\Boom'),'exceção enviada ao serviço (breakpoint_set -t exception)');
 check((await dialog.locator('.debug-props-title').textContent())==='App\\Boom','propriedades da exceção à direita');
 await page.screenshot({path:out+'/05-breakpoints-dialog.png'});
 await dialog.locator('.debug-bp-tree li li').filter({hasText:'debug.php:11'}).click();
 check((await dialog.locator('.debug-props-title').textContent())==='debug.php:11'&&(await dialog.locator('.debug-bp-preview').textContent()).includes('$sum = 0;'),'linha selecionada mostra propriedades e prévia do código');
 await dialog.getByLabel('Remover após atingir').check();
 await page.screenshot({path:out+'/06-breakpoints-dialog-line.png'});
 await dialog.getByRole('button',{name:'Concluir'}).click();check(!(await dialog.isVisible()),'Concluir fecha o diálogo');

 // 4. Sessão: escuta, estados, pausa, parada, variáveis, inline.
 await page.keyboard.press('Alt+Digit5');check(await page.locator('#debug-panel').isVisible(),'Alt+5 abre a janela Debug');
 await page.locator('#debug-listen').click();await page.waitForFunction(()=>document.querySelector('#debug-listen').getAttribute('aria-pressed')==='true');
 check((await calls()).some(c=>c[0]==='debugListen'&&c[1]===9003),'Escutar usa a porta 9003');
 await page.evaluate(()=>{window.__emit({kind:'session',session:'s1',info:{peer:'127.0.0.1:5000',idekey:'PHPSTORM',server:'/app/debug.php',local:'debug.php',engine:'Xdebug 3.4.5'}});window.__emit({kind:'capabilities',session:'s1',async:false});window.__emit({kind:'breakpoint',session:'s1',path:'debug.php',line:21,state:'verified'});window.__emit({kind:'breakpoint',session:'s1',path:'debug.php',line:11,state:'invalid',message:'Breakpoint não pôde ser definido (DBGp 200)'});window.__emit({kind:'running',session:'s1'});});
 await page.waitForTimeout(250);
 check(/debug-bp-verified/.test(await classesOf(21)),'breakpoint aceito pelo Xdebug fica verificado (✓)');
 check(/debug-bp-invalid/.test(await classesOf(11)),'breakpoint recusado fica inválido');
 check((await page.locator('#debug-frames').textContent()).includes('Frames não disponíveis')&&(await page.locator('#debug-tree').textContent()).includes('Conectado'),'em execução: frames indisponíveis, “Conectado”');
 check(await page.locator('#debug-pause').isDisabled()&&(await page.locator('#debug-pause').getAttribute('title')).includes('não aceita pausa'),'Pause desativado com explicação quando o Xdebug não aceita pausa');
 await page.evaluate(()=>window.__emit({kind:'capabilities',session:'s1',async:true}));await page.waitForTimeout(100);
 check(!(await page.locator('#debug-pause').isDisabled()),'Pause ativo quando o motor aceita comandos assíncronos');
 await page.locator('#debug-pause').click();await page.waitForTimeout(100);check((await calls()).some(c=>c[0]==='debugPause'&&c[1]==='s1'),'Pause envia debugPause');
 await page.screenshot({path:out+'/07-running.png'});
 await page.evaluate(()=>window.__emit({kind:'break',session:'s1',reason:'ok',frames:[{level:0,where:'checkout',type:'file',line:21,local:'debug.php',server:'/app/debug.php'},{level:1,where:'{main}',type:'file',line:31,local:'debug.php',server:'/app/debug.php'}]}));
 await page.locator('#debug-tree .debug-row').first().waitFor();await page.waitForTimeout(300);
 check(await page.locator('.debug-exec-line').count()===1,'linha de execução destacada');
 check((await page.locator('#debug-frames li').first().textContent()).replace(/\s+/g,' ')==='debug.php:21, checkout()','frame no formato arquivo:linha, função()');
 check(await page.locator('#debug-frames li').count()===2,'dois frames');
 const rows=(await page.locator('#debug-tree > li > .debug-row').allTextContents()).map(t=>t.replace(/\s+/g,' ').replace('×','').trim());
 check(rows.includes('$order = {Order}')&&rows.includes('$total = {int} 60')&&rows.includes('$_SERVER = {array[23]}'),'variáveis como {tipo} valor: '+rows.join(' | '));
 const inline=(await page.locator('.debug-inline-value').allTextContents()).map(t=>t.replace(/\u00a0/g,' '));
 check(inline.some(t=>t.includes('$total: 60')&&t.includes('$order: Order'))&&inline.some(t=>t.trim()==='$order: Order'),'valores inline na função corrente: '+inline.join(' | '));
 await page.locator('#debug-tree > li').first().locator('.debug-twist').click();await page.waitForTimeout(150);
 check((await page.locator('#debug-tree > li').first().textContent()).includes('"A-1"'),'expande objeto e mostra string entre aspas');
 await page.screenshot({path:out+'/08-paused.png'});
 // Evaluate no topo da árvore e watch.
 await page.locator('#debug-eval').fill('$total + 1');await page.locator('#debug-eval').press('Enter');await page.waitForTimeout(250);
 check((await page.locator('#debug-tree > li').first().textContent()).replace(/\s+/g,' ').includes('result = {int} 61'),'Enter avalia e mostra result no topo');
 await page.locator('#debug-eval').fill('$order->total()');await page.locator('#debug-eval').press('Shift+Meta+Enter');await page.waitForTimeout(250);
 check((await page.locator('#debug-tree .debug-watch').allTextContents()).includes('$order->total()'),'⇧⌘Enter adiciona watch');
 check((await calls()).some(c=>c[0]==='debugEval'&&c[2]==='$order->total()'),'watch avaliado no frame');
 // Evaluate Expression (⌥F8).
 await page.locator('.view-lines .view-line').nth(20).click({position:{x:120,y:8}});await page.keyboard.press('Alt+F8');
 const ev=page.locator('.debug-evaluate');await ev.waitFor();
 await ev.locator('input').fill('$order');await ev.getByRole('button',{name:'Avaliar'}).click();await page.waitForTimeout(250);
 check((await ev.locator('.debug-evaluate-result').textContent()).replace(/\s+/g,' ').includes('result = {Order}'),'⌥F8: Avaliar mostra result em árvore');
 check((await ev.locator('.debug-evaluate-result').textContent()).includes('"A-1"'),'⌥F8: resultado expandido');
 await page.screenshot({path:out+'/09-evaluate.png'});
 await ev.locator('input').fill('$missing->x(');await ev.locator('input').press('Enter');await page.waitForTimeout(200);
 check((await ev.locator('.debug-evaluate-result').textContent()).includes('DBGp 206'),'erro de avaliação visível');
 await ev.getByRole('button',{name:'Fechar'}).click();check(!(await ev.isVisible()),'Fechar fecha a janela Evaluate');
 // Passos e teclas.
 await page.locator('.monaco-editor').first().click();
 for(const [k,action] of [['F8','step_over'],['F7','step_into'],['Shift+F8','step_out'],['F9','run']]){await page.keyboard.press(k);await page.waitForTimeout(60);check((await calls()).some(c=>c[0]==='debugContinue'&&c[2]===action),`${k} → ${action}`);await page.evaluate(()=>window.__emit({kind:'break',session:'s1',reason:'ok',frames:[{level:0,where:'checkout',type:'file',line:21,local:'debug.php',server:'/app/debug.php'}]}));await page.waitForTimeout(120);}
 // Exceção.
 await page.evaluate(()=>{window.__emit({kind:'running',session:'s1'});window.__emit({kind:'break',session:'s1',reason:'exception',exception:'App\\Boom',message:'Too expensive: 140',frames:[{level:0,where:'checkout',type:'file',line:23,local:'debug.php',server:'/app/debug.php'}]});});
 await page.waitForTimeout(400);
 check(/debug-bp-exception/.test(await classesOf(23)),'parada em exceção: raio no lugar do número');
 check((await page.locator('#debug-tree > li > .debug-row').allTextContents()).some(t=>t.replace(/\s+/g,' ').includes('Exception = {App\\Boom}')),'Variables mostra Exception = {Classe}');
 await page.screenshot({path:out+'/10-exception.png'});
 // Breakpoint de log: registra e continua sem parar.
 await clickNumber(25,{modifiers:['Shift']});
 const runsBefore=(await calls()).filter(c=>c[0]==='debugContinue'&&c[2]==='run').length;
 await page.keyboard.press('F9');await page.waitForTimeout(80);
 await page.evaluate(()=>window.__emit({kind:'break',session:'s1',reason:'ok',frames:[{level:0,where:'checkout',type:'file',line:25,local:'debug.php',server:'/app/debug.php'}]}));await page.waitForTimeout(300);
 check((await calls()).filter(c=>c[0]==='debugContinue'&&c[2]==='run').length===runsBefore+2,'breakpoint de log continua sozinho');
 await page.locator('[data-tab=console]').click();check((await page.locator('#debug-console').textContent()).includes('Breakpoint atingido em debug.php:25'),'mensagem "Breakpoint atingido" no console');
 await page.locator('[data-tab=threads]').click();
 // Remove once hit (linha 11).
 await page.evaluate(()=>window.__emit({kind:'break',session:'s1',reason:'ok',frames:[{level:0,where:'total',type:'file',line:11,local:'debug.php',server:'/app/debug.php'}]}));await page.waitForTimeout(300);
 check(!/debug-bp/.test(await classesOf(11)),'Remover após atingir apaga o breakpoint');
 // Mute.
 await page.locator('#debug-mute').click();await page.waitForTimeout(250);
 check(/debug-bp-muted/.test(await classesOf(21))&&(await lastConfig())[1].length===0&&(await lastConfig())[4].length===0,'Silenciar: ícones cinza e nada enviado ao motor');
 await page.screenshot({path:out+'/11-muted.png'});
 await page.locator('#debug-mute').click();await page.waitForTimeout(250);check(/debug-bp-line/.test(await classesOf(21)),'reativar breakpoints');
 // Fim da sessão.
 await page.evaluate(()=>window.__emit({kind:'ended',session:'s1'}));await page.waitForTimeout(250);
 check(await page.locator('.debug-exec-line').count()===0&&await page.locator('.debug-inline-value').count()===0,'fim da sessão limpa linha de execução e valores inline');
 check(!/verified|invalid/.test(await classesOf(21)),'fim da sessão limpa estados verificados/inválidos');
 // Porta ocupada.
 await page.locator('#debug-listen').click();await page.waitForFunction(()=>document.querySelector('#debug-listen').getAttribute('aria-pressed')==='false');
 await page.locator('#debug-more').click();await page.locator('.debug-more-menu').getByRole('menuitem',{name:/Configurações do depurador/}).click();
 await page.locator('#debug-port').fill('9100');await page.locator('#debug-port').dispatchEvent('change');await page.locator('#debug-listen').click();await page.waitForFunction(()=>document.querySelector('#debug-console').textContent.includes('9100 já está em uso'));
 check(await page.locator('#debug-listen').getAttribute('aria-pressed')==='false','porta ocupada: erro visível e recuperável');
 check(!errors.length,'sem erros de página: '+errors.join('; '));
 console.log(ok.map(l=>'✓ '+l).join('\n'));console.log(`check-debug-ui${process.argv.includes('--webkit')?' (WebKit)':''}: ${ok.length} verificações OK · capturas em ${out}`);
} catch(error){await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});console.error(ok.map(l=>'✓ '+l).join('\n'));throw error;} finally { await browser?.close(); server.kill(); }
