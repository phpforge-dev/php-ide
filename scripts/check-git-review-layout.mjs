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
const userBefore=userPhp.replace('        // edited locally\n','');const userAfter=userPhp.replace('        // edited locally\n','        // edited locally\n        // and another\n');
const userPatch='@@ -9,0 +10,2 @@\n+        // edited locally\n+        // and another\n';const dtoPatch='@@ -16 +16 @@\n- public ?Carbon $expiresAt = null\n+ public ?Carbon $expiresAt = null,\n';
// Log fixture: the repository observed in PhpStorm (G-16), with a merge, a branch tip, tags and another author.
const iso=(d,h)=>new Date(d+'T'+String(h).padStart(2,'0')+':00:00').toISOString();
const logCommits=[
 {hash:'580a03e0'+'1'.repeat(32),author:'Ana Fixture',email:'ana@example.invalid',date:iso(today,22),subject:'Report draft',parents:['03f8346cae166908f817f2a20cb21c22cb603e34'],refs:'feature/report',committer:'Ana Fixture'},
 {hash:'03f8346cae166908f817f2a20cb21c22cb603e34',author:'Ana Fixture',email:'ana@example.invalid',date:iso(today,21),subject:'Add footer comment',parents:['d9f445f0'+'2'.repeat(32)],refs:'HEAD -> main, tag: v1.1',committer:'Ana Fixture'},
 {hash:'d9f445f0'+'2'.repeat(32),author:'Ana Fixture',email:'ana@example.invalid',date:iso(today,20),subject:'Merge branch feature/login',parents:['83f448f3528a4a52efed24c1d2e3f4a5b6c7d8e9','2618cba0'+'3'.repeat(32)],refs:'',committer:'Ana Fixture'},
 {hash:'83f448f3528a4a52efed24c1d2e3f4a5b6c7d8e9',author:'Ana Fixture',email:'ana@example.invalid',date:iso(today,19),subject:'Rename default user',parents:['6492ab8a1f0c4d1e9b7a2c3d4e5f60718293a4b5'],refs:'',committer:'Ana Fixture'},
 {hash:'2618cba0'+'3'.repeat(32),author:'Bruno Dev',email:'bruno@example.invalid',date:iso(today,18),subject:'Add login helper',parents:['6492ab8a1f0c4d1e9b7a2c3d4e5f60718293a4b5'],refs:'feature/login',committer:'Ana Fixture'},
 {hash:'6492ab8a1f0c4d1e9b7a2c3d4e5f60718293a4b5',author:'Ana Fixture',email:'ana@example.invalid',date:iso('2026-10-01',10),subject:'Initial user class',parents:[],refs:'tag: v1.0',committer:'Ana Fixture'}];
const tools={user:'Ana Fixture',remotes:[],stashes:[],branches:[{name:'main',current:true,remote:false,upstream:'',tracking:''},{name:'feature/login',current:false,remote:false,upstream:'',tracking:''},{name:'feature/report',current:false,remote:false,upstream:'',tracking:''}],
 tags:[{name:'v1.1',commit:'03f8346cae166908f817f2a20cb21c22cb603e34',annotated:true},{name:'v1.0',commit:'6492ab8a1f0c4d1e9b7a2c3d4e5f60718293a4b5',annotated:false}],
 worktrees:[{path:'/tmp/project',name:'project',branch:'main',head:'03f8346c',current:true,main:true},{path:'/tmp/project-wt',name:'project-wt',branch:'feature/report',head:'580a03e0',current:false}]};
const bootstrap=`
  import * as monaco from 'monaco-editor';
  import {installEditorWorkers} from '/src/editor-workers.ts';
  import {mountWorkbench} from '/src/workbench.ts';
  import {editorPreviewLayout} from '/src/editor-preview-layout.ts';
  import {mountEditorChrome} from '/src/editor-chrome.ts';
  import {dockWindow,resizeToolWindow} from '/src/tool-window.ts';
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
   gitTools:async()=>(${JSON.stringify(tools)}),gitBranches:async()=>(${JSON.stringify(tools.branches)}),
   gitLog:async filter=>{window.logRequests=(window.logRequests??[]).concat([filter]);let list=${JSON.stringify(logCommits)};
    if(filter.authors?.length)list=list.filter(c=>filter.authors.includes(c.author));
    if(filter.text)list=list.filter(c=>filter.regex?new RegExp(filter.text,filter.matchCase?'':'i').test(c.subject):(filter.matchCase?c.subject:c.subject.toLowerCase()).includes(filter.matchCase?filter.text:filter.text.toLowerCase()));
    if(filter.since)list=list.filter(c=>c.date.slice(0,10)>=filter.since);return list;},
   gitHistory:async hash=>({hash,parents:[],files:[{path:'src/User.php',status:'M'}]}),
   gitHunks:async(path,staged)=>path==='src/User.php'&&!staged?{token:'h1',hunks:[{id:0,patch:${JSON.stringify(userPatch)}}]}:{token:'h0',hunks:[{id:0,patch:${JSON.stringify(dtoPatch)}}]},
   gitApplyHunk:async(...args)=>{window.applied=(window.applied??[]).concat([args]);},
   gitEditorBase:async()=>({text:${JSON.stringify(userPhp)},label:'HEAD → editor'}),
   gitBlame:async input=>{window.blameCalls=(window.blameCalls??[]).concat([input]);return ${JSON.stringify(blame)};},
   gitDiff:async path=>path==='src/User.php'?{path,before:${JSON.stringify(userBefore)},after:${JSON.stringify(userAfter)},beforeLabel:'Preparado (index)',afterLabel:'Disco',token:'u'}:({before:${JSON.stringify(before)},after:${JSON.stringify(after)},beforeLabel:'HEAD',afterLabel:'Disco',token:'t'}),
   agents:async()=>[]};
  window.api=api;
  const {activate}=await import('/__git-plugin.js');let contribution;
  activate({own:()=>{},provide:(name,value)=>contribution=value,tr:s=>s,msg:(p,...a)=>p.reduce((v,s,i)=>v+s+(a[i]??''),''),html:(p,...a)=>typeof p==='string'?p:p.reduce((v,s,i)=>v+s+(a[i]??''),''),
   activeLanguage:()=>'pt-BR',dockWindow,resizeToolWindow,toolIcon:(b,path,label)=>{b.title=label;b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">'+path+'</svg>'},
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
 await page.waitForFunction(()=>document.getElementById('git-diff-count').textContent==='1 diferença, 0 incluídas');
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
 // 3. Line selection in the diff: chunk and line checkboxes, "N diferenças, M incluídas", stage only the marked lines.
 await page.locator('.git-file-row[data-path="src/User.php"]').click();
 await page.waitForSelector('#git-review .line-numbers.git-chunk-box');
 await page.waitForFunction(()=>document.getElementById('git-diff-count').textContent==='1 diferença, 0 incluídas');
 assert.equal(await page.locator('#git-stage-lines').isDisabled(),true,'nothing included yet');
 assert.equal(await page.locator('#git-review .git-line-box').count(),2,'one checkbox per line of a multi-line chunk');
 await page.locator('#git-review .git-line-box').first().click();
 await page.waitForFunction(()=>document.getElementById('git-diff-count').textContent==='1 diferença, 1 incluídas');
 await page.waitForSelector('#git-review .line-numbers.git-chunk-box.partial'); // chunk shows a partial selection
 await page.screenshot({path:'.artifacts/git-diff-lines.png'});
 await page.locator('#git-stage-lines').click();
 await page.waitForFunction(()=>window.applied?.length===1);
 assert.deepEqual(await page.evaluate(()=>window.applied[0]),['src/User.php',false,'h1',{0:[0]}],'only the first added line is staged');
 await page.locator('#git-review .line-numbers.git-chunk-box').click();
 await page.waitForFunction(()=>document.getElementById('git-diff-count').textContent==='1 diferença, 1 incluídas');
 await page.locator('#git-stage-lines').click();await page.waitForFunction(()=>window.applied?.length===2);
 assert.deepEqual(await page.evaluate(()=>window.applied[1][3]),{0:true},'chunk checkbox includes the whole chunk');
 await page.locator('#git-close-diff').click();
 console.log('WebKit: diff line selection — chunk/line checkboxes, included count and partial staging passed.');
 // 4. Log: graph, labels, branches tree, filters (Branch, User → me, Date, Paths, text with Regex/Cc) and commit menu.
 if(await page.locator('#git-log-panel').isHidden())await page.locator('#show-git').click();
await page.locator('#git-filter-branch').click();await page.locator('.git-menu-item',{hasText:'HEAD'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#git-log .git-commit-row').length===6);
 assert.equal(await page.locator('#git-log .git-head-node').count(),1,'HEAD commit drawn as a ring');
 assert.equal(await page.locator('#git-log .git-commit-row.git-merge .git-commit-text').textContent(),'Merge branch feature/login');
 assert.equal(await page.locator('#git-log .git-commit-row.git-on-branch').count(),5,'current branch commits are highlighted');
 assert.equal(await page.locator('#git-log .git-commit-row.git-mine').count(),5,'own commits in bold');
 assert.deepEqual(await page.locator('#git-log .git-commit-row').nth(1).locator('.git-ref-label').allTextContents(),['main','v1.1']);
 assert.ok(await page.locator('#git-log path.git-lane').count()>10,'continuous lane segments');
 assert.deepEqual(await page.locator('#git-log-refs .git-ref-row').allTextContents(),['HEAD (Branch atual)','main','login','report','v1.1','v1.0'],'Local grouped by folder, then Tags');
 assert.equal(await page.locator('#git-log-refs details summary').allTextContents().then(t=>t.join('|')),'Local|feature|Tags');
await page.locator('#git-log .git-commit-row').nth(2).click();await page.waitForSelector('#git-history-files .git-file-row');
 await page.screenshot({path:'.artifacts/git-log.png'});
 await page.locator('#git-filter-user').click();
 assert.deepEqual(await page.locator('.git-menu').last().locator('.git-menu-label').allTextContents(),['Selecionar…','eu','Bruno Dev']);
 await page.locator('.git-menu-item',{hasText:'eu'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#git-log .git-commit-row').length===5);
 assert.deepEqual((await page.evaluate(()=>window.logRequests.at(-1))).authors,['Ana Fixture']);
 assert.equal(await page.locator('#git-filter-user').textContent(),'Usuário: Ana Fixture');
 await page.locator('#git-filter-date').click();
 assert.deepEqual(await page.locator('.git-menu').last().locator('.git-menu-label').allTextContents(),['Selecionar…','Últimas 24 horas','Últimos 7 dias']);
 await page.screenshot({path:'.artifacts/git-log-filters.png'});
 await page.locator('.git-menu-item',{hasText:'Últimos 7 dias'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#git-log .git-commit-row').length===4);
 await page.locator('#git-filter-paths').click();await page.locator('.git-menu-item',{hasText:'Selecionar pastas'}).click();
 await page.locator('.git-log-ask input').fill('src/');await page.locator('.git-log-ask button[type=submit]').click();
 await page.waitForFunction(()=>window.logRequests.at(-1).paths?.[0]==='src');
 await page.locator('#git-filter-branch').click();await page.locator('.git-menu-item',{hasText:'Todas'}).click();
 await page.waitForFunction(()=>window.logRequests.at(-1).refs?.[0]==='--all');
 await page.locator('#git-log-search').fill('LOGIN');
 await page.waitForFunction(()=>window.logRequests.at(-1).text==='LOGIN');
 await page.locator('#git-log-case').click();
 await page.waitForFunction(()=>window.logRequests.at(-1).matchCase===true);
 assert.equal(await page.locator('#git-log .git-commit-row').count(),0,'Match Case');
 await page.locator('#git-log-case').click();await page.locator('#git-log-search').fill('');
 await page.locator('#git-filter-user').click();await page.locator('.git-menu-item',{hasText:'Todos'}).click();
 await page.locator('#git-filter-date').click();await page.locator('.git-menu-item',{hasText:'Todas'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#git-log .git-commit-row').length===6);
 await page.locator('#git-log .git-commit-row').nth(3).click({button:'right'});
 const logMenu=await page.locator('.git-menu').last().locator('.git-menu-label').allTextContents();
 for(const item of ['Copiar número da revisão','Cherry-pick','Reverter commit','Ir para o commit filho','Ir para o commit pai'])assert.ok(logMenu.includes(item),item);
 await page.keyboard.press('Escape');
 await page.locator('#git-log .git-commit-row').nth(3).focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.hash),'6492ab8a1f0c4d1e9b7a2c3d4e5f60718293a4b5','→ goes to the parent commit');
 // Annotate → click opens this commit in the Log.
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('ide-git-show-commit',{detail:{hash:'2618cba0'+'3'.repeat(32),path:'src/User.php'}})));
 await page.waitForFunction(()=>document.querySelector('#git-log .git-commit-row[aria-selected=true]')?.dataset.hash.startsWith('2618cba0'));
 assert.equal(await page.locator('#git-log-panel').isVisible(),true,'Annotate link opens the Log');
 assert.equal(await page.locator('#git-filter-paths').textContent(),'Caminhos: src/User.php');
 console.log('WebKit: Log — graph, labels, branches tree, Branch/User/Date/Paths/text filters, commit menu and Annotate link passed.');
 assert.deepEqual(errors,[]);
}finally{await browser?.close();await server.close();}
