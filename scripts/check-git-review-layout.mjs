// Git review takes over the whole editor area (as PhpStorm opens the diff in the main editor) and
// shows the diff toolbar. GIT_PLUGIN_DIR checks a local plugin-git build before it is pinned.
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createServer} from 'vite';
import {webkit} from '@playwright/test';

const pluginDir=resolve(process.env.GIT_PLUGIN_DIR??'.tools/plugin-packages/git');
const [pluginJs,pluginCss]=await Promise.all([readFile(join(pluginDir,'workbench.js'),'utf8'),readFile(join(pluginDir,'workbench.css'),'utf8')]);
const source=await readFile('src/main.ts','utf8');
const shell=source.match(/innerHTML = html`([^`]+)`/)[1];
const before=Array.from({length:40},(_,i)=>i===15?' public ?Carbon $expiresAt = null':` public string $field${i};`).join('\n');
const after=before.replace('= null','= null,');
// Blame fixture modeled on the observed PhpStorm repository (G-04): Oct 1 commit, two commits today, one local line.
const userPhp='<?php\n\nnamespace Fixture;\n\nfinal class User\n{\n    public function name(): string\n    {\n        return "Ana Maria";\n        // edited locally\n    }\n}\n\n// footer\n';
const at=(d,h=10)=>Math.floor(new Date(d+'T'+String(h).padStart(2,'0')+':00:00').getTime()/1000);const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const H={init:'6492ab8a1f0c4d1e9b7a2c3d4e5f60718293a4b5',rename:'83f448f3528a4a52efed24c1d2e3f4a5b6c7d8e9',footer:'03f8346cae166908f817f2a20cb21c22cb603e34',none:'0'.repeat(40)};
const blame={path:'src/User.php',revision:null,content:null,lines:[...Array(8).fill(H.init),H.rename,H.none,H.init,H.init,H.footer,H.footer].map((hash,i)=>({hash,original:i+1})),commits:{
 [H.init]:{hash:H.init,author:'Ana Fixture',email:'ana@example.invalid',authorTime:at('2026-10-01'),commitTime:at('2026-10-01'),summary:'Initial user class',message:'Initial user class',uncommitted:false,path:'src/User.php'},
 [H.rename]:{hash:H.rename,author:'Ana Fixture',email:'ana@example.invalid',authorTime:at(today,9),commitTime:at(today,9),summary:'Rename default user',message:'Rename default user',previous:{hash:H.init,path:'src/User.php'},uncommitted:false,path:'src/User.php'},
 [H.footer]:{hash:H.footer,author:'Ana Fixture',email:'ana@example.invalid',authorTime:at(today,11),commitTime:at(today,11),summary:'Add footer comment',message:'Add footer comment',previous:{hash:H.rename,path:'src/User.php'},uncommitted:false,path:'src/User.php'},
 [H.none]:{hash:H.none,uncommitted:true}}};
const bootstrap=`
  import * as monaco from 'monaco-editor';
  import {installEditorWorkers} from '/src/editor-workers.ts';
  import {mountWorkbench} from '/src/workbench.ts';
  import {editorPreviewLayout} from '/src/editor-preview-layout.ts';
  import {mountEditorChrome} from '/src/editor-chrome.ts';
  import '/src/themes.css';import '/src/style.css';import '/src/workbench.css';import '/src/theme-surfaces.css';import '/src/tool-windows.css';
  installEditorWorkers();
  document.documentElement.dataset.theme='dark';
  document.body.innerHTML='<div id="app"></div>';
  document.getElementById('app').innerHTML=${JSON.stringify(shell)};
  const style=document.createElement('style');style.textContent=${JSON.stringify(pluginCss)};document.head.append(style);
  mountWorkbench({gitStatus:async()=>({branch:'main'})});
  const editor=monaco.editor.create(document.getElementById('editor'),{value:${JSON.stringify(userPhp)},language:'php',automaticLayout:true,theme:'vs-dark'});
  editorPreviewLayout(editor);mountEditorChrome(editor);window.statuses=[];
  window.opened=[];
  // Changelists kept in memory with the native semantics: unique names, active list receives moves with "Set active".
  window.lists=[{id:'default',name:'Changes',comment:'',active:true,files:['app/DTOs/Payment/SaveCreditCardTokenDTO.php','src/User.php']}];
  const changelists=input=>{const lists=window.lists;const byId=id=>lists.find(l=>l.id===id);
   if(input.action==='move'){let target=input.target&&byId(input.target);if(!target){target={id:'cl'+lists.length,name:input.name,comment:input.comment??'',active:false,files:[]};lists.push(target);}
    for(const l of lists)l.files=l.files.filter(f=>!input.paths.includes(f));target.files.push(...input.paths);if(input.setActive)lists.forEach(l=>l.active=l===target);}
   if(input.action==='set-active')lists.forEach(l=>l.active=l.id===input.id);
   if(input.action==='create'){lists.push({id:'cl'+lists.length,name:input.name,comment:input.comment??'',active:false,files:[]});}
   if(input.action==='delete'){const gone=byId(input.id);window.lists=lists.filter(l=>l!==gone);window.lists.find(l=>l.active).files.push(...gone.files);}
   window.changelistCalls=(window.changelistCalls??[]).concat([input]);return {lists:structuredClone(window.lists)};};
  const api={gitStatus:async()=>({branch:'main',head:'6f946771',changes:[{path:'app/DTOs/Payment/SaveCreditCardTokenDTO.php',index:' ',worktree:'M'},{path:'src/User.php',index:' ',worktree:'M'}]}),
   gitChangelists:async input=>changelists(input),
   gitEditorBase:async()=>({text:${JSON.stringify(userPhp)},label:'HEAD → editor'}),
   gitBlame:async input=>{window.blameCalls=(window.blameCalls??[]).concat([input]);return ${JSON.stringify(blame)};},
   gitDiff:async()=>({before:${JSON.stringify(before)},after:${JSON.stringify(after)},beforeLabel:'HEAD',afterLabel:'Disco',token:'t'}),
   agents:async()=>[]};
  window.api=api;
  const {activate}=await import('/__git-plugin.js');let contribution;
  activate({own:()=>{},provide:(name,value)=>contribution=value,tr:s=>s,msg:(p,...a)=>p.reduce((v,s,i)=>v+s+(a[i]??''),''),html:(p,...a)=>typeof p==='string'?p:p.reduce((v,s,i)=>v+s+(a[i]??''),''),
   activeLanguage:()=>'pt-BR',dockWindow:()=>()=>{},resizeToolWindow:()=>{},toolIcon:(b,path,label)=>{b.title=label;b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">'+path+'</svg>'},
   editorFont:{size:13,family:'monospace'},fileIcon:()=>document.createElement('span'),keymap:{registerAction:()=>()=>{},onChange:()=>()=>{},shortcut:()=>'',ariaShortcuts:()=>''},
   monaco,api,service:()=>({generate:async()=>'',cancel:async()=>{}}),host:{editor,open:async(path,line)=>window.opened.push([path,line]),status:()=>{}}});
  contribution.mount(api,()=>false,async()=>{});
  contribution.mountEditorChanges(api,editor,{path:()=>'src/User.php',status:text=>window.statuses.push(text)});
  window.ready=true;
 `;
// The bootstrap is a virtual module so Vite resolves its bare imports (monaco-editor, workers).
const harness={name:'git-review-harness',
 resolveId:id=>({'/__git-review.js':'\0git-review','/__git-plugin.js':'\0git-plugin'})[id],
 load:id=>({'\0git-review':bootstrap,'\0git-plugin':pluginJs})[id],
 configureServer(server){server.middlewares.use((req,res,next)=>{
  if(req.url!=='/__git-review.html')return next();
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="/__git-review.js"></script></body></html>');
 });}};
const server=await createServer({plugins:[harness],server:{host:'127.0.0.1',port:1442,strictPort:true}});
await server.listen();
if(process.argv.includes('--serve')){console.log('Harness: http://127.0.0.1:1442/__git-review.html');await new Promise(()=>{});}
let browser;
try{
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:760}});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('http://127.0.0.1:1442/__git-review.html');await page.waitForFunction(()=>window.ready);
 await page.locator('#show-commit').click();
 await page.locator('.git-file-row').first().click();
 await page.waitForFunction(()=>document.getElementById('git-diff-count')?.textContent.includes('1'));
 const box=selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,height:r.height};});
 const code=await box('.code'),review=await box('#git-review');
 // The shell no longer always renders .editor-split; when present, an empty split must not keep space.
 if(await page.locator('.editor-split').count())assert.equal(await page.locator('.editor-split').evaluate(el=>getComputedStyle(el).display),'none','empty editor split must not keep space');
 assert.ok(review.height>code.height-40,`review fills the editor area (${review.height} of ${code.height})`);
 assert.equal(await page.locator('#git-diff-count').textContent(),'1 diferença');
 assert.equal(await page.locator('.git-commit-toolbar .git-agent-ask svg').count(),1,'agent actions are icons in the Commit toolbar');
 assert.equal(await page.locator('.git-commit-options .git-generate-message svg').count(),1,'AI message is an icon beside Amend');
 await mkdir('.artifacts',{recursive:true});
 await page.screenshot({path:'.artifacts/git-review-layout.png'});
 await page.locator('#git-diff-source').click();
 await page.waitForFunction(()=>window.opened.length===1);
 assert.equal(await page.locator('#git-review').evaluate(el=>el.hidden),true);
 console.log('WebKit: review fills the editor area; toolbar count, icons and jump to source passed.');
 // 1. Annotate with Git Blame: gutter menu → annotations, hover popup, annotation menu, click → Log.
 // Monaco does not keep margin rows in line order; find the row by its trailing line number.
 const numbers=line=>page.locator('.margin-view-overlays .line-numbers').filter({hasText:new RegExp(`(^|\\D)${line}$`)});
 await numbers(1).click({button:'right'});
 await page.locator('.git-menu-item',{hasText:'Anotar com Git Blame'}).click();
 await page.waitForSelector('.git-blame-on');
 await page.waitForFunction(()=>/Fixture/.test(document.querySelector('.margin-view-overlays .line-numbers')?.textContent??''));
 assert.match(await numbers(1).textContent(),/^\d\d\/\d\d\/\d\d\u00a0Fixture/,'date and last name, as PhpStorm');
 assert.match(await numbers(9).textContent(),/^Hoje/);
 assert.equal((await numbers(10).textContent()).replace(/[\s\u00a0]+/g,' ').trim(),'10','uncommitted line has no annotation');
 assert.equal((await page.evaluate(()=>window.blameCalls[0])).ignoreWhitespace,true);
 const age=await numbers(13).evaluate(el=>[...el.classList].find(c=>c.startsWith('git-blame-age-')));
 assert.equal(age,'git-blame-age-0','newest commit has the strongest color');
 await numbers(13).hover();await page.waitForSelector('.git-blame-popup');
 assert.match(await page.locator('.git-blame-popup').textContent(),/commit 03f8346cae166908f817f2a20cb21c22cb603e34.*Autor: Ana Fixture <ana@example.invalid>.*Add footer comment/s);
 await page.screenshot({path:'.artifacts/git-blame.png'});
 await numbers(9).click({button:'right'});
 const labels=await page.locator('.git-menu').last().locator('.git-menu-label').allTextContents();
 assert.deepEqual(labels,['Fechar anotações','Mostrar diff','Exibir','Copiar número da revisão','Anotar revisão','Anotar revisão anterior','Mostrar no histórico do arquivo','Opções']);
 await page.locator('.git-menu-item',{hasText:'Exibir'}).hover();await page.locator('.git-menu-item',{hasText:'Nomes'}).hover();
 await page.screenshot({path:'.artifacts/git-blame-menu.png'});
 await page.keyboard.press('Escape');
 const shown=page.evaluate(()=>new Promise(resolve=>document.addEventListener('ide-git-show-commit',e=>resolve(e.detail.hash),{once:true})));
 await numbers(9).click();assert.equal(await shown,H.rename,'click opens the commit in the Log');
 await numbers(1).click({button:'right'});await page.locator('.git-menu-item',{hasText:'Fechar anotações'}).click();
 assert.equal(await page.locator('.git-blame-on').count(),0);
 await page.waitForFunction(()=>![...document.querySelectorAll('.margin-view-overlays .line-numbers')].some(n=>/Fixture/.test(n.textContent)));
 assert.equal((await numbers(1).first().textContent()).trim(),'1','closing restores plain line numbers');
 console.log('WebKit: Annotate with Git Blame — gutter menu, columns, age colors, popup, menu, Log link and close passed.');
 // 2. Changelists: Move to Another Changelist… with a new name and "Set active", then drag back and delete.
 const group=name=>page.locator('#git-changes details.git-changelist',{has:page.locator('summary strong',{hasText:name})});
 assert.equal(await group('Alterações').evaluate(el=>el.classList.contains('git-changelist-active')),true,'default list is active');
 await page.locator('.git-file-row[data-path="src/User.php"]').click({button:'right'});
 assert.deepEqual(await page.locator('.git-menu').last().locator('.git-menu-label').allTextContents(),['Mover para outra changelist…','Mostrar diff','Ir para o código-fonte','Nova changelist…','Editar changelist…']);
 await page.locator('.git-menu-item',{hasText:'Mover para outra changelist'}).click();
 const dialog=page.locator('.git-changelist-dialog');await dialog.locator('input[name=name]').fill('Refactor');
 await dialog.locator('textarea').fill('Renomear usuário');await dialog.locator('input[name=active]').check();
 await page.screenshot({path:'.artifacts/git-changelist-move.png'});
 await dialog.locator('button[value=ok]').click();
 await group('Refactor').waitFor();
 assert.equal(await group('Refactor').evaluate(el=>el.classList.contains('git-changelist-active')),true,'Set active makes the new list active (bold)');
 assert.equal(await group('Alterações').evaluate(el=>el.classList.contains('git-changelist-active')),false);
 assert.deepEqual(await group('Refactor').locator('.git-file-row').evaluateAll(rows=>rows.map(r=>r.dataset.path)),['src/User.php']);
 assert.equal(await group('Refactor').locator('summary').getAttribute('title'),'Renomear usuário','comment is the tooltip');
 assert.equal(await group('Refactor').locator('summary strong').evaluate(el=>getComputedStyle(el).fontWeight),'600');
 assert.equal(await group('Alterações').locator('summary strong').evaluate(el=>getComputedStyle(el).fontWeight),'400');
 await page.screenshot({path:'.artifacts/git-changelists.png'});
 await group('Alterações').locator('summary').click({button:'right'});
 await page.locator('.git-menu-item',{hasText:'Definir como changelist ativa'}).click();
 await page.waitForFunction(()=>document.querySelector('details.git-changelist-active summary strong')?.textContent==='Alterações');
 await group('Refactor').locator('summary').click({button:'right'});
 await page.locator('.git-menu-item',{hasText:'Excluir changelist'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('details.git-changelist').length===1);
 assert.equal(await group('Alterações').locator('.git-file-row').count(),2,'files of a deleted list return to the active one');
 console.log('WebKit: changelists — move with Set active, bold active list, comment, set active and delete passed.');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await server.close();}
