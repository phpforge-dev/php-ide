// WebKit harness (engine of the macOS Tauri WebView) for the PHP Intelligence fidelity work:
// F2/Shift+F2 tooltip, in-place rename, Inline Method, Change Signature, inspections/quick fixes and
// paste imports. Runs the plugin from a LOCAL checkout (default ~/Projects/plugin-php-intelligence,
// or --plugin=<dir>), builds it first, and drives the real IDE shell with a simulated `window.ide`
// API (no Phpactor, no disk). Native behavior still needs `npm run test:native`.
// Usage: node scripts/check-php-intelligence-fidelity.mjs [--plugin=dir] [--only=f2,rename,...] [--chromium] [--shots]
import assert from 'node:assert/strict';
import { webkit, chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const pluginDir = arg('plugin') ?? join(homedir(), 'Projects/plugin-php-intelligence');
const only = arg('only')?.split(',');
const out = '.artifacts/php-intelligence-fidelity';
const port = 1449;
if (!process.argv.includes('--no-build')) execFileSync('node', ['build.mjs'], { cwd: pluginDir, stdio: 'inherit' });
const manifest = JSON.parse(await readFile(join(pluginDir, 'plugin.json'), 'utf8'));
const code = await readFile(join(pluginDir, manifest.workbench.main), 'utf8');
const style = await readFile(join(pluginDir, manifest.workbench.style), 'utf8');

const bootstrap = `
 const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');
 const {t:tr,msg,html,activeLanguage}=await import('/src/i18n.ts');
 const {keymap}=await import('/src/keymap.ts');const {dockWindow,resizeToolWindow,toolIcon}=await import('/src/tool-window.ts');
 const {fileIcon}=await import('/src/file-icons.ts');const {editorFont}=await import('/src/editor-theme.ts');
 const {editorPreviewLayout}=await import('/src/editor-preview-layout.ts');const {providePluginService}=await import('/src/plugin-services.ts');
 const module=await import('/fixture-php-intelligence.js');
 module.activate({api:window.ide,monaco,tr,msg,html,activeLanguage,keymap,dockWindow,resizeToolWindow,toolIcon,fileIcon,editorFont,editorPreviewLayout,own:()=>{},provide:(service,value)=>providePluginService('local-php-intelligence',service,value)});
 const link=document.createElement('link');link.rel='stylesheet';link.href='/fixture-php-intelligence.css';document.head.append(link);
 window.monacoApi=monaco;`;

// Simulated API: files live in memory; `window.languageMock(input)` answers language requests.
const api = files => `
 window.files=${JSON.stringify(files)};window.applied=[];window.created=[];
 const etag=t=>'e'+[...t].reduce((h,c)=>(h*31+c.charCodeAt(0))|0,7);
 const tree=()=>{const out={'':[]};for(const p of Object.keys(window.files).sort()){const parts=p.split('/');for(let i=0;i<parts.length;i++){const dir=parts.slice(0,i).join('/');const path=parts.slice(0,i+1).join('/');(out[dir]??=[]);if(!out[dir].some(e=>e.path===path))out[dir].push({name:parts[i],path,directory:i<parts.length-1});}}return out;};
 window.languageMock=()=>null;
 window.ide=new Proxy({},{get:(_,method)=>{
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async(...args)=>{
   if(method==='startupInfo')return {project:'/fixture'};
   if(method==='pluginList')return {plugins:[],directories:[]};
   if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/',name:'fixture'};
   if(method==='tree')return tree()[args[0]??'']??[];
   if(method==='listFiles')return Object.keys(window.files);
   if(method==='fileExists'){if(!(args[0] in window.files))throw Error('missing');return true;}
   if(method==='read'){const path=String(args[0]??'');if(!(path in window.files))throw Error('not found: '+path);return {path,uri:'file:///fixture/'+path,text:window.files[path],etag:etag(window.files[path])};}
   if(method==='languageApply'){const input=args[0];for(const c of input.changes){if(c.create){if(c.path in window.files)throw Error('exists');window.created.push(c.path);}else if(etag(window.files[c.path])!==c.etag)throw Error('etag');}
    const etags={};for(const c of input.changes){window.files[c.path]=c.text;etags[c.path]=etag(c.text);}window.applied.push(input.label);return {etags};}
   if(method==='language'||String(method).startsWith('php'))return window.languageMock(String(method),args[0],...args.slice(1));
   if(method==='gitStatus')return {branch:'main',head:'a'.repeat(40),changes:[],indexToken:'x'};
   if(method==='gitTools')return {branches:[],remotes:[],stashes:[],head:'x'};
   return [];
  };
 }});`;

const scenarios = {};
const scenario = (name, files, run) => scenarios[name] = { files, run };

// ── F2 / Shift+F2 ──────────────────────────────────────────────────────────────────────────
scenario('f2', { 'src/Problems.php': `<?php\n\nnamespace App;\n\nfunction count(): int\n{\n    return 'many';\n}\n\nfunction label(): string\n{\n    return 42;\n}\n\n$a = 1;\n` }, async (page, h) => {
 await h.open('src/Problems.php');
 await h.waitMarkers(2);
 // A weak warning from another owner, to check the "highest priority" mode skips it.
 await page.evaluate(() => { const m = monacoApi.editor.getModels().find(m => m.uri.path.endsWith('Problems.php')); monacoApi.editor.setModelMarkers(m, 'fixture', [{ severity: monacoApi.MarkerSeverity.Info, message: 'Unused variable', startLineNumber: 15, startColumn: 1, endLineNumber: 15, endColumn: 3 }]); });
 const sev = await page.evaluate(() => monacoApi.editor.getModelMarkers({}).map(m => m.severity + ':' + m.startLineNumber));
 await h.caret(1, 1); await page.keyboard.press('F2'); await page.waitForTimeout(250);
 const first = await h.state();
 assert.deepEqual(first.pos, [7, 12], 'F2 puts the caret right before the first problem: ' + JSON.stringify(first) + ' ' + sev);
 assert.ok(first.tooltip?.includes("'many'") || /string|int/i.test(first.tooltip ?? ''), 'compact tooltip with the message: ' + first.tooltip);
 assert.equal(first.peek, 0, 'no Monaco problem peek');
 await page.waitForTimeout(400); await h.shot('f2-tooltip');
 const fix = await page.evaluate(() => document.querySelector('.php-problem-tooltip .php-problem-fix')?.textContent ?? null);
 await page.keyboard.press('F2'); await page.waitForTimeout(200);
 assert.deepEqual((await h.state()).pos, [12, 12], 'second problem');
 await page.keyboard.press('F2'); await page.waitForTimeout(200);
 assert.deepEqual((await h.state()).pos, [7, 12], 'wraps to the first; weak warning skipped while there are errors/warnings');
 await page.keyboard.press('Shift+F2'); await page.waitForTimeout(200);
 assert.deepEqual((await h.state()).pos, [12, 12], 'Shift+F2 goes back (wrapping)');
 await page.keyboard.press('Escape'); await page.waitForTimeout(100);
 assert.equal((await h.state()).tooltip, null, 'Esc closes the tooltip');
 await page.keyboard.press('F2'); await page.waitForTimeout(200); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
 assert.equal((await h.state()).tooltip, null, 'moving the caret closes the tooltip');
 if (fix) { await h.caret(1, 1); await page.keyboard.press('F2'); await page.waitForTimeout(600); await page.keyboard.press('Alt+Shift+Enter'); await page.waitForTimeout(300);
  const text = await h.text(); assert.ok(!text.includes("function count(): int") || !text.includes("'many'"), 'Alt+Shift+Enter applied the primary fix: ' + fix); }
 return { first, fix };
});

// ── Rename in-place ────────────────────────────────────────────────────────────────────────
// Variables are answered by a tiny simulated server: every `$name` in the buffer.
const variableServer = `window.languageMock=(method,input)=>{if(method!=='language')return null;const t=input.text;
 const off=p=>t.split('\\n').slice(0,p.line).reduce((n,l)=>n+l.length+1,0)+p.character;const pos=o=>{const b=t.slice(0,o).split('\\n');return {line:b.length-1,character:b.at(-1).length};};
 const at=off(input.position);let a=at;while(a>0&&/\\w/.test(t[a-1]))a--;if(t[a-1]==='$')a--;const m=/^\\$(\\w+)/.exec(t.slice(a));
 if(input.method==='textDocument/prepareRename')return m?{start:pos(a),end:pos(a+m[0].length)}:null;
 if(input.method==='textDocument/rename'){if(!m)return null;const edits=[];for(const x of t.matchAll(new RegExp('\\\\$'+m[1]+'\\\\b','g')))edits.push({range:{start:pos(x.index),end:pos(x.index+x[0].length)},newText:'$'+input.newName});return {changes:{['file:///fixture/'+input.path]:edits}};}
 return null;};`;
const invoice = `<?php\n\nnamespace App;\n\nclass Invoice\n{\n}\n`;
const billing = `<?php\n\nnamespace Billing;\n\nuse App\\Invoice;\n\n/** @var Invoice $first */\n$first = new Invoice();\n$second = new Invoice(); // keep: Invoice\n`;
const other = `<?php\n\nnamespace Elsewhere;\n\nclass Invoice {}\nclass Receipt {}\n`;
scenario('rename-class', { 'src/models.php': invoice, 'src/billing.php': billing, 'src/other.php': other }, async (page, h) => {
 await h.open('src/billing.php'); await h.caretAt('new Invoice', 6);
 await page.keyboard.press('Shift+F6'); await page.waitForSelector('.php-rename-primary', { timeout: 8000 });
 const boxes = await page.evaluate(() => [document.querySelectorAll('.php-rename-primary').length, document.querySelectorAll('.php-rename-other').length]);
 assert.deepEqual(boxes, [1, 3], 'name boxed, the other three occurrences in this file highlighted (use, @var, other new)');
 assert.ok(await page.locator('.php-rename-icons button').count() === 1, 'one option icon (comments and strings) beside the name');
 await page.keyboard.type('Bill'); await page.waitForTimeout(150); await h.shot('rename-class-live');
 const live = await h.text();
 assert.ok(live.includes('use App\\Bill;') && live.includes('@var Bill $first') && (live.match(/new Bill\(\)/g) ?? []).length === 2 && live.includes('// keep: Invoice'), 'all occurrences follow the typing, comment untouched:\n' + live);
 assert.equal(await page.evaluate(() => window.applied.length), 0, 'nothing written while typing');
 await page.keyboard.press('Enter');
 await page.waitForFunction(() => window.files['src/models.php'].includes('class Bill'), null, { timeout: 8000 });
 const after = await h.text();
 assert.ok(after.includes('use App\\Bill;') && after.includes('new Bill();'), 'buffer renamed');
 assert.equal(await page.evaluate(() => window.files['src/other.php']), other, 'homonym in another namespace untouched');
 await page.waitForFunction(() => !document.querySelector('.php-rename-primary,.php-rename-lookup,.php-rename-icons'), null, { timeout: 3000 }).catch(() => {});
 assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.php-rename-primary,.php-rename-lookup,.php-rename-icons')].map(e => e.className)), [], 'session cleaned up');
});
scenario('rename-escape', { 'src/models.php': invoice, 'src/billing.php': billing }, async (page, h) => {
 await h.open('src/billing.php'); await h.caretAt('new Invoice', 6);
 await page.keyboard.press('Shift+F6'); await page.waitForSelector('.php-rename-primary');
 await page.keyboard.type('Nope'); await page.waitForTimeout(100); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
 assert.equal(await h.text(), billing, 'Esc restores the buffer');
 assert.equal(await page.evaluate(() => window.applied.length), 0);
 assert.equal(await page.evaluate(() => document.querySelectorAll('.php-rename-primary').length), 0);
});
const total = `<?php\n\nnamespace App;\n\nfunction run(): int\n{\n    $total = new \\App\\UserProfile();\n    $count = 2;\n    return $total->id() + $count;\n}\n`;
scenario('rename-variable', { 'src/run.php': total }, async (page, h) => {
 await page.evaluate(variableServer);
 await h.open('src/run.php'); await h.caretAt('$total->', 3);
 await page.keyboard.press('Shift+F6'); await page.waitForSelector('.php-rename-primary');
 const items = await page.locator('.php-rename-item').allTextContents();
 assert.deepEqual(items, ['total', 'userProfile', 'profile'], 'lookup: current name then type-based suggestions');
 assert.equal(await page.locator('.php-rename-other').count(), 1, 'the other $total is highlighted');
 assert.equal(await page.locator('.php-rename-icons button').count(), 0, 'local variable: no option icons');
 assert.equal(await page.locator('.php-rename-hint').count(), 0, 'no options hint for variables');
 await h.shot('rename-variable-lookup');
 await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
 assert.ok((await h.text()).includes('$userProfile = new') && (await h.text()).includes('return $userProfile->id()'), 'choosing a suggestion renames live:\n' + await h.text() + JSON.stringify(await page.evaluate(() => [document.activeElement?.className, document.querySelectorAll('.php-rename-primary').length])));
 await page.keyboard.press('Enter'); await page.waitForTimeout(500);
 const done = await h.text();
 assert.equal((done.match(/\$userProfile\b/g) ?? []).length, 2); assert.ok(!done.includes('$total'));
 await page.keyboard.press('Meta+z'); await page.waitForTimeout(200);
 assert.equal(await h.text(), total, 'one undo step reverts the whole rename');
});
const same = `<?php\n\nnamespace App;\n\nclass Invoice\n{\n}\n\nnew Invoice();\n`;
scenario('rename-options', { 'src/Invoice.php': same, 'src/Receipt.php': `<?php\n\nnamespace App;\n\nclass Receipt {}\n` }, async (page, h) => {
 await h.open('src/Invoice.php'); await h.caretAt('class Invoice', 8);
 await page.keyboard.press('Shift+F6'); await page.waitForSelector('.php-rename-primary');
 assert.match(await page.locator('.php-rename-hint').textContent(), /⌥⇧O/, 'options hint in the lookup');
 await page.keyboard.press('Tab'); await page.waitForSelector('.php-rename-options');
 const labels = await page.locator('.php-rename-options label').allTextContents();
 assert.deepEqual(labels, ['Comentários e strings', 'Renomear arquivo']);
 const checks = await page.locator('.php-rename-options input').evaluateAll(i => i.map(x => x.checked));
 assert.deepEqual(checks, [false, true], 'file rename on by default when the file is named after the class');
 await h.shot('rename-options');
 await page.locator('.php-rename-options input').first().check(); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
 assert.equal(await page.locator('.php-rename-icons button.on').count(), 1, 'icon reflects the option');
 await page.keyboard.press('Alt+Shift+O'); await page.waitForSelector('.php-rename-options');
 await page.locator('.php-rename-more').click();
 await page.waitForSelector('.refactor-dialog'); const value = await page.locator('.refactor-dialog input:not([type=checkbox])').inputValue();
 assert.equal(value, 'Invoice', 'More options opens the Rename dialog with the current name');
 const strings = await page.locator('.refactor-dialog input[name=strings]').isChecked(); assert.equal(strings, true, 'dialog keeps the chosen option');
 await page.locator('.refactor-dialog footer button[value=cancel]').click(); await page.waitForTimeout(200);
 assert.equal(await h.text(), same);
});
scenario('rename-conflict', { 'src/Invoice.php': same, 'src/Receipt.php': `<?php\n\nnamespace App;\n\nclass Receipt {}\n` }, async (page, h) => {
 await h.open('src/Invoice.php'); await h.caretAt('new Invoice', 6);
 await page.keyboard.press('Shift+F6'); await page.waitForSelector('.php-rename-primary');
 await page.keyboard.type('Receipt'); await page.keyboard.press('Enter');
 await page.waitForSelector('.refactor-preview', { timeout: 8000 });
 const conflict = await page.locator('.refactor-conflict').first().textContent();
 assert.match(conflict, /Já existe App\\Receipt/, 'conflict shown in the existing preview');
 assert.equal(await page.locator('.refactor-preview .apply').isDisabled(), true, 'conflict blocks Refactor');
 assert.equal(await h.text(), same, 'buffer back to the original behind the preview');
 await h.shot('rename-conflict');
 await page.locator('.refactor-preview .cancel').click();
});

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
let browser; const results = {}; const failures = [];
try {
 await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (String(d).includes(String(port))) resolve(); }); server.once('exit', reject); });
 browser = process.argv.includes('--chromium') ? await chromium.launch({ headless: true, channel: 'chrome' }) : await webkit.launch({ headless: true });
 await mkdir(out, { recursive: true });
 for (const [name, s] of Object.entries(scenarios)) {
  if (only && !only.includes(name)) continue;
  const page = await browser.newPage({ viewport: { width: 1512, height: 949 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(String(e.stack ?? e))); if (process.env.CONSOLE) page.on('console', m => console.log('console:', m.text()));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('**/src/window-layout.ts', r => r.fulfill({ contentType: 'application/javascript', body: 'export async function welcomeWindow(){} export async function workbenchWindow(){}' }));
  await page.route('**/fixture-php-intelligence.js', r => r.fulfill({ contentType: 'application/javascript', body: code }));
  await page.route('**/fixture-php-intelligence.css', r => r.fulfill({ contentType: 'text/css', body: style }));
  await page.route('**/src/bootstrap.ts', r => r.fulfill({ contentType: 'application/javascript', body: `${api(s.files)}\n${bootstrap}\nawait (await import('/src/main.ts')).ready;document.getElementById('startup-splash')?.remove();` }));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#tree summary,#tree button').first().waitFor();
  const h = {
   async open(path) { const parts = path.split('/'); for (let i = 1; i < parts.length; i++) { const dir = page.locator(`#tree [data-path="${parts.slice(0, i).join('/')}"]`).first(); if (await dir.count()) { const open = await dir.evaluate(e => e.closest('details')?.open ?? true); if (!open) await dir.click(); await page.waitForTimeout(150); } }
    await page.locator(`#tree [data-path="${path}"]`).first().click(); await page.waitForFunction(p => window.monacoApi?.editor.getEditors().some(e => e.getModel()?.uri.path.endsWith('/' + p)), path); await page.waitForTimeout(300); },
   async waitMarkers(n) { await page.waitForFunction(n => window.monacoApi.editor.getModelMarkers({ owner: 'php-inspections' }).length >= n, n, { timeout: 8000 }); },
   async caretAt(needle, delta = 1) { await page.evaluate(([n, d]) => { const e = monacoApi.editor.getEditors().find(e => e.getDomNode()?.closest('#editor')); const m = e.getModel(); e.setPosition(m.getPositionAt(m.getValue().indexOf(n) + d)); e.focus(); }, [needle, delta]); },
   async caret(line, column) { await page.evaluate(([l, c]) => { const e = monacoApi.editor.getEditors().find(e => e.getDomNode()?.closest('#editor')); e.setPosition({ lineNumber: l, column: c }); e.focus(); }, [line, column]); },
   async state() { return page.evaluate(() => { const e = monacoApi.editor.getEditors().find(e => e.getDomNode()?.closest('#editor')); const p = e.getPosition(); const t = document.querySelector('.php-problem-tooltip'); return { pos: [p.lineNumber, p.column], tooltip: t && t.isConnected && t.getClientRects().length ? t.textContent : null, peek: document.querySelectorAll('.marker-widget, .peekview-widget').length }; }); },
   async text() { return page.evaluate(() => monacoApi.editor.getEditors().find(e => e.getDomNode()?.closest('#editor')).getModel().getValue()); },
   async shot(file) { if (process.argv.includes('--shots')) await page.screenshot({ path: `${out}/${file}.png` }); },
  };
  try { results[name] = await s.run(page, h); if (errors.length) throw Error('page errors:\n' + errors.join('\n')); console.log(`✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`✗ ${name}: ${e.message}`); await page.screenshot({ path: `${out}/${name}-failure.png` }).catch(() => {}); }
  await page.close();
 }
 if (process.argv.includes('--dump')) console.log(JSON.stringify(results, null, 1));
 if (failures.length) { process.exitCode = 1; console.log('Failed: ' + failures.join(', ')); }
} finally { await browser?.close(); server.kill(); }
