// Composer e Symfony no editor real (Monaco + WebKit, o WebView do Tauri no macOS): os bundles
// publicados dos plugins rodam no sandbox de verdade (Web Worker) e a janela Composer usa a API
// nativa simulada com saídas reais do Composer. Projeto: fixture do plugin-symfony (só leitura;
// gravações ficam registradas na página). COMPOSER_PLUGIN_DIR / SYMFONY_PLUGIN_DIR apontam para
// builds locais antes do pin; padrão: ~/Projects/plugin-composer e ~/Projects/plugin-symfony.
import assert from 'node:assert/strict';
import {readFile, readdir, stat, mkdir} from 'node:fs/promises';
import {resolve, join, relative} from 'node:path';
import {homedir} from 'node:os';
import {createServer} from 'vite';
import {webkit} from '@playwright/test';

const composerDir=resolve(process.env.COMPOSER_PLUGIN_DIR??join(homedir(),'Projects/plugin-composer'));
const symfonyDir=resolve(process.env.SYMFONY_PLUGIN_DIR??join(homedir(),'Projects/plugin-symfony'));
const fixture=join(symfonyDir,'tests/fixtures/projects/symfony');
const load=async(dir,file)=>readFile(join(dir,file),'utf8');
const manifests={composer:JSON.parse(await load(composerDir,'plugin.json')),symfony:JSON.parse(await load(symfonyDir,'plugin.json'))};
const bundles={composerMain:await load(composerDir,'main.js'),symfonyMain:await load(symfonyDir,'main.js'),composerWorkbench:await load(composerDir,'workbench.js'),composerCss:await load(composerDir,'workbench.css')};
const audit=JSON.parse(await load(composerDir,'native/fixtures/audit.json'));
const shell=(await readFile('src/main.ts','utf8')).match(/innerHTML = html`([^`]+)`/)[1];
const walk=async dir=>{const out=[];for(const name of await readdir(join(fixture,dir)).catch(()=>[])){const p=dir?`${dir}/${name}`:name;(await stat(join(fixture,p))).isDirectory()?out.push(...await walk(p)):out.push(p);}return out;};
const inside=p=>{const full=resolve(fixture,p);return relative(fixture,full).startsWith('..')?null:full;};

const bootstrap=`
 import * as monaco from 'monaco-editor';
 import {installEditorWorkers} from '/src/editor-workers.ts';
 import {mountWorkbench} from '/src/workbench.ts';
 import {mountPluginLanguages} from '/src/plugin-languages.ts';
 import {keymap} from '/src/keymap.ts';
 import {t as tr,msg,html} from '/src/i18n.ts';
 import {dockWindow,resizeToolWindow,toolIcon} from '/src/tool-window.ts';
 import {PluginHost,setExternalPlugins} from '/shared/language/plugins/host.ts';
 import {SandboxedPlugin,WORKER_SOURCE} from '/shared/language/plugins/sandbox.ts';
 import '/src/themes.css';import '/src/style.css';import '/src/workbench.css';import '/src/theme-surfaces.css';import '/src/tool-windows.css';
 const data=${JSON.stringify({fixture,manifests,bundles,audit})};
 installEditorWorkers();
 document.documentElement.dataset.theme='dark';
 document.body.innerHTML='<div id="app"></div>';document.getElementById('app').innerHTML=${JSON.stringify(shell)};
 const style=document.createElement('style');style.textContent=data.bundles.composerCss;document.head.append(style);
 mountWorkbench({gitStatus:async()=>({branch:'main'})});
 const root=data.fixture;const rootUri='file://'+root+'/';
 const get=async(kind,p)=>{const r=await fetch('/__fx/'+kind+'?p='+encodeURIComponent(p));return r.ok?r.json():null;};
 const files={root,read:async p=>(await get('read',p))?.text??null,exists:async p=>!!(await get('exists',p))?.ok,list:async(dir,accept)=>((await get('list',dir))?.files??[]).filter(p=>accept(p.split('/').pop())),uri:p=>rootUri+p};
 window.saved=[];window.calls=[];window.statuses=[];
 const services={files,write:async()=>null,exec:async()=>'',fetch:async()=>({status:0,body:''})};
 const channel=()=>{const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));const worker=new Worker(url);return {post:m=>worker.postMessage(m),listen:(receive,fail)=>{worker.onmessage=e=>receive(e.data);worker.onerror=e=>{e.preventDefault();fail(e.message)}},terminate:()=>worker.terminate()};};
 const sandbox=(name,code)=>new SandboxedPlugin('user:'+data.manifests[name].id,data.manifests[name],code,['project.read'],services,channel,{rootUri});
 const plugins=[sandbox('composer',data.bundles.composerMain),sandbox('symfony',data.bundles.symfonyMain)];
 setExternalPlugins(()=>plugins);
 const plugin=new PluginHost(files,[]);
 const offset=(text,p)=>text.split('\\n').slice(0,p.line).reduce((n,l)=>n+l.length+1,0)+p.character;
 const api={
  workspace:async()=>({root,name:'symfony'}),
  read:async path=>{const rel=path.startsWith(root+'/')?path.slice(root.length+1):path;const text=await files.read(rel);if(text===null)throw Error('missing '+rel);return {path:rel,uri:rootUri+rel,text,etag:'e1'};},
  save:async(path,text,etag)=>{window.saved.push({path,text,etag});return 'e2';},
  language:async input=>{const o=offset(input.text,input.position);
   if(input.method==='textDocument/completion')return await plugin.completeCode(input.path,input.text,o)??{isIncomplete:false,items:[]};
   if(input.method==='textDocument/definition')return await plugin.defineCode(input.path,input.text,o)??[];
   if(input.method==='textDocument/diagnostic')return plugin.diagnose(input.path,input.text);
   if(input.method==='textDocument/codeLens')return plugin.codeLenses(input.path,input.text);
   return null;},
  onComposerProgress:()=>()=>{},
  composerCheck:async(kind)=>{window.calls.push('check:'+kind);
   if(kind==='updates')return {kind,command:'composer update --dry-run',exitCode:0,result:[{name:'symfony/console',from:'v7.1.3',to:'v7.1.9',downgrade:false}]};
   if(kind==='audit')return {kind,command:'composer audit',exitCode:1,result:{advisories:data.audit.advisories['guzzlehttp/guzzle'].map(a=>({name:'symfony/console',id:a.advisoryId,title:a.title,cve:a.cve,link:a.link,affected:a.affectedVersions,severity:a.severity})),abandoned:[]}};
   return {kind,command:'composer outdated',exitCode:0,result:[]};},
  composerRun:async(id,runner,request)=>{window.calls.push('run:'+[request.action,...(request.packages??[]),request.script??'',request.lock?'--lock':''].filter(Boolean).join(' '));return {command:'composer '+request.action,exitCode:0,cancelled:false,timedOut:false,durationMs:5,output:'ok\\n'};},
  composerCancel:async()=>{},composerProbe:async()=>({version:'Composer version 2.11.1'}),composerSearch:async()=>[],composerVersions:async()=>[],
 };
 const editor=monaco.editor.create(document.getElementById('editor'),{automaticLayout:true,theme:'vs-dark',glyphMargin:true,lightbulb:{enabled:'on'}});
 window.monaco=monaco;window.editor=editor;
 const paths=new Map();
 mountPluginLanguages(api,{status:s=>window.statuses.push(s),path:m=>paths.get(m.uri.toString())});
 const {activate}=await import('/__composer-workbench.js');
 window.composer=activate({monaco,listen:async()=>()=>{},tr,msg,html,keymap,dockWindow,resizeToolWindow,toolIcon,own:v=>v,api,host:{editor,status:s=>window.statuses.push(s),open:async()=>{},changed(){}}});
 window.openFile=async(rel,language)=>{const uri=monaco.Uri.parse(rootUri+rel);paths.set(uri.toString(),rel);const model=monaco.editor.getModel(uri)??monaco.editor.createModel(await files.read(rel),language,uri);editor.setModel(model);editor.focus();return true;};
 window.ready=true;
`;
const harness={name:'composer-symfony-harness',
 resolveId:id=>({'/__harness.js':'\0harness','/__composer-workbench.js':'\0composer-workbench'})[id],
 load:id=>({'\0harness':bootstrap,'\0composer-workbench':bundles.composerWorkbench})[id],
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
  const url=new URL(req.url,'http://x');
  if(url.pathname==='/__harness.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/__harness.js"></script></body></html>');}
  if(!url.pathname.startsWith('/__fx/'))return next();
  const p=url.searchParams.get('p')??'';const full=inside(p);res.setHeader('Content-Type','application/json');
  if(!full)return res.end(JSON.stringify(null));
  if(url.pathname==='/__fx/read')return res.end(JSON.stringify(await readFile(full,'utf8').then(text=>({text}),()=>null)));
  if(url.pathname==='/__fx/exists')return res.end(JSON.stringify({ok:await stat(full).then(()=>true,()=>false)}));
  if(url.pathname==='/__fx/list')return res.end(JSON.stringify({files:await walk(p)}));
  next();
 });}};
const server=await createServer({plugins:[harness],server:{host:'127.0.0.1',port:1446,strictPort:true,fs:{allow:[resolve('.'),resolve('../../../node_modules'),resolve('../../..'),composerDir,symfonyDir]}}});
await server.listen();
if(process.argv.includes('--serve')){console.log('Harness: http://127.0.0.1:1446/__harness.html');await new Promise(()=>{});}
await mkdir('.artifacts',{recursive:true});
let browser;
try{
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('http://127.0.0.1:1446/__harness.html');await page.waitForFunction(()=>window.ready,null,{timeout:60000});
 const mac=process.platform==='darwin';
 const quickFixes=async()=>{await page.keyboard.press('Alt+Enter');await page.waitForSelector('.action-widget .action-list-item, .action-widget [role=option]',{timeout:10000});return page.$$eval('.action-widget [role=option]',items=>items.map(i=>i.textContent.trim()));};
 const caret=async(marker,delta=1)=>page.evaluate(([marker,delta])=>{const m=editor.getModel();const i=m.getValue().indexOf(marker);if(i<0)throw Error('marker '+marker);editor.setPosition(m.getPositionAt(i+delta));editor.focus();},[marker,delta]);
 const markers=owner=>page.evaluate(owner=>monaco.editor.getModelMarkers({resource:editor.getModel().uri,...(owner?{owner}:{})}).map(m=>[m.owner,String(typeof m.code==='object'?m.code.value:m.code),m.startLineNumber,m.message.split('\n')[0]]),owner);

 // ── Composer: gutter de atualização, audit e ⌥Enter no composer.json ─────────────────────────
 await page.evaluate(()=>openFile('composer.json','json'));
 await page.waitForFunction(()=>window.calls.includes('check:updates')&&window.calls.includes('check:audit'),null,{timeout:15000});
 await page.waitForSelector('.composer-update-glyph',{timeout:10000});
 const glyphLine=await page.evaluate(()=>editor.getModel().getAllDecorations().find(d=>d.options.glyphMarginClassName==='composer-update-glyph')?.range.startLineNumber);
 assert.equal(glyphLine,await page.evaluate(()=>editor.getModel().getValue().split('\n').findIndex(l=>l.includes('"symfony/console"'))+1),'update icon on the symfony/console line');
 await page.waitForFunction(()=>monaco.editor.getModelMarkers({owner:'composer-audit'}).length>0);
 assert.deepEqual((await markers('composer-audit')).map(m=>[m[1],m[3]]),[['composer.vulnerable','symfony/console tem 2 aviso(s) de segurança na versão travada (composer audit):']]);
 await page.waitForFunction(()=>monaco.editor.getModelMarkers({owner:'php-ide-plugins',resource:editor.getModel().uri}).length>0,null,{timeout:15000});
 const languageMarkers=(await markers('php-ide-plugins')).map(m=>m[1].split('/').pop());
 assert.ok(languageMarkers.includes('composer.lock-outdated')&&languageMarkers.includes('composer.package-not-locked'),'language plugin diagnostics: '+languageMarkers);
 // Clique no ícone do gutter atualiza o pacote, como o botão "Update Package".
 await page.locator('.composer-update-glyph').first().click();
 await page.waitForFunction(()=>window.calls.includes('run:update symfony/console'));
 // ⌥Enter no pacote vulnerável/desatualizado.
 await caret('"symfony/console"',3);
 let fixes=await quickFixes();
 assert.ok(fixes.some(f=>f.startsWith('Atualizar symfony/console para v7.1.9 (corrige avisos de segurança)')),'fixes: '+fixes);
 assert.ok(fixes.some(f=>f.startsWith('Mostrar por que symfony/console')),'why intention');
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.calls.filter(c=>c==='run:update symfony/console').length===2);
 await page.screenshot({path:'.artifacts/composer-json-insights.png'});
 // Pacote fora do lock e script.
 await caret('"twig/twig"',3);fixes=await quickFixes();
 assert.ok(fixes.includes('Instalar twig/twig'),'not locked: '+fixes);
 await page.keyboard.press('Escape');
 await caret('"lint"',2);fixes=await quickFixes();
 assert.ok(fixes.includes("Executar 'lint'"),'script: '+fixes);
 await page.keyboard.press('Enter');await page.waitForFunction(()=>window.calls.includes('run:run-script lint'));
 // Janela Composer: selos da consulta automática.
 if(await page.locator('#composer-panel').evaluate(p=>p.hidden))await page.locator('#show-composer').click();
 await page.waitForSelector('.composer-row .composer-badge[data-kind=vulnerable]');
 assert.equal(await page.locator('.composer-row',{hasText:'symfony/console'}).locator('.composer-badge[data-kind=update]').textContent(),'↑ v7.1.9');
 await page.screenshot({path:'.artifacts/composer-window.png'});
 await page.locator('#composer-hide').click();

 // ── Symfony: traduções no Twig com correção que cria a chave, @Bundle e rotas ─────────────────
 await page.evaluate(()=>openFile('templates/admin/dashboard.html.twig','twig'));
 await page.waitForFunction(()=>monaco.editor.getModelMarkers({owner:'php-ide-plugins',resource:editor.getModel().uri}).length>0,null,{timeout:15000});
 assert.deepEqual((await markers('php-ide-plugins')).map(m=>[m[1].split('/').pop(),m[3]]),[['symfony.translation.missing',"Chave de tradução 'nope.missing' não existe no domínio 'messages'."]]);
 await caret("'nope.missing'",3);fixes=await quickFixes();
 assert.deepEqual(fixes.filter(f=>f.startsWith('Criar')),["Criar a chave 'nope.missing' em translations/messages.en.yaml"]);
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.saved.length===1);
 const saved=await page.evaluate(()=>window.saved[0]);
 assert.ok(saved.path.endsWith('/translations/messages.en.yaml'),saved.path);assert.ok(saved.text.endsWith("'nope.missing': 'nope.missing'\n"));assert.equal(saved.etag,'e1');
 assert.ok((await page.evaluate(()=>window.statuses)).some(s=>/Correção aplicada/.test(s)));
 // Completion de chaves com o valor do locale padrão.
 await caret("'menu.users'",6);await page.keyboard.press(mac?'Control+Space':'Control+Space');
 await page.waitForSelector('.suggest-widget.visible .monaco-list-row',{timeout:10000});
 const suggestions=await page.$$eval('.suggest-widget.visible .monaco-list-row',rows=>rows.map(r=>r.getAttribute('aria-label')??r.textContent));
 assert.ok(suggestions.some(s=>s.includes('menu.users')),'suggest: '+suggestions);
 await page.screenshot({path:'.artifacts/symfony-twig-translations.png'});
 await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);
 console.log('WebKit: Composer gutter/audit/⌥Enter/window and Symfony Twig translations, quick fix and completion passed with the published plugin bundles in the real sandbox.');
}finally{await browser?.close();await server.close();}
