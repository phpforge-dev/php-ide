import {pinnedWorkbenchFixture} from './pinned-workbench-fixture.mjs';
// Editor shell fidelity (catalog UI-BREADCRUMBS-001, UI-PROBLEMS-001, UI-CONTEXT-001, UI-KEYMAP-001) on the Islands
// fixture in WebKit (the macOS Tauri engine; --chromium for Chrome). Simulated IPC only: native behavior is
// covered by check-native. Screenshots go to .artifacts/editor-shell/ (or --out=<dir>), sized like the
// PhpStorm captures 50–59 in .artifacts/phpstorm-reference/. --no-assert only records; --dump prints results.
// Each scenario runs even when an earlier one fails, so "before" screenshots can be taken on an older build.
import assert from 'node:assert/strict';
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
const fixture=await pinnedWorkbenchFixture(["git","php-intelligence"]);
const port=Number(process.argv.find(arg=>arg.startsWith('--port='))?.slice(7)??1487);
const out=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??'.artifacts/editor-shell';
const assertOn=!process.argv.includes('--no-assert');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
const broken=`<?php

namespace Fixture;

class Broken
{
    public function total(int $a): int
    {
        $unused = 1;
        return $a + $missing
    }

    private function never(): void
    {
    }
}
`;
let browser;const results={};const failures=[];
const step=async(name,fn)=>{try{results[name]=await fn();}catch(error){failures.push(name+': '+(error?.message??error));results[name]={error:String(error?.message??error)};}};
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.once('exit',reject);});
 browser=process.argv.includes('--chromium')?await chromium.launch({headless:true,channel:'chrome'}):await webkit.launch({headless:true});
 await mkdir(out,{recursive:true});
 const user=await readFile('tests/fixtures/projects/php-intelligence/src/User.php','utf8');
 const api=`
 const files={'src/User.php':${JSON.stringify(user)},'src/Broken.php':${JSON.stringify(broken)},'README.md':'# Reference\\n\\n## Usage\\ntext\\n'};
 const tree={'':[{name:'src',path:'src',directory:true},{name:'README.md',path:'README.md',directory:false}],src:[{name:'Broken.php',path:'src/Broken.php',directory:false},{name:'User.php',path:'src/User.php',directory:false}]};
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='startupInfo')return {project:'/fixture'};
   if(method==='pluginList')return {plugins:[],directories:[]};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'reference-project'};
   if(method==='tree')return tree[args[0]??'']??[];
   if(method==='read'){const path=String(args[0]??'');return {path,uri:'file:///fixture/'+path,text:files[path]??'',etag:'preview'};}
   if(method==='gitStatus')return {branch:'main',head:'a'.repeat(40),changes:[],indexToken:'preview'};
   if(method==='gitTools')return {branches:[],remotes:[],stashes:[],head:'preview'};
   if(method==='gitEditorBase')return null;
   if(method==='phpMethodFamily'||method==='language')return null;
   return [];
  };
 }});`;
 for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width:1400,height:909},deviceScaleFactor:1});
  await page.emulateMedia({colorScheme:theme});await fixture.route(page);if(process.env.STACK)page.on('pageerror',e=>console.log(e.stack));
  await page.addInitScript(t=>{try{localStorage.clear();localStorage.setItem('php-ide-appearance',JSON.stringify({theme:t}));}catch{}},theme);
  await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`${api}
   ${fixture.bootstrap}
   await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();
   window.__monaco=await import('/node_modules/.vite/deps/monaco-editor.js');`}));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#tree summary,#tree button').first().waitFor();
  const src=page.locator('#tree summary',{hasText:'src'}).first();if(await src.count())await src.click();
  for(const name of ['README.md','src/User.php','src/Broken.php']){const b=page.locator(`#tree [data-path="${name}"]`).first();await b.click();await page.waitForTimeout(250);}
  await page.waitForTimeout(600);await page.evaluate(()=>document.fonts.ready);
  const caret=()=>page.evaluate(()=>{const p=window.__monaco.editor.getEditors()[0].getPosition();return p&&[p.lineNumber,p.column];});
  const setCaret=(line,column)=>page.evaluate(([l,c])=>{const e=window.__monaco.editor.getEditors()[0];e.setPosition({lineNumber:l,column:c});e.focus();},[line,column]);
  const markers=()=>page.evaluate(()=>{const m=window.__monaco;const model=m.editor.getModels().find(x=>x.uri.path.endsWith('/src/Broken.php'));
   m.editor.setModelMarkers(model,'shell-fixture',[
    {severity:m.MarkerSeverity.Error,message:"Undefined variable '$missing'",startLineNumber:10,startColumn:21,endLineNumber:10,endColumn:29,code:'PhpUndefinedVariableInspection'},
    {severity:m.MarkerSeverity.Error,message:'Expected: semicolon',startLineNumber:10,startColumn:29,endLineNumber:10,endColumn:30,code:'syntax'},
    {severity:m.MarkerSeverity.Warning,message:"Unused element: 'Broken'",startLineNumber:5,startColumn:7,endLineNumber:5,endColumn:13,code:'PhpUnusedElementInspection'},
    {severity:m.MarkerSeverity.Warning,message:"Unused element: 'total'",startLineNumber:7,startColumn:21,endLineNumber:7,endColumn:26,code:'PhpUnusedElementInspection'},
    {severity:m.MarkerSeverity.Warning,message:"Unused local variable 'unused'. The value of the variable is not used anywhere.",startLineNumber:9,startColumn:9,endLineNumber:9,endColumn:16,code:'PhpUnusedLocalVariableInspection'},
    {severity:m.MarkerSeverity.Warning,message:"Unused private method 'never'",startLineNumber:13,startColumn:22,endLineNumber:13,endColumn:27,code:'PhpUnusedPrivateMethodInspection'},
   ]);
   const user=m.editor.getModels().find(x=>x.uri.path.endsWith('/src/User.php'));
   m.editor.setModelMarkers(user,'shell-fixture',[{severity:m.MarkerSeverity.Error,message:'Undefined class Named',startLineNumber:5,startColumn:23,endLineNumber:5,endColumn:28}]);});

  // --- 1. Breadcrumbs -------------------------------------------------------------------------
  await step(theme+':breadcrumbs',async()=>{
   await setCaret(10,18);await page.waitForTimeout(250);
   const read=()=>page.evaluate(()=>{const bar=document.getElementById('code-breadcrumbs');const editor=document.querySelector('#editor').getBoundingClientRect();const r=bar?.getBoundingClientRect();
    return {visible:!!bar&&!bar.hidden,crumbs:[...(bar?.querySelectorAll('.crumb')??[])].map(c=>c.textContent+(c.getAttribute('aria-current')?'*':'')+(c.classList.contains('crumb-after')?'~':'')),
     belowEditor:r?Math.round(r.top-editor.bottom):null,height:r?Math.round(r.height):null,
     nav:[...document.querySelectorAll('footer #breadcrumbs .nav-crumb')].map(c=>c.textContent),navText:document.querySelector('footer #breadcrumbs')?.textContent};});
   const inMethod=await read();
   await page.screenshot({path:`${out}/breadcrumbs-${theme}.png`});
   await page.locator('#code-breadcrumbs .crumb',{hasText:'Broken'}).click();await page.waitForTimeout(150);
   const afterClick={...await read(),caret:await caret()};
   await page.locator('footer #breadcrumbs .nav-crumb',{hasText:'Broken'}).last().click();await page.waitForTimeout(150);
   const popup=await page.evaluate(()=>[...document.querySelectorAll('.nav-popup .nav-popup-row')].map(r=>r.textContent));
   await page.screenshot({path:`${out}/navbar-popup-${theme}.png`});
   await page.keyboard.press('Enter');await page.waitForTimeout(150);
   const chosen=await caret();
   await page.locator('footer #breadcrumbs .nav-crumb',{hasText:'src'}).click();await page.waitForTimeout(200);
   const directory=await page.evaluate(()=>[...document.querySelectorAll('.nav-popup .nav-popup-row')].map(r=>r.textContent));
   await page.keyboard.press('Escape');
   await setCaret(1,1);await page.waitForTimeout(200);const outside=await read();
   return {inMethod,afterClick,popup,chosen,directory,outside};
  });
  // --- 2. Problems ----------------------------------------------------------------------------
  await step(theme+':problems',async()=>{
   await markers();await setCaret(1,1);await page.waitForTimeout(300);
   await page.locator('#editor .inspection-widget .inspection-summary').click();await page.waitForTimeout(250);
   const read=()=>page.evaluate(()=>{const panel=document.getElementById('problems-panel');return {open:!!panel&&!panel.hidden,
    tabs:[...(panel?.querySelectorAll('[role=tab]')??[])].map(t=>t.textContent.trim()+(t.getAttribute('aria-selected')==='true'?'*':'')),
    rows:[...(panel?.querySelectorAll('.problem-row')??[])].map(r=>r.textContent.trim()),files:[...(panel?.querySelectorAll('.problem-file .problem-file-name')??[])].map(r=>r.textContent.trim()),
    empty:panel?.querySelector('.problems-empty:not([hidden])')?.textContent??'',pressed:document.getElementById('show-problems')?.getAttribute('aria-pressed')};});
   const file=await read();
   await page.screenshot({path:`${out}/problems-${theme}.png`});
   // Keyboard: Down to the 2nd row, Enter navigates to it.
   await page.locator('#problems-panel .problem-row').first().click();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForTimeout(150);
   const navigated={caret:await caret(),focusInEditor:await page.evaluate(()=>!!document.activeElement?.closest('.monaco-editor'))};
   await page.locator('#problems-panel [data-problems-action=options]').click();await page.waitForTimeout(100);
   const options=await page.evaluate(()=>[...document.querySelectorAll('.context-menu [role=menuitem],.context-menu [role=menuitemcheckbox],.context-menu .menu-heading')].map(b=>b.textContent.trim()+(b.getAttribute('aria-checked')==='true'?'✓':'')));
   await page.screenshot({path:`${out}/problems-options-${theme}.png`});
   await page.locator('.context-menu button',{hasText:/^Aviso$|^Warning$/}).click();await page.waitForTimeout(100);
   const withoutWarnings=(await read()).rows;
   await page.locator('#problems-panel [data-problems-action=options]').click();await page.locator('.context-menu button',{hasText:/^Aviso$|^Warning$/}).click();
   await page.locator('#problems-panel [role=tab]').nth(1).click();await page.waitForTimeout(150);
   const project=await read();
   await page.screenshot({path:`${out}/problems-project-${theme}.png`});
   await page.locator('#problems-panel [role=tab]').first().click();
   // Keyboard toggle from the editor: tool window action (Alt+6 by default) hides and shows it.
   await page.evaluate(()=>window.__monaco.editor.getEditors()[0].focus());
   const shortcut=await page.evaluate(async()=>(await import('/src/keymap.ts')).keymap.bindings('tool.problems'));
   return {file,navigated,options,withoutWarnings,project,shortcut};
  });
  // --- 3. Context menus -------------------------------------------------------------------------
  await step(theme+':menus',async()=>{
   const items=()=>page.evaluate(()=>[...document.querySelectorAll('.context-menu[data-depth="0"] > *')].map(e=>e.getAttribute('role')==='separator'?'—':e.querySelector('span')?.textContent+(e.querySelector('kbd')?.textContent?` [${e.querySelector('kbd').textContent}]`:'')+(e.disabled?' (off)':'')));
   await page.locator('#tabs .file-tab',{hasText:'Broken.php'}).click({button:'right'});await page.waitForTimeout(150);
   const tab=await items();
   await page.screenshot({path:`${out}/tab-menu-${theme}.png`});
   await page.keyboard.press('Escape');
   await page.locator('#tabs .file-tab',{hasText:'README.md'}).click({button:'right'});await page.waitForTimeout(100);
   const firstTab=await items();await page.keyboard.press('Escape');
   await setCaret(7,25);
   const line=await page.locator('#editor .view-line').nth(6).boundingBox();
   await page.mouse.click(line.x+260,line.y+10,{button:'right'});await page.waitForTimeout(200);
   const editorMenu=await items();
   const monacoMenu=await page.evaluate(()=>!!document.querySelector('.monaco-menu-container,.context-view .monaco-menu'));
   await page.screenshot({path:`${out}/editor-menu-${theme}.png`});
   // Submenu by keyboard: Go To › opens and lists the navigation actions.
   await page.locator('.context-menu[data-depth="0"] button',{hasText:/^(Ir para|Go To)›?$/}).hover();await page.waitForTimeout(100);
   const goTo=await page.evaluate(()=>[...document.querySelectorAll('.context-menu[data-depth="1"] button span')].map(s=>s.textContent));
   await page.keyboard.press('Escape');
   // Close Tabs to the Left (from Broken.php, the last tab) keeps only Broken.php.
   await page.locator('#tabs .file-tab',{hasText:'Broken.php'}).click({button:'right'});
   await page.locator('.context-menu button',{hasText:/Fechar abas à esquerda|Close Tabs to the Left/}).click();await page.waitForTimeout(150);
   const remaining=await page.evaluate(()=>[...document.querySelectorAll('#tabs .file-tab')].map(t=>t.textContent.replace('×','').trim()));
   return {tab,firstTab,editorMenu,monacoMenu,goTo,remaining};
  });
  // --- 4. Keymap: chords, conflict chooser, export/import -----------------------------------------
  await step(theme+':keymap',async()=>{
   const outcome=await page.evaluate(async()=>{
    const {keymap}=await import('/src/keymap.ts');const log=[];
    keymap.registerAction({id:'fixture.chord',label:'Fixture chord',category:'Fixture',defaults:{mac:'Meta+K Meta+C',other:'Ctrl+K Ctrl+C'},run:()=>log.push('chord')});
    keymap.registerAction({id:'fixture.one',label:'Fixture one',category:'Fixture',defaults:{mac:'Ctrl+Alt+J',other:'Ctrl+Alt+J'},run:()=>log.push('one')});
    keymap.registerAction({id:'fixture.two',label:'Fixture two',category:'Fixture',defaults:{mac:'Ctrl+Alt+J',other:'Ctrl+Alt+J'},run:()=>log.push('two')});
    window.__log=log;return {chord:keymap.shortcut('fixture.chord'),platform:keymap.platform};
   });
   await page.locator('#tree [data-path="README.md"]').focus();
   const mod=outcome.platform==='mac'?'Meta':'Control';
   await page.keyboard.press(`${mod}+KeyK`);await page.waitForTimeout(50);
   const waiting=await page.locator('#status').textContent();
   await page.keyboard.press(`${mod}+KeyC`);await page.waitForTimeout(50);
   await page.keyboard.press('Control+Alt+KeyJ');await page.waitForTimeout(150);
   const chooser=await page.evaluate(()=>[...document.querySelectorAll('.keymap-chooser [role=option]')].map(o=>o.firstChild.textContent));
   await page.screenshot({path:`${out}/keymap-chooser-${theme}.png`});
   await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForTimeout(100);
   const log=await page.evaluate(()=>window.__log.slice());
   // Export the customization, reset, import it back (JSON) and import a PhpStorm keymap XML.
   const exchange=await page.evaluate(async()=>{const m=await import('/src/keymap.ts');const k=m.keymap;
    k.setBindings('fixture.one',['Ctrl+Alt+Shift+J']);const exported=k.exportProfile();k.resetProfile();const before=k.bindings('fixture.one');
    const imported=k.importProfile(exported);const after=k.bindings('fixture.one');
    const xml='<keymap version="1" name="Mine" parent="Mac OS X 10.5+"><action id="ActivateProblemsViewToolWindow"><keyboard-shortcut first-keystroke="meta 6"/></action><action id="CloseAllEditors"><keyboard-shortcut first-keystroke="meta K" second-keystroke="meta W"/></action><action id="SomethingElse"><keyboard-shortcut first-keystroke="meta Y"/></action></keymap>';
    const report=k.importProfile(xml);
    return {exported:JSON.parse(exported).overrides,before,after,imported,report,problems:k.bindings('tool.problems'),closeAll:k.shortcut('editor.closeAllTabs')};});
   // Keymap screen: second-stroke recorder and import/export controls.
   await page.evaluate(async()=>{const {keymap}=await import('/src/keymap.ts');keymap.run('ide.keymap');});await page.waitForTimeout(200);
   await page.fill('#keymap-search','Fixture chord');await page.waitForTimeout(100);
   await page.locator('#keymap-list [data-action="fixture.chord"] [data-focus-key^="add:"]').click();
   const recorder=page.locator('#keymap-list .keymap-recorder').first();await recorder.focus();await page.keyboard.press(`${mod}+KeyL`);
   await page.locator('#keymap-list .keymap-editor input[type=checkbox]').check();
   await page.locator('#keymap-list .keymap-recorder').nth(1).focus();await page.keyboard.press(`${mod}+KeyN`);
   const preview=await page.evaluate(()=>[...document.querySelectorAll('#keymap-list .keymap-recorder')].map(r=>r.textContent));
   await page.screenshot({path:`${out}/keymap-second-stroke-${theme}.png`});
   await page.locator('#keymap-list .keymap-editor button',{hasText:/^(Salvar|Save)$/}).click();await page.waitForTimeout(100);
   const saved=await page.evaluate(async()=>(await import('/src/keymap.ts')).keymap.bindings('fixture.chord'));
   await page.locator('#keymap-gear').click();await page.waitForTimeout(100);
   const gear=await page.evaluate(()=>[...document.querySelectorAll('.context-menu button span')].map(s=>s.textContent));
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   return {outcome,waiting,chooser,log,exchange,preview,saved,gear};
  });
  await page.close();
 }
 fixture.assertClean();
 if(process.argv.includes('--dump'))console.log(JSON.stringify(results,null,1));
 if(assertOn){
  if(failures.length)throw Error('Scenario failures:\n'+failures.join('\n'));
  for(const theme of ['dark','light']){
   const b=results[theme+':breadcrumbs'];
   assert.deepEqual(b.inMethod.crumbs,['\\Fixture','Broken','total()'],'editor breadcrumbs follow the caret');
   assert.ok(b.inMethod.visible&&b.inMethod.belowEditor>=0&&b.inMethod.belowEditor<=2,'breadcrumbs bar right below the editor: '+b.inMethod.belowEditor);
   assert.deepEqual(b.inMethod.nav,['reference-project','src','Broken.php','Broken','total'],'navigation bar continues the path with code');
   assert.deepEqual(b.afterClick.caret,[5,7],'crumb click moves the caret to the class name (reference 55: 5:7)');
   assert.deepEqual(b.afterClick.crumbs,['\\Fixture','Broken*','total()~'],'clicked crumb selected, deeper crumbs kept dimmed');
   assert.deepEqual(b.popup,['never','total'],'navigation segment popup lists its children by name (reference 56)');
   assert.deepEqual(b.chosen,[13,22],'choosing a popup entry navigates');
   assert.deepEqual(b.directory,['Broken.php','User.php'],'directory segment lists its entries');
   assert.equal(b.outside.visible,false,'no breadcrumbs outside declarations');
   const p=results[theme+':problems'];
   assert.ok(p.file.open,'inspection widget counts open Problems');assert.equal(p.file.pressed,'true');
   assert.deepEqual(p.file.tabs.map(t=>t.replace(/\s+/g,' ')),['Arquivo 6*','Erros do projeto'],'File tab with count selected, Project Errors tab');
   assert.ok(p.file.files[0].startsWith('Broken.php'),'file node first');
   assert.deepEqual(p.file.rows,["Undefined variable '$missing' :10",'Expected: semicolon :10',"Unused element: 'Broken' :5","Unused element: 'total' :7","Unused local variable 'unused'. The value of the variable is not used anywhere. :9","Unused private method 'never' :13"],'grouped by severity, then line (reference 50)');
   assert.deepEqual(p.navigated,{caret:[10,29],focusInEditor:true},'Enter on a problem opens it in the editor');
   assert.deepEqual(p.options,['Mostrar','Aviso✓','Aviso fraco✓','Mostrar outros problemas✓','Ordenar por','Severidade✓','Nome','Agrupar por inspeção'],'options menu (reference 52)');
   assert.equal(p.withoutWarnings.length,2,'hiding warnings keeps the errors');
   assert.deepEqual(p.project.files.map(f=>f.split(' ')[0]),['Broken.php','User.php'],'Project Errors: errors of every open file');
   assert.equal(p.project.rows.length,3);
   assert.ok(p.shortcut.length,'tool.problems has a shortcut');
   const m=results[theme+':menus'];
   assert.equal(m.monacoMenu,false,'Monaco context menu replaced');
   assert.deepEqual(m.tab.filter(i=>i!=='—').map(i=>i.replace(/ \[.*\]/,'')),['Fechar','Fechar outras abas','Fechar todas as abas','Fechar abas à esquerda','Copiar caminho/referência…','Fixar aba','Abrir em','Histórico local','Renomear arquivo…'],'tab menu order (reference 53)');
   assert.ok(m.firstTab.some(i=>i.startsWith('Fechar abas à direita'))&&!m.firstTab.some(i=>i.startsWith('Fechar abas à esquerda')),'left/right closers only when tabs exist on that side');
   assert.deepEqual(m.editorMenu.filter(i=>i!=='—').map(i=>i.replace(/ \[.*\]/,'').replace(' (off)','')).slice(0,6),['Mostrar ações de contexto','Colar','Copiar/colar especial','Modo de seleção em coluna','Encontrar usos','Ir para'],'editor menu starts like reference 31');
   assert.ok(m.goTo.length>=3,'Go To submenu');
   assert.deepEqual(m.remaining,['Broken.php'],'Close Tabs to the Left');
   const k=results[theme+':keymap'];
   assert.match(k.waiting,/segunda tecla|second stroke/i,'first chord stroke waits for the second');
   assert.deepEqual(k.chooser,['Fixture one','Fixture two'],'conflicting enabled actions offer a chooser');
   assert.deepEqual(k.log,['chord','two'],'chord ran; chooser ran the chosen action');
   assert.deepEqual(k.exchange.after,['Ctrl+Alt+Shift+J'],'JSON export/import round trip');
   assert.deepEqual(k.exchange.problems,['Meta+6'],'PhpStorm XML import maps known actions');
   assert.ok(k.exchange.report.skipped.includes('SomethingElse'),'unknown PhpStorm actions are reported');
   assert.equal(k.saved.length,2,'recorded chord saved: '+k.saved);
   assert.ok(k.saved.some(s=>s.includes(' ')),'second stroke stored');
   assert.ok(k.gear.some(g=>/Exportar|Export/.test(g))&&k.gear.some(g=>/Importar|Import/.test(g)),'gear menu offers export/import');
  }
 }
 console.log(`Editor shell: ${out}/*.png${failures.length?` (${failures.length} scenario failures)`:''}`);
} finally {await browser?.close();server.kill();}
