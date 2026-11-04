import {pinnedWorkbenchFixture} from './pinned-workbench-fixture.mjs';
// Editor shell, second round (catalog UI-BREADCRUMBS-001, UI-PROBLEMS-001, UI-CONTEXT-001, UI-KEYMAP-001): breadcrumbs
// for HTML/JS/TS/YAML/JSON and their placement setting, Project Errors with Inspect Code and code preview, the tab and
// editor menu items added in this round (Split, Bookmarks, Compare with Clipboard, Generate…, Run/Debug from plugins,
// Configure Editor Tabs) and named/duplicated keymaps. WebKit (the macOS Tauri engine; --chromium for Chrome) with
// simulated IPC only. Screenshots go to .artifacts/editor-shell-2/ (or --out=<dir>); --no-assert only records
// (used for the "before" captures on the base commit), --dump prints the results.
import assert from 'node:assert/strict';
import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const fixture=await pinnedWorkbenchFixture(["git","php-intelligence"]);
const port=Number(process.argv.find(arg=>arg.startsWith('--port='))?.slice(7)??1488);
const out=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??'.artifacts/editor-shell-2';
const lang=process.argv.find(arg=>arg.startsWith('--lang='))?.slice(7);
const assertOn=!process.argv.includes('--no-assert')&&!lang;
const themes=process.argv.includes('--dark-only')?['dark']:['dark','light'];
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
const files={
 'src/Broken.php':`<?php

namespace Fixture;

class Broken
{
    public function total(int $a): int
    {
        return $a;
    }
}
`,
 'src/Other.php':`<?php

namespace Fixture;

final class Other
{
    public function run(): void
    {
        echo $nope;
    }
}
`,
 'src/app.js':`import { api } from './api';

export class Cart {
  constructor(items) {
    this.items = items;
  }

  total() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
}

export function checkout(cart) {
  return api.post('/checkout', cart);
}
`,
 'src/types.ts':`export interface Item {
  price: number;
}

export namespace Shop {
  export function format(item: Item): string {
    return '$' + item.price;
  }
}
`,
 'composer.json':`{
    "name": "fixture/shop",
    "autoload": {
        "psr-4": {
            "Fixture\\\\": "src/"
        }
    },
    "scripts": {
        "test": "phpunit"
    }
}
`,
 'config/services.yaml':`services:
    _defaults:
        autowire: true
    App\\Mailer:
        arguments:
            - '%mailer.dsn%'
`,
 'public/index.html':`<!doctype html>
<html>
<head>
  <title>Shop</title>
</head>
<body>
  <main id="app" class="page">
    <ul class="items">
      <li>First</li>
    </ul>
  </main>
</body>
</html>
`,
};
const tree={'':['config','public','src','composer.json'],config:['config/services.yaml'],public:['public/index.html'],src:['src/Broken.php','src/Other.php','src/app.js','src/types.ts']};
let browser;const results={};const failures=[];
const brief=error=>{const lines=String(error?.message??error).split('\n');return [lines[0],...lines.slice(1).filter(l=>l.trim().startsWith('-')).slice(-3).map(l=>l.trim())].join(' — ');};
const step=async(name,fn)=>{try{results[name]=await fn();}catch(error){failures.push(name+': '+brief(error));results[name]={error:brief(error)};}};
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.once('exit',reject);});
 browser=process.argv.includes('--chromium')?await chromium.launch({headless:true,channel:'chrome'}):await webkit.launch({headless:true});
 await mkdir(out,{recursive:true});
 const api=`
 const files=${JSON.stringify(files)};const tree=${JSON.stringify(tree)};
 window.__languageCalls=[];
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='startupInfo')return {project:'/fixture'};
   if(method==='pluginList')return {plugins:[],directories:[]};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'reference-project'};
   if(method==='tree')return (tree[args[0]??'']??[]).map(p=>({name:p.split('/').pop(),path:p,directory:!!tree[p]}));
   if(method==='listFiles')return Object.keys(files);
   if(method==='read'){const path=String(args[0]??'');return {path,uri:'file:///fixture/'+path,text:files[path]??'',etag:'preview'};}
   if(method==='gitStatus')return {branch:'main',head:'a'.repeat(40),changes:[],indexToken:'preview'};
   if(method==='gitTools')return {branches:[],remotes:[],stashes:[],head:'preview'};
   if(method==='gitEditorBase')return null;
   if(method==='language'){const input=args[0]??{};window.__languageCalls.push(input.method+' '+input.path);
    // Inspect Code: the PHP server reports an undefined variable in src/Other.php; the host diagnostics a YAML error.
    if(input.method==='php/diagnostics')return {current:true,diagnostics:input.path==='src/Other.php'?[{range:{start:{line:8,character:13},end:{line:8,character:18}},message:"Undefined variable '$nope'",severity:1,code:'worse.undefined_variable'}]:[]};
    if(input.method==='textDocument/diagnostic')return input.path==='config/services.yaml'?[{range:{start:{line:3,character:4},end:{line:3,character:14}},message:'Unknown service class App\\\\Mailer',severity:'error',code:'symfony.service'}]:[];
    return null;}
   if(method==='phpMethodFamily')return null;
   return [];
  };
 }});`;
 for(const theme of themes){
  const page=await browser.newPage({viewport:{width:1400,height:909},deviceScaleFactor:1});page.setDefaultTimeout(8000);
  await page.emulateMedia({colorScheme:theme});await fixture.route(page);if(process.env.STACK)page.on('pageerror',e=>console.log(e.stack));
  await page.addInitScript(([t,l])=>{try{localStorage.clear();localStorage.setItem('php-ide-appearance',JSON.stringify({theme:t}));if(l)localStorage.setItem('php-ide-language',l);}catch{}
   // The clipboard is stubbed: WebKit's headless clipboard needs a user gesture permission.
   let clip='const answer = 41;\n';try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>clip,writeText:async v=>{clip=v;},write:async()=>{},read:async()=>[]}});}catch{}},[theme,lang]);
  await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`${api}
   ${fixture.bootstrap}
   await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();
   window.__monaco=await import('/node_modules/.vite/deps/monaco-editor.js');`}));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#tree summary,#tree button').first().waitFor({timeout:20000});
  for(const dir of ['src','config','public']){const s=page.locator('#tree summary',{hasText:dir}).first();if(await s.count())await s.click();await page.waitForTimeout(120);}
  const openFile=async name=>{await page.locator(`#tree [data-path="${name}"]`).first().click();await page.waitForTimeout(300);};
  await page.evaluate(()=>document.fonts.ready);
  const setCaret=(line,column)=>page.evaluate(([l,c])=>{const e=window.__monaco.editor.getEditors()[0];e.setPosition({lineNumber:l,column:c});e.focus();},[line,column]);
  const caret=()=>page.evaluate(()=>{const p=window.__monaco.editor.getEditors()[0].getPosition();return p&&[p.lineNumber,p.column];});
  const crumbs=()=>page.evaluate(()=>{const bar=document.getElementById('code-breadcrumbs');return bar&&!bar.hidden?[...bar.querySelectorAll('.crumb')].map(c=>c.textContent):[];});
  const keymapRun=id=>page.evaluate(async id=>(await import('/src/keymap.ts')).keymap.run(id),id);
  const menuItems=()=>page.evaluate(()=>[...document.querySelectorAll('.context-menu[data-depth="0"] > *')].map(e=>e.getAttribute('role')==='separator'?'—':e.classList.contains('menu-heading')?'#'+e.textContent:e.querySelector('span')?.textContent+(e.disabled?' (off)':'')));
  const subItems=()=>page.evaluate(()=>[...document.querySelectorAll('.context-menu[data-depth="1"] button span')].map(s=>s.textContent));

  // --- 1. Breadcrumbs in HTML/JS/TS/YAML/JSON and the placement setting ------------------------------
  await step(theme+':breadcrumbs',async()=>{
   const out_={};
   await openFile('src/app.js');await setCaret(9,12);await page.waitForTimeout(200);out_.js=await crumbs();
   await page.screenshot({path:`${out}/breadcrumbs-js-${theme}.png`});
   await openFile('src/types.ts');await setCaret(7,10);await page.waitForTimeout(200);out_.ts=await crumbs();
   await openFile('composer.json');await setCaret(5,14);await page.waitForTimeout(200);out_.json=await crumbs();
   await page.screenshot({path:`${out}/breadcrumbs-json-${theme}.png`});
   await openFile('config/services.yaml');await setCaret(6,14);await page.waitForTimeout(200);out_.yaml=await crumbs();
   await page.screenshot({path:`${out}/breadcrumbs-yaml-${theme}.png`});
   await openFile('public/index.html');await setCaret(9,12);await page.waitForTimeout(200);out_.html=await crumbs();
   await page.screenshot({path:`${out}/breadcrumbs-html-${theme}.png`});
   // Settings › Editor › General › Breadcrumbs: placement Top, then hidden, then hidden for one language only.
   const position=()=>page.evaluate(()=>{const bar=document.getElementById('code-breadcrumbs');const e=document.querySelector('#editor').getBoundingClientRect();const r=bar?.getBoundingClientRect();return bar&&!bar.hidden?(r.bottom<=e.top+2?'top':r.top>=e.bottom-2?'bottom':'other'):'hidden';});
   out_.initial=await position();
   await keymapRun('ide.editorSettings');await page.waitForTimeout(200);
   await page.screenshot({path:`${out}/editor-settings-breadcrumbs-${theme}.png`});
   out_.settings=await page.evaluate(()=>[...document.querySelectorAll('#editor-settings-dialog label')].map(l=>l.textContent.trim()));
   await page.locator('#editor-settings-dialog input[name=breadcrumbs-placement][value=top]').check();await page.waitForTimeout(150);out_.top=await position();
   await page.screenshot({path:`${out}/breadcrumbs-top-${theme}.png`});
   await page.locator('#editor-settings-dialog input[data-breadcrumbs-language=html]').uncheck();await page.waitForTimeout(150);out_.htmlOff=await position();
   await page.locator('#editor-settings-dialog input[data-breadcrumbs-language=html]').check();
   await page.locator('#editor-settings-dialog input#breadcrumbs-show').uncheck();await page.waitForTimeout(150);out_.hidden=await position();
   await page.locator('#editor-settings-dialog input#breadcrumbs-show').check();
   await page.locator('#editor-settings-dialog input[name=breadcrumbs-placement][value=bottom]').check();await page.waitForTimeout(150);out_.bottom=await position();
   await page.keyboard.press('Escape');await page.waitForTimeout(100);
   out_.persisted=await page.evaluate(()=>localStorage.getItem('php-ide-editor-settings'));
   return out_;
  });
  // --- 2. Problems: Project Errors runs Inspect Code over the project, with a code preview --------------
  await step(theme+':problems',async()=>{
   await openFile('src/Broken.php');await keymapRun('editor.closeOtherTabs');await page.waitForTimeout(200);
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('ide-show-problems',{detail:{tab:'project'}})));await page.waitForTimeout(250);
   const read=()=>page.evaluate(()=>{const panel=document.getElementById('problems-panel');return {open:!!panel&&!panel.hidden,
    tabs:[...(panel?.querySelectorAll('[role=tab]')??[])].map(t=>t.textContent.trim()+(t.getAttribute('aria-selected')==='true'?'*':'')),
    files:[...(panel?.querySelectorAll('.problem-file .problem-file-name')??[])].map(r=>r.textContent.trim()),
    rows:[...(panel?.querySelectorAll('.problem-row')??[])].map(r=>r.textContent.trim()),
    empty:panel?.querySelector('.problems-empty:not([hidden])')?.textContent?.trim()??'',
    tools:[...(panel?.querySelectorAll('.problems-toolbar button:not([hidden])')??[])].map(b=>b.dataset.problemsAction),
    progress:panel?.querySelector('.problems-progress:not([hidden])')?.textContent??''};});
   const empty=await read();
   await page.screenshot({path:`${out}/problems-project-empty-${theme}.png`});
   await page.locator('#problems-panel .problems-empty button,#problems-panel .problems-empty a',{hasText:/Inspecionar código|Inspect Code/}).click();
   await page.waitForFunction(()=>!document.querySelector('#problems-panel .problems-progress:not([hidden])')&&document.querySelectorAll('#problems-panel .problem-row').length>0,null,{timeout:15000});
   const inspected=await read();
   const calls=await page.evaluate(()=>window.__languageCalls.filter(c=>/Other\.php|services\.yaml/.test(c)));
   const models=await page.evaluate(()=>window.__monaco.editor.getModels().map(m=>m.uri.path).filter(p=>/Other\.php|services\.yaml|index\.html/.test(p)));
   // Preview: toolbar toggle shows the code of the selected problem (line highlighted).
   await page.locator('#problems-panel [data-problems-action=preview]').click();await page.waitForTimeout(150);
   await page.locator('#problems-panel .problem-row',{hasText:'$nope'}).click();await page.waitForTimeout(300);
   const preview=await page.evaluate(()=>{const box=document.querySelector('#problems-panel .problems-preview:not([hidden])');const ed=window.__monaco.editor.getEditors().find(e=>box?.contains(e.getContainerDomNode()));
    return {visible:!!box,title:box?.querySelector('.problems-preview-title')?.textContent??'',line:ed?.getModel()?.getLineContent(ed.getPosition()?.lineNumber??1)?.trim(),readOnly:ed?.getOption(window.__monaco.editor.EditorOption.readOnly)};});
   await page.screenshot({path:`${out}/problems-project-inspected-${theme}.png`});
   await page.locator('#problems-panel .problem-row',{hasText:'$nope'}).dblclick();await page.waitForTimeout(400);
   const opened={tab:await page.locator('#tabs .active').getAttribute('title'),caret:await caret()};
   await page.locator('#problems-panel [data-problems-action=preview]').click();
   await page.evaluate(()=>{document.getElementById('problems-panel').hidden=true;document.getElementById('show-problems')?.setAttribute('aria-pressed','false');});
   return {empty,inspected,calls,models,preview,opened};
  });
  // --- 3. Menus: Split, Bookmarks, Configure Editor Tabs, Run/Debug, Generate…, Compare with Clipboard ---
  await step(theme+':menus',async()=>{
   // A plugin-like run action (same registry the PHP Tests plugin uses: category Executar, editor context).
   await page.evaluate(async()=>{const {keymap}=await import('/src/keymap.ts');window.__ran=[];
    keymap.registerAction({id:'fixture.runContext',label:"Executar o teste sob o cursor",category:'Executar',context:'editor',defaults:{},run:()=>window.__ran.push('run')});
    keymap.registerAction({id:'fixture.runWithCoverage',label:'Executar com cobertura',category:'Executar',context:'editor',defaults:{},run:()=>window.__ran.push('coverage')});
    const {providePluginService}=await import('/src/plugin-services.ts');
    providePluginService('fixture','generate.fixture',{generateItems:ctx=>ctx.language==='php'?[{label:'Construtor',run:()=>window.__ran.push('constructor')},{label:'Getters',run:()=>window.__ran.push('getters')}]:[]});});
   await openFile('src/Broken.php');await setCaret(7,10);
   await page.locator('#tabs .file-tab',{hasText:'Broken.php'}).click({button:'right'});await page.waitForTimeout(150);
   const tab=await menuItems();
   await page.screenshot({path:`${out}/tab-menu-${theme}.png`});
   const bookmarksSub=await (async()=>{const b=page.locator('.context-menu[data-depth="0"] button',{hasText:/^(Marcadores|Bookmarks)/});if(!await b.count())return [];await b.hover();await page.waitForTimeout(120);return subItems();})();
   await page.keyboard.press('Escape');
   // Split Right: a second editor on the same document; edits are shared; Unsplit closes it.
   await page.locator('#tabs .file-tab',{hasText:'Broken.php'}).click({button:'right'});
   await page.locator('.context-menu button',{hasText:/^(Dividir à direita|Split Right)/}).click();await page.waitForTimeout(300);
   const split=await page.evaluate(()=>{const eds=window.__monaco.editor.getEditors().filter(e=>e.getContainerDomNode().closest('.editor-tab-split'));const main=document.querySelector('#editor').getBoundingClientRect();const pane=document.querySelector('.editor-split-pane')?.getBoundingClientRect();
    return {editors:eds.length,sameModel:eds.length===2&&eds[0].getModel()===eds[1].getModel(),side:pane?(pane.left>=main.right-2?'right':pane.top>=main.bottom-2?'down':'other'):'none',title:document.querySelector('.editor-split-pane .split-tab')?.textContent?.replace('×','').trim()};});
   await page.screenshot({path:`${out}/split-right-${theme}.png`});
   await page.locator('#tabs .file-tab',{hasText:'Broken.php'}).click({button:'right'});
   const tabWhileSplit=await menuItems();
   await page.locator('.context-menu button',{hasText:/^(Desfazer divisão|Unsplit)/}).click();await page.waitForTimeout(200);
   const unsplit=await page.evaluate(()=>document.querySelectorAll('.editor-split-pane').length);
   // Bookmarks: F3 toggles, ⌥F3 assigns a mnemonic, ⌘F3 lists them, ^1 jumps.
   await setCaret(7,10);await page.keyboard.press('F3');await page.waitForTimeout(100);
   const glyphs=await page.evaluate(()=>document.querySelectorAll('#editor .bookmark-glyph').length);
   await setCaret(9,9);await page.keyboard.press('Alt+F3');await page.waitForTimeout(150);
   await page.screenshot({path:`${out}/bookmark-mnemonic-${theme}.png`});
   const mnemonicPopup=await page.evaluate(()=>!!document.querySelector('.bookmark-mnemonic'));
   await page.keyboard.press('Digit1');await page.waitForTimeout(100);
   const mod=await page.evaluate(()=>/Mac/.test(navigator.platform)?'Meta':'Control');
   await page.keyboard.press(mod==='Meta'?'Meta+F3':'Shift+F11');await page.waitForTimeout(150);
   const list=await page.evaluate(()=>[...document.querySelectorAll('.bookmarks-popup [role=option]')].map(o=>o.textContent.trim()));
   await page.screenshot({path:`${out}/bookmarks-list-${theme}.png`});
   await page.keyboard.press('Escape');
   await setCaret(1,1);await page.keyboard.press('Control+Digit1');await page.waitForTimeout(150);const jumped=await caret();
   // Editor menu: Generate…, Run/Debug from plugins, Compare with Clipboard.
   await setCaret(7,10);
   const line=await page.locator('#editor .view-line').nth(6).boundingBox();
   await page.mouse.click(line.x+300,line.y+10,{button:'right'});await page.waitForTimeout(200);
   const editorMenu=await menuItems();
   await page.screenshot({path:`${out}/editor-menu-${theme}.png`});
   const runSub=await (async()=>{const b=page.locator('.context-menu[data-depth="0"] button',{hasText:/^(Executar|Run)›?$/});if(!await b.count())return [];await b.hover();await page.waitForTimeout(120);return subItems();})();
   await page.keyboard.press('Escape');
   await setCaret(7,10);await page.keyboard.press(mod==='Meta'?'Meta+KeyN':'Alt+Insert');await page.waitForTimeout(250);
   const generate=await menuItems();
   await page.screenshot({path:`${out}/generate-${theme}.png`});
   if(generate.length)await page.locator('.context-menu button',{hasText:'Getters'}).click();await page.waitForTimeout(100);
   await page.mouse.click(line.x+300,line.y+10,{button:'right'});await page.waitForTimeout(150);
   await page.locator('.context-menu button',{hasText:/^(Comparar com a área de transferência|Compare with Clipboard)/}).click();await page.waitForTimeout(600);
   const compare=await page.evaluate(()=>{const box=document.querySelector('.compare-clipboard');const diff=window.__monaco.editor.getDiffEditors?.().find(d=>box?.contains(d.getContainerDomNode()));
    return {open:!!box,title:box?.querySelector('.compare-clipboard-title')?.textContent??'',left:diff?.getOriginalEditor().getModel()?.getValue(),rightLines:diff?.getModifiedEditor().getModel()?.getLineCount()};});
   await page.screenshot({path:`${out}/compare-clipboard-${theme}.png`});
   await page.keyboard.press('Escape');await page.waitForTimeout(150);
   const compareClosed=await page.evaluate(()=>!document.querySelector('.compare-clipboard'));
   const ran=await page.evaluate(()=>window.__ran.slice());
   // Configure Editor Tabs… opens the editor settings on the tabs section; hiding file icons applies at once.
   await page.locator('#tabs .file-tab',{hasText:'Broken.php'}).click({button:'right'});
   await page.locator('.context-menu button',{hasText:/^(Configurar abas do editor|Configure Editor Tabs)/}).click();await page.waitForTimeout(200);
   await page.screenshot({path:`${out}/editor-settings-tabs-${theme}.png`});
   const tabsSection=await page.evaluate(()=>{const s=document.querySelector('#editor-settings-dialog [data-section=tabs]');return {focused:!!s&&s.contains(document.activeElement),labels:[...(s?.querySelectorAll('label')??[])].map(l=>l.textContent.trim())};});
   await page.locator('#editor-settings-dialog #tabs-show-icon').uncheck();await page.waitForTimeout(100);
   const icons=await page.evaluate(()=>document.querySelectorAll('#tabs .file-tab .resource-icon').length);
   await page.locator('#editor-settings-dialog #tabs-show-icon').check();await page.keyboard.press('Escape');
   return {tab,bookmarksSub,split,tabWhileSplit,unsplit,glyphs,mnemonicPopup,list,jumped,editorMenu,runSub,generate,compare,compareClosed,ran,tabsSection,icons};
  });
  // --- 4. Keymap: named profiles, Duplicate…, Rename…, Delete ------------------------------------------
  await step(theme+':keymap',async()=>{
   await keymapRun('ide.keymap');await page.waitForTimeout(200);
   const profiles=()=>page.evaluate(()=>[...document.querySelectorAll('#keymap-profile option')].map(o=>o.textContent+(o.selected?'*':'')));
   const before=await profiles();
   await page.locator('#keymap-gear').click();await page.waitForTimeout(100);
   const gear=await menuItems();
   await page.screenshot({path:`${out}/keymap-gear-${theme}.png`});
   await page.locator('.context-menu button',{hasText:/^(Duplicar…|Duplicate…)/}).click();await page.waitForTimeout(150);
   const suggested=await page.locator('.keymap-name-dialog input').inputValue();
   await page.screenshot({path:`${out}/keymap-duplicate-${theme}.png`});
   await page.locator('.keymap-name-dialog input').fill('Meu keymap');await page.keyboard.press('Enter');await page.waitForTimeout(150);
   const afterDuplicate=await profiles();
   const state=await page.evaluate(async()=>{const {keymap}=await import('/src/keymap.ts');keymap.setBindings('tool.problems',['Alt+Shift+6']);const custom=keymap.profile;keymap.setProfile(keymap.profileList()[0].id);const base=keymap.bindings('tool.problems');keymap.setProfile(custom);
    return {custom,base,mine:keymap.bindings('tool.problems'),stored:JSON.parse(localStorage.getItem('php-ide-keymap')).custom};});
   await page.locator('#keymap-gear').click();await page.waitForTimeout(100);const customGear=await menuItems();
   await page.locator('.context-menu button',{hasText:/^(Renomear…|Rename…)/}).click();await page.waitForTimeout(100);
   await page.locator('.keymap-name-dialog input').fill('Keymap da equipe');await page.keyboard.press('Enter');await page.waitForTimeout(150);
   const renamed=await profiles();
   await page.screenshot({path:`${out}/keymap-custom-${theme}.png`});
   await page.locator('#keymap-gear').click();await page.locator('.context-menu button',{hasText:/^(Excluir|Delete)$/}).click();await page.waitForTimeout(150);
   const confirm=page.locator('dialog[open] button',{hasText:/^(Excluir|Delete)$/});if(await confirm.count())await confirm.click();await page.waitForTimeout(150);
   const deleted=await profiles();
   await page.keyboard.press('Escape');
   return {before,gear,suggested,afterDuplicate,state,customGear,renamed,deleted};
  });
  await page.close();
 }
 if(assertOn)fixture.assertClean();
 if(process.argv.includes('--dump'))console.log(JSON.stringify(results,null,1));
 if(assertOn){
  if(failures.length)throw Error('Scenario failures:\n'+failures.join('\n'));
  for(const theme of themes){
   const b=results[theme+':breadcrumbs'];
   assert.deepEqual(b.js,['Cart','total()'],'JavaScript class › method');
   assert.deepEqual(b.ts,['Shop','format()'],'TypeScript namespace › function');
   assert.deepEqual(b.json,['autoload','psr-4','Fixture\\'],'JSON key path');
   assert.deepEqual(b.yaml,['services','App\\Mailer','arguments'],'YAML key path');
   assert.deepEqual(b.html,['html','body','main#app.page','ul.items','li'],'HTML tag path');
   assert.equal(b.initial,'bottom','default placement is the bottom of the editor (public help)');
   assert.ok(['Mostrar breadcrumbs','Topo','Rodapé','HTML','JSON','YAML'].every(l=>b.settings.includes(l)),'settings page: '+b.settings);
   assert.equal(b.top,'top');assert.equal(b.htmlOff,'hidden','language toggle hides HTML breadcrumbs');assert.equal(b.hidden,'hidden');assert.equal(b.bottom,'bottom');
   assert.match(b.persisted,/"placement":"bottom"/);
   const p=results[theme+':problems'];
   assert.match(p.empty.empty,/Nenhum erro encontrado pela IDE\.\s*Inspecionar código…/,'empty Project Errors offers Inspect Code (reference 51)');
   assert.ok(p.empty.tools.includes('preview'),'preview toggle in the toolbar');
   assert.deepEqual(p.inspected.files.map(f=>f.split(' ')[0]),['services.yaml','Other.php'],'errors of unopened files, by path');
   assert.ok(p.inspected.rows.some(r=>r.includes("Undefined variable '$nope'"))&&p.inspected.rows.some(r=>r.includes('Unknown service class')),'inspection results');
   assert.ok(p.calls.includes('php/diagnostics src/Other.php')&&p.calls.includes('textDocument/diagnostic config/services.yaml'),'language diagnostics asked for every file');
   assert.deepEqual(p.models,[],'temporary models disposed after the inspection');
   assert.deepEqual({...p.preview,title:p.preview.title.replace(/\s+/g,' ')},{visible:true,title:'Other.php :9',line:'echo $nope;',readOnly:true},'preview shows the problem line');
   assert.deepEqual(p.opened,{tab:'src/Other.php',caret:[9,14]},'double click opens the problem');
   const m=results[theme+':menus'];
   const clean=items=>items.filter(i=>i!=='—').map(i=>i.replace(' (off)',''));
   assert.deepEqual(clean(m.tab),['Fechar','Fechar outras abas','Fechar todas as abas','Fechar abas à direita','Copiar caminho/referência…','Dividir à direita','Dividir para baixo','Fixar aba','Configurar abas do editor…','Marcadores','Executar','Mais Executar/Depurar','Abrir em','Histórico local','Renomear arquivo…'],'tab menu order (reference 53)');
   assert.deepEqual(m.bookmarksSub,['Adicionar marcador','Adicionar marcador mnemônico…','Mostrar todos os marcadores…'],'Bookmarks submenu');
   assert.deepEqual(m.split,{editors:2,sameModel:true,side:'right',title:'Broken.php'},'Split Right');
   assert.ok(clean(m.tabWhileSplit).includes('Desfazer divisão'),'Unsplit while split');assert.equal(m.unsplit,0);
   assert.equal(m.glyphs,1,'F3 adds a line bookmark');assert.ok(m.mnemonicPopup,'⌥F3 mnemonic chooser');
   assert.equal(m.list.length,2,'⌘F3 lists bookmarks: '+m.list);assert.ok(m.list.some(l=>/^1\b/.test(l)&&l.includes('Broken.php:9')),'mnemonic listed');
   assert.deepEqual(m.jumped,[9,9],'^1 jumps to mnemonic 1');
   const em=clean(m.editorMenu);
   for(const label of ['Gerar…','Executar','Mais Executar/Depurar','Comparar com a área de transferência'])assert.ok(em.includes(label),'editor menu has '+label+': '+em);
   assert.ok(em.indexOf('Gerar…')===em.indexOf('Refatorar')+1,'Generate… right after Refactor (reference 31)');
   assert.deepEqual(m.runSub,['Executar o teste sob o cursor'],'Run delegates to plugin actions');
   assert.deepEqual(clean(m.generate),['#Gerar','Construtor','Getters'],'⌘N Generate popup delegates to providers');
   assert.deepEqual({open:m.compare.open,left:m.compare.left},{open:true,left:'const answer = 41;\n'},'Compare with Clipboard');assert.ok(m.compareClosed);
   assert.deepEqual(m.ran,['getters']);
   assert.ok(m.tabsSection.focused&&m.tabsSection.labels.includes('Mostrar ícone do arquivo'),'Configure Editor Tabs focuses the tabs section');assert.equal(m.icons,0,'icons hidden at once');
   const k=results[theme+':keymap'];
   assert.ok(clean(k.gear).includes('Duplicar…')&&!clean(k.gear).includes('Excluir'),'bundled keymap: Duplicate…, no Delete (reference 57)');
   assert.match(k.suggested,/cópia$/,'suggested copy name');
   assert.ok(k.afterDuplicate.includes('Meu keymap*'),'duplicate becomes the active profile');
   assert.deepEqual(k.state.base,['Alt+6']);assert.deepEqual(k.state.mine,['Alt+Shift+6'],'customizing the copy leaves the parent');
   assert.equal(k.state.stored.length,1);
   assert.ok(['Duplicar…','Renomear…','Excluir'].every(l=>clean(k.customGear).includes(l)),'custom keymap gear');
   assert.ok(k.renamed.includes('Keymap da equipe*'),'renamed');assert.ok(!k.deleted.some(o=>o.startsWith('Keymap da equipe')),'deleted');
  }
 }
 console.log(`Editor shell (round 2): ${out}/*.png${failures.length?` (${failures.length} scenario failures: ${failures.join(' | ')})`:''}`);
} finally {await browser?.close();server.kill();}
