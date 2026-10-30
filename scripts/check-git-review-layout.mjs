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
const bootstrap=`
  import * as monaco from 'monaco-editor';
  import {installEditorWorkers} from '/src/editor-workers.ts';
  import {mountWorkbench} from '/src/workbench.ts';
  import {editorPreviewLayout} from '/src/editor-preview-layout.ts';
  import '/src/themes.css';import '/src/style.css';import '/src/workbench.css';import '/src/theme-surfaces.css';import '/src/tool-windows.css';
  installEditorWorkers();
  document.documentElement.dataset.theme='dark';
  document.body.innerHTML='<div id="app"></div>';
  document.getElementById('app').innerHTML=${JSON.stringify(shell)};
  const style=document.createElement('style');style.textContent=${JSON.stringify(pluginCss)};document.head.append(style);
  mountWorkbench({gitStatus:async()=>({branch:'main'})});
  const editor=monaco.editor.create(document.getElementById('editor'),{value:'<?php',automaticLayout:true,theme:'vs-dark'});
  editorPreviewLayout(editor);
  window.opened=[];
  const api={gitStatus:async()=>({branch:'main',head:'6f946771',changes:[{path:'app/DTOs/Payment/SaveCreditCardTokenDTO.php',index:' ',worktree:'M'}]}),
   gitDiff:async()=>({before:${JSON.stringify(before)},after:${JSON.stringify(after)},beforeLabel:'HEAD',afterLabel:'Disco',token:'t'}),
   agents:async()=>[]};
  window.api=api;
  const {activate}=await import('/__git-plugin.js');let contribution;
  activate({own:()=>{},provide:(name,value)=>contribution=value,tr:s=>s,msg:(p,...a)=>p.reduce((v,s,i)=>v+s+(a[i]??''),''),html:(p,...a)=>typeof p==='string'?p:p.reduce((v,s,i)=>v+s+(a[i]??''),''),
   activeLanguage:()=>'pt-BR',dockWindow:()=>()=>{},resizeToolWindow:()=>{},toolIcon:(b,path,label)=>{b.title=label;b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">'+path+'</svg>'},
   editorFont:{size:13,family:'monospace'},fileIcon:()=>document.createElement('span'),keymap:{registerAction:()=>()=>{},onChange:()=>()=>{},shortcut:()=>'',ariaShortcuts:()=>''},
   monaco,api,service:()=>({generate:async()=>'',cancel:async()=>{}}),host:{editor,open:async(path,line)=>window.opened.push([path,line]),status:()=>{}}});
  contribution.mount(api,()=>false,async()=>{});
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
 assert.equal(await page.locator('.editor-split').evaluate(el=>getComputedStyle(el).display),'none','empty editor split must not keep space');
 assert.ok(review.height>code.height-40,`review fills the editor area (${review.height} of ${code.height})`);
 assert.equal(await page.locator('#git-diff-count').textContent(),'1 diferença');
 assert.equal(await page.locator('.git-commit-toolbar .git-agent-ask svg').count(),1,'agent actions are icons in the Commit toolbar');
 assert.equal(await page.locator('.git-commit-options .git-generate-message svg').count(),1,'AI message is an icon beside Amend');
 await mkdir('.artifacts',{recursive:true});
 await page.screenshot({path:'.artifacts/git-review-layout.png'});
 await page.locator('#git-diff-source').click();
 await page.waitForFunction(()=>window.opened.length===1);
 assert.equal(await page.locator('#git-review').evaluate(el=>el.hidden),true);
 assert.deepEqual(errors,[]);
 console.log('WebKit: review fills the editor area; toolbar count, icons and jump to source passed.');
}finally{await browser?.close();await server.close();}
