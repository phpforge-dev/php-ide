import {pinnedWorkbenchFixture} from './pinned-workbench-fixture.mjs';
const fixture=await pinnedWorkbenchFixture(["git", "php-intelligence"]);
// PhpStorm editor chrome (gutter order and separator, right margin, caret row, inspection widget, error stripe)
// on the Islands fixture, dark and light. Simulated API only; native behavior is checked by check-native.
// Writes .artifacts/editor-fidelity/editor-{dark,light}.png at the reference window size (1512×949 logical)
// so they can be compared with .artifacts/phpstorm-reference/05-editor-php-user.png and 40-light-editor.png.
// --dump prints the measured geometry; --out=<dir> changes the screenshot folder.
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
const port=1447;
const out=process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??'.artifacts/editor-fidelity';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.once('exit',reject);});
 // --webkit runs the engine of the macOS Tauri WebView (font fallback differs: SF Mono instead of Menlo).
 browser=process.argv.includes('--webkit')?await webkit.launch({headless:true}):await chromium.launch({headless:true,channel:'chrome'});
 await mkdir(out,{recursive:true});
 const user=await readFile('tests/fixtures/projects/php-intelligence/src/User.php','utf8');
 const api=`
 const files={'src/User.php':${JSON.stringify(user+'// changed\n')},'README.md':'# Reference\\n'};
 const tree={'':[{name:'src',path:'src',directory:true},{name:'README.md',path:'README.md',directory:false}],src:[{name:'User.php',path:'src/User.php',directory:false}]};
 window.ide = new Proxy({}, {get:(_,method)=> {
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async (...args)=>{
   if(method==='startupInfo')return {project:'/fixture'};
   if(method==='pluginList')return {plugins:[],directories:[]};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'reference-project'};
   if(method==='tree')return tree[args[0]??'']??[];
   if(method==='read'){const path=String(args[0]??'');return {path,uri:'file:///fixture/'+path,text:files[path]??'',etag:'preview'};}
   if(method==='gitStatus')return {branch:'main',head:'a'.repeat(40),changes:[{path:'src/User.php',index:' ',worktree:'M'}],indexToken:'preview'};
   if(method==='gitTools')return {branches:[],remotes:[],stashes:[],head:'preview'};
   if(method==='gitEditorBase')return {text:${JSON.stringify(user)},label:'HEAD → editor'};
   if(method==='phpMethodFamily'||method==='language')return null;
   return [];
  };
 }});`;
 const results={};
 for(const theme of ['dark','light']){
  const page=await browser.newPage({viewport:{width:1512,height:949},deviceScaleFactor:1});
  await page.emulateMedia({colorScheme:theme});await fixture.route(page);if(process.env.STACK)page.on('pageerror',e=>console.log(e.stack));
  await page.addInitScript(t=>{try{localStorage.setItem('php-ide-appearance',JSON.stringify({theme:t}));}catch{}},theme);
  await page.route('**/src/bootstrap.ts',route=>route.fulfill({contentType:'application/javascript',body:`${api}
   ${fixture.bootstrap}
   await (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();`}));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#tree summary,#tree button').first().waitFor();
  const src=page.locator('#tree summary',{hasText:'src'}).first();if(await src.count())await src.click();
  for(const name of ['README.md','src/User.php']){const b=page.locator(`#tree [data-path="${name}"]`).first();if(await b.count())await b.click();await page.waitForTimeout(250);}
  await page.waitForTimeout(800);await page.evaluate(()=>document.fonts.ready);
  const editor='#editor .monaco-editor';
  // Clean file: the widget shows the green check.
  const widget=page.locator('#editor .inspection-widget');
  if(await widget.count()){await widget.waitFor();results[theme+'Clean']=await widget.getAttribute('aria-label');}
  // A synthetic warning on line 9, like the unused-code highlight in reference 40.
  await page.evaluate(async()=>{const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');const model=monaco.editor.getModels().find(m=>m.uri.path.endsWith('/src/User.php'));
   monaco.editor.setModelMarkers(model,'editor-chrome-fixture',[{severity:monaco.MarkerSeverity.Warning,message:'Unused private method',startLineNumber:14,startColumn:22,endLineNumber:14,endColumn:28}]);
   // A gutter icon from the PHP plugin's own classes, like the "implements" marker on line 9 of reference 05.
   const editor=monaco.editor.getEditors()[0];editor.createDecorationsCollection([{range:new monaco.Range(9,1,9,1),options:{glyphMarginClassName:'php-gutter php-gutter-implements'}}]);
   window.gutterHits=[];editor.onMouseDown(e=>window.gutterHits.push(e.target.type));});
  await page.locator(`${editor} .view-lines .view-line`).nth(8).click({position:{x:120,y:10}});
  await page.waitForTimeout(300);
  const geometry=await page.evaluate(async()=>{
   const editor=document.querySelector('#editor .monaco-editor');const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};};
   const lineNumber=[...editor.querySelectorAll('.line-numbers')].find(e=>e.textContent.trim()==='9');
   const range=document.createRange();range.selectNodeContents(lineNumber);
   const style=getComputedStyle(editor.querySelector('.view-lines'));
   // Monaco places cursor/highlights with its measured width; the text itself is laid out by the browser.
   const line=[...editor.querySelectorAll('.view-line')].find(l=>l.textContent.startsWith('namespace'));const lr=document.createRange();lr.selectNodeContents(line.firstElementChild);
   const m=await import('/node_modules/.vite/deps/monaco-editor.js');const measured=m.editor.getEditors()[0].getOption(m.editor.EditorOption.fontInfo);
   const charWidths={measured:measured.typicalHalfwidthCharacterWidth,rendered:lr.getBoundingClientRect().width/line.textContent.length,fonts:[...document.fonts].filter(f=>f.family.includes('JetBrains')).map(f=>f.style+f.weight+':'+f.status).join(' '),family:getComputedStyle(line).fontFamily};
   return {charWidths,editor:box(editor),margin:box(editor.querySelector('.margin')),numberText:box(range),content:box(editor.querySelector('.lines-content')),
change:box(editor.querySelector('[class*="git-line-"]')),
    ruler:box(editor.querySelector('.view-ruler')),minimap:!!editor.querySelector('.minimap:not([style*="display: none"])')&&editor.querySelector('.minimap').offsetWidth>0,
    caretRowInGutter:!!editor.querySelector('.margin .current-line'),overview:editor.querySelector('.decorationsOverviewRuler')?.offsetWidth??0,stripe:box(editor.querySelector('.error-stripe')),stripeMarks:[...editor.querySelectorAll('.error-stripe i')].map(i=>i.className+':'+i.dataset.line),
    font:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,
    widget:box(editor.parentElement.querySelector('.inspection-widget')),widgetLabel:editor.parentElement.querySelector('.inspection-widget')?.getAttribute('aria-label')??null};
  });
  results[theme]=geometry;
  await page.screenshot({path:`${out}/editor-${theme}.png`});
  // Clicking the visible number must select the line and clicking the visible icon must reach the glyph margin.
  const hits=await page.evaluate(()=>{const n=[...document.querySelectorAll('#editor .line-numbers')].find(e=>e.textContent.trim()==='9');const r=document.createRange();r.selectNodeContents(n);const t=r.getBoundingClientRect();
   const icon=document.querySelector('#editor .php-gutter-implements').getBoundingClientRect();return {number:[t.left+t.width/2,t.top+t.height/2],icon:[icon.left+icon.width/2,icon.top+icon.height/2],iconLeft:icon.left};});
  results[theme].iconLeft=Math.round(hits.iconLeft);
  await page.mouse.click(...hits.number);await page.mouse.click(...hits.icon);
  results[theme+'Hits']=await page.evaluate(()=>window.gutterHits.splice(0).slice(-2));
  if(geometry.widget){
   // Next-problem arrow moves the caret to the warning.
   await page.locator('#editor .inspection-widget [data-action=next]').click();await page.waitForTimeout(200);
   results[theme+'NextLine']=await page.evaluate(async()=>{const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');return monaco.editor.getEditors()[0].getPosition()?.lineNumber;});
  }
  await page.close();
 }
 fixture.assertClean();
 if(process.argv.includes('--dump'))console.log(JSON.stringify(results,null,1));
 if(!process.argv.includes('--no-assert'))for(const theme of ['dark','light']){
  const g=results[theme];
  assert.equal(g.minimap,false,'no minimap');
  assert.ok(Math.abs(g.charWidths.measured-g.charWidths.rendered)<0.01,`Monaco measures the rendered font (${g.charWidths.measured} vs ${g.charWidths.rendered})`);
  assert.match(g.font,/JetBrains Mono/);assert.equal(g.fontSize,'13px');assert.equal(g.lineHeight,'22px');
  assert.ok(g.numberText.left-g.margin.left<=24,`line numbers sit at the gutter's left edge (${g.numberText.left-g.margin.left}px)`);
  assert.ok(g.iconLeft>=g.numberText.right,'gutter icons sit right of the line numbers');
  assert.deepEqual(results[theme+'Hits'],[3,2],'number click → GUTTER_LINE_NUMBERS, icon click → GUTTER_GLYPH_MARGIN');
  assert.ok(g.change&&g.content.left-g.change.right<=6,'VCS marker touches the code, at the gutter separator');
  assert.ok(g.ruler,'right margin guide at column 120');
  assert.ok(g.caretRowInGutter,'caret row highlight spans the gutter');
  assert.equal(g.overview,0,'Monaco overview ruler replaced');assert.ok(g.stripe.width<=12&&g.stripe.right===g.editor.right,'thin error stripe at the right edge');
  assert.ok(g.stripeMarks.includes('error-stripe-mark:14')&&g.stripeMarks.includes('error-stripe-vcs:19'),'warning and VCS change on the stripe: '+g.stripeMarks);
  assert.ok(g.widget&&g.widget.right<=g.editor.right&&g.widget.top-g.editor.top<12,'inspection widget at the top right');
  assert.equal(results[theme+'Clean'],'Nenhum problema encontrado');
  assert.equal(g.widgetLabel,'1 aviso');
  assert.equal(results[theme+'NextLine'],14,'next-problem arrow jumps to the warning');
 }
 console.log(`Editor chrome: ${out}/editor-{dark,light}.png`);
} finally {await browser?.close();server.kill();}
