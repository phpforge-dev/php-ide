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
   if(method==='read'){let path=String(args[0]??'');if(path.startsWith('/fixture/'))path=path.slice(9);if(!(path in window.files))throw Error('not found: '+path);return {path,uri:'file:///fixture/'+path,text:window.files[path],etag:etag(window.files[path])};}
   if(method==='languageApply'){const input=args[0];for(const c of input.changes){if(c.create){if(c.path in window.files)throw Error('exists');window.created.push(c.path);}else if(etag(window.files[c.path])!==c.etag)throw Error('etag');}
    const etags={};for(const c of input.changes){if(c.delete){delete window.files[c.path];continue;}window.files[c.path]=c.text;etags[c.path]=etag(c.text);}window.applied.push(input.label);return {etags};}
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

// ── Inline Method / Change Signature ─────────────────────────────────────────────────────────
// Method family simulated from text: `function NAME` declarations and `->NAME(`/`::NAME(` calls.
const methodServer = `window.languageMock=(method,input,newName)=>{
 const pos=(t,o)=>{const b=t.slice(0,o).split('\\n');return {line:b.length-1,character:b.at(-1).length};};
 const t=input.text;const off=t.split('\\n').slice(0,input.position.line).reduce((n,l)=>n+l.length+1,0)+input.position.character;
 let a=off;while(a>0&&/\\w/.test(t[a-1]))a--;const word=/^\\w+/.exec(t.slice(a))?.[0];if(!word)return null;
 const texts={...window.files};for(const m of window.monacoApi.editor.getModels()){const p=m.uri.path.replace('/fixture/','');if(p in texts)texts[p]=m.getValue();}
 const decl=Object.entries(texts).flatMap(([p,x])=>[...x.matchAll(new RegExp('function\\\\s+('+word+')\\\\s*\\\\(','g'))].map(m=>({path:p,text:x,o:m.index+m[0].indexOf(word)})));
 if(!decl.length||!/->|::/.test(t.slice(Math.max(0,a-3),a))&&!decl.some(d=>d.path===input.path&&d.o===a))return null;
 const loc=d=>({path:d.path,uri:'file:///fixture/'+d.path,range:{start:pos(d.text,d.o),end:pos(d.text,d.o+word.length)}});
 if(method==='phpMethodFamily')return {name:word,from:'call',owner:'App\\\\Cart',ownerName:'Cart',current:[loc(decl[0])],bases:[],members:decl.map(loc),implementations:[]};
 if(method==='phpMethodRename'){const changes={};for(const d of decl)(changes['file:///fixture/'+d.path]??=[]).push({range:loc(d).range,newText:newName,category:'declaration'});
  for(const [p,x] of Object.entries(texts))for(const m of x.matchAll(new RegExp('(->|::)\\\\s*('+word+')\\\\s*\\\\(','g'))){const o=m.index+m[0].indexOf(word,m[1].length);(changes['file:///fixture/'+p]??=[]).push({range:{start:pos(x,o),end:pos(x,o+word.length)},newText:newName,category:'call'});}
  return {changes};}
 return null;};`;
const cart = `<?php\n\nnamespace App;\n\nclass Cart\n{\n    public function total(int $qty): int\n    {\n        $price = $this->price();\n        return $price * $qty;\n    }\n\n    public function checkout(): int\n    {\n        $price = 3;\n        return $this->total($price) + 1;\n    }\n\n    private function price(): int\n    {\n        return 10;\n    }\n}\n`;
const shop = `<?php\n\nnamespace App;\n\n$cart = new Cart();\necho $cart->total(2);\n`;
scenario('inline-method', { 'src/Cart.php': cart, 'src/shop.php': shop }, async (page, h) => {
 await page.evaluate(methodServer);
 await h.open('src/Cart.php'); await h.caretAt('function total', 10);
 await page.keyboard.press('Alt+Meta+N'); await page.waitForSelector('.refactor-dialog');
 const radios = await page.locator('.refactor-dialog .refactor-radios label').allTextContents();
 assert.deepEqual(radios, ['Incorporar todas as chamadas e remover o método', 'Incorporar todas as chamadas e manter o método'], 'options on the declaration');
 await h.shot('inline-dialog');
 await page.locator('.refactor-dialog footer button[value=ok]').click();
 await page.waitForFunction(() => !window.monacoApi.editor.getModels().find(m => m.uri.path.endsWith('Cart.php')).getValue().includes('function total'), null, { timeout: 8000 });
 const after = await h.text();
 assert.ok(after.includes('        $price1 = $this->price();\n        return ($price1 * $price) + 1;'), 'call replaced by the body, colliding local renamed:\n' + after);
 const shopAfter = await page.evaluate(() => window.files['src/shop.php']);
 assert.ok(shopAfter.includes('$price = $cart->price();') || shopAfter === shop, 'outside call handled: ' + shopAfter);
 // On a call: the third option inlines only that occurrence.
 await h.caretAt('$this->price()', 8); await page.keyboard.press('Alt+Meta+N'); await page.waitForSelector('.refactor-dialog');
 assert.equal(await page.locator('.refactor-dialog .refactor-radios input:checked').getAttribute('value'), 'single');
 await page.locator('.refactor-dialog footer button[value=ok]').click(); await page.waitForTimeout(600);
 const single = await h.text(); assert.ok(single.includes('$price1 = 10;') && single.includes('function price'), 'single occurrence, method kept:\n' + single);
 await page.keyboard.press('Meta+z'); await page.waitForTimeout(200); assert.ok((await h.text()).includes('$price1 = $this->price();'), 'Cmd+Z undoes the single-file inline');
});
const greet = `<?php\n\nnamespace App;\n\nclass Greeter\n{\n    /**\n     * @param string $name who\n     */\n    public function greet(string $name, int $times = 1): string\n    {\n        return str_repeat("Hi $name", $times);\n    }\n\n    public function run(): string\n    {\n        return $this->greet('Ana', 2) . $this->greet('Bia');\n    }\n}\n`;
scenario('change-signature', { 'src/Greeter.php': greet }, async (page, h) => {
 await page.evaluate(methodServer);
 await h.open('src/Greeter.php'); await h.caretAt("greet('Ana'", 2);
 await page.keyboard.press('Meta+F6'); await page.waitForSelector('.refactor-signature');
 assert.equal(await page.locator('.refactor-signature input[name=name]').inputValue(), 'greet');
 assert.equal(await page.locator('.refactor-signature input[name=returnType]').inputValue(), 'string');
 assert.deepEqual(await page.locator('.refactor-signature .param-name').evaluateAll(i => i.map(x => x.value)), ['$name', '$times = 1']);
 assert.equal(await page.locator('.refactor-signature-preview').textContent(), 'greet(string $name, int $times = 1): string');
 // Rename the method and $name → $who, add bool $loud = false with call value true.
 await page.locator('.refactor-signature input[name=name]').fill('salute');
 await page.locator('.refactor-signature .param-name').first().fill('$who');
 await page.locator('.refactor-params-toolbar button[aria-label="Adicionar parâmetro"]').click();
 await page.locator('.refactor-signature .param-type').nth(2).fill('bool'); await page.locator('.refactor-signature .param-name').nth(2).fill('$loud'); await page.locator('.refactor-signature .param-call').nth(2).fill('true');
 assert.match(await page.locator('.refactor-signature .project-dialog-error').textContent(), /obrigatório depois de um opcional/, 'validation like the dialog');
 await page.locator('.refactor-signature .param-name').nth(2).fill('$loud = false');
 assert.equal(await page.locator('.refactor-signature-preview').textContent(), 'salute(string $who, int $times = 1, bool $loud = false): string');
 await h.shot('change-signature');
 await page.locator('.refactor-signature footer button[value=ok]').click(); await page.waitForTimeout(800);
 const after = await h.text();
 assert.ok(after.includes('public function salute(string $who, int $times = 1, bool $loud = false): string'), after);
 assert.ok(after.includes('str_repeat("Hi $who", $times)') && after.includes('@param string $who who'), 'body and PHPDoc follow the rename:\n' + after);
 assert.ok(after.includes("$this->salute('Ana', 2, true) . $this->salute('Bia', 1, true)"), 'call sites: Default written, skipped optional filled with its default:\n' + after);
 await page.keyboard.press('Meta+z'); await page.waitForTimeout(200); assert.equal(await h.text(), greet, 'Cmd+Z restores');
 // Moving a required parameter behind a call that omitted it: conflict in the preview.
 await h.caretAt('function greet', 10); await page.keyboard.press('Meta+F6'); await page.waitForSelector('.refactor-signature');
 await page.locator('.refactor-signature .param-name').nth(1).fill('$times'); await page.locator('.refactor-signature .param-name').nth(1).click();
 await page.locator('.refactor-params-toolbar button[aria-label="Mover para cima"]').click();
 await page.locator('.refactor-signature footer button[value=ok]').click(); await page.waitForSelector('.refactor-preview', { timeout: 8000 });
 assert.match(await page.locator('.refactor-conflict').first().textContent(), /sem valor para \$times/);
 await page.locator('.refactor-preview .cancel').click(); await page.waitForTimeout(200); assert.equal(await h.text(), greet);
});

// ── Inspections, quick-fix order and fixes that create files ─────────────────────────────────
const diagnostics = `window.languageMock=(method,input)=>{if(method!=='language')return null;const t=input.text;
 const pos=o=>{const b=t.slice(0,o).split('\\n');return {line:b.length-1,character:b.at(-1).length};};
 if(input.method==='php/diagnostics'){const out=[];for(const m of t.matchAll(/new (Invoice)\\(/g)){const o=m.index+4;out.push({range:{start:pos(o),end:pos(o+7)},code:'worse.unresolved_name',message:'Class "Invoice" not found',severity:1});}return {current:true,diagnostics:out};}
 if(input.method==='textDocument/diagnostic'){const o=t.indexOf("'welcome'");if(o<0)return [];return [{range:{start:pos(o),end:pos(o+9)},code:'laravel.view.missing',message:"View 'welcome' não encontrada em resources/views.",severity:'warning',fixes:[{title:'Criar resources/views/welcome.blade.php',create:{uri:'file:///fixture/resources/views/welcome.blade.php',path:'resources/views/welcome.blade.php',content:''}}]}];}
 if(input.method==='textDocument/codeAction')return [];
 return null;};`;
const shapes = `<?php\n\nnamespace App;\n\ninterface Shape {}\nclass Circle implements Shape {}\nclass User {}\n`;
const typed = `<?php\n\nnamespace App;\n\nclass Shop\n{\n    public function owner(): User\n    {\n        $c = new Circle();\n        return $c;\n    }\n}\n`;
scenario('inspections', { 'composer.json': JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }), 'src/models.php': shapes, 'src/Shop.php': typed }, async (page, h) => {
 await page.evaluate(diagnostics);
 await h.open('src/Shop.php'); await h.waitMarkers(1);
 const marker = await page.evaluate(() => monacoApi.editor.getModelMarkers({ owner: 'php-inspections' }).map(m => [m.startLineNumber, m.message]));
 assert.deepEqual(marker, [[10, 'Tipo de retorno incompatível: esperado User, encontrado Circle.']], 'inferred class mismatch through the variable');
 await h.caret(10, 16); await page.keyboard.press('Alt+Enter'); await page.waitForSelector('.action-widget', { timeout: 8000 }); await page.waitForTimeout(300);
 const items = await page.evaluate(() => [...document.querySelectorAll('.action-widget [role=option]')].map(o => o.textContent.trim()).filter(Boolean));
 assert.equal(items[0], 'Alterar tipo de retorno para Circle', 'inspection fix first: ' + items.join(' | '));
 const quick = items.filter(i => !/Incorporar|Extrair/.test(i)); assert.ok(/^Suprimir/.test(quick.at(-1)) && /^Suprimir/.test(quick.at(-2)), 'suppressions last among the quick fixes: ' + items.join(' | '));
 await h.shot('inspections-alt-enter');
 await page.keyboard.press('Enter'); await page.waitForTimeout(300);
 assert.ok((await h.text()).includes('public function owner(): Circle'));
});
const order = `<?php\n\nnamespace App\\Shop;\n\nclass Cart\n{\n    public function bill(): void\n    {\n        $x = new Invoice();\n    }\n}\n`;
scenario('create-class', { 'composer.json': JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }), 'src/Shop/Cart.php': order }, async (page, h) => {
 await page.evaluate(diagnostics);
 await h.open('src/Shop/Cart.php'); await h.waitMarkers(1);
 await h.caretAt('Invoice', 2); await page.keyboard.press('Alt+Enter'); await page.waitForSelector('.action-widget', { timeout: 8000 }); await page.waitForTimeout(300);
 const items = await page.evaluate(() => [...document.querySelectorAll('.action-widget [role=option]')].map(o => o.textContent.trim()).filter(Boolean));
 assert.equal(items[0], "Criar classe 'Invoice'", 'no import candidate: create class first: ' + items.join(' | '));
 await page.keyboard.press('Enter');
 await page.waitForFunction(() => 'src/Shop/Invoice.php' in window.files, null, { timeout: 8000 });
 assert.equal(await page.evaluate(() => window.files['src/Shop/Invoice.php']), '<?php\n\nnamespace App\\Shop;\n\nclass Invoice\n{\n\n}\n');
 await page.waitForFunction(() => monacoApi.editor.getEditors().some(e => e.getDomNode()?.closest('#editor') && e.getModel()?.uri.path.endsWith('/src/Shop/Invoice.php')), null, { timeout: 8000 });
 await h.shot('create-class');
 await page.locator('.refactor-toast button', { hasText: 'Desfazer' }).click();
 await page.waitForFunction(() => !('src/Shop/Invoice.php' in window.files), null, { timeout: 8000 });
});
scenario('plugin-create-fix', { 'routes/web.php': `<?php\n\nreturn view('welcome');\n` }, async (page, h) => {
 await page.evaluate(diagnostics);
 await h.open('routes/web.php'); await h.waitMarkers(1);
 await h.caretAt("'welcome'", 2); await page.keyboard.press('Alt+Enter'); await page.waitForSelector('.action-widget', { timeout: 8000 }); await page.waitForTimeout(300);
 const items = await page.evaluate(() => [...document.querySelectorAll('.action-widget [role=option]')].map(o => o.textContent.trim()).filter(Boolean));
 assert.equal(items[0], 'Criar resources/views/welcome.blade.php', 'plugin create fix offered: ' + items.join(' | '));
 await page.keyboard.press('Enter');
 await page.waitForFunction(() => 'resources/views/welcome.blade.php' in window.files, null, { timeout: 8000 });
});

// ── Paste imports and configurable exclusion ─────────────────────────────────────────────────
const billingSrc = `<?php\n\nnamespace App\\Billing;\n\nuse App\\Model\\User;\n\nclass Invoice {}\n\nfunction charge(User $u): Invoice\n{\n    return new Invoice();\n}\n`;
const shopSrc = `<?php\n\nnamespace App\\Shop;\n\nclass Cart {}\n`;
scenario('paste-imports', { 'src/Billing/charge.php': billingSrc, 'src/Shop/Cart.php': shopSrc }, async (page, h) => {
 await h.open('src/Billing/charge.php');
 await page.evaluate(() => { const e = monacoApi.editor.getEditors().find(e => e.getDomNode()?.closest('#editor')); const m = e.getModel(); const t = m.getValue(); const a = t.indexOf('function charge'); const b = t.indexOf('}\n', a) + 1; const s = m.getPositionAt(a), f = m.getPositionAt(b); e.setSelection(new monacoApi.Selection(s.lineNumber, s.column, f.lineNumber, f.column)); e.focus(); });
 await page.keyboard.press('Meta+c'); await page.waitForTimeout(150);
 await h.open('src/Shop/Cart.php'); await h.caret(6, 1); await page.keyboard.press('Meta+v');
 await page.waitForSelector('.refactor-dialog', { timeout: 5000 });
 const labels = await page.locator('.refactor-dialog label.refactor-check').allTextContents();
 assert.deepEqual(labels, ['App\\Billing\\Invoice', 'App\\Model\\User'], 'Ask: the classes to import, all checked');
 await h.shot('paste-imports');
 await page.locator('.refactor-dialog label.refactor-check input').nth(1).uncheck();
 await page.locator('.refactor-dialog footer button[value=ok]').click(); await page.waitForTimeout(300);
 const after = await h.text();
 assert.ok(after.includes('namespace App\\Shop;\n\nuse App\\Billing\\Invoice;\n\nclass Cart {}'), 'only the chosen import inserted:\n' + after);
 assert.ok(!after.includes('use App\\Model\\User'));
 await page.keyboard.press('Meta+z'); await page.waitForTimeout(150);
 assert.ok(!(await h.text()).includes('use App\\Billing\\Invoice;') && (await h.text()).includes('function charge'), 'Cmd+Z undoes the imports, keeps the paste');
});
scenario('exclusions', { 'src/Shop.php': `<?php\n\nnamespace App;\n\nclass Shop\n{\n    public function owner(): User\n    {\n        $c = new Circle();\n        return $c;\n    }\n}\n`, 'vendor/acme/shapes/models.php': shapes }, async (page, h) => {
 await page.evaluate(diagnostics);
 await h.open('src/Shop.php'); await h.waitMarkers(1);
 // Excluding the vendor package removes its classes from the hierarchy: no class verdict without it.
 await page.evaluate(() => monacoApi.editor.getEditors().find(e => e.getDomNode()?.closest('#editor')).getAction('php-ide.phpSettings').run());
 await page.waitForSelector('.refactor-settings'); await page.locator('.refactor-settings textarea').fill('vendor/acme');
 assert.equal(await page.locator('.refactor-settings input[name=paste]:checked').getAttribute('value'), 'ask', 'paste imports default: Ask');
 await h.shot('exclusions');
 await page.locator('.refactor-settings footer button[value=ok]').click();
 await page.waitForFunction(() => '.php-ide/php-intelligence.json' in window.files, null, { timeout: 5000 });
 assert.deepEqual(JSON.parse(await page.evaluate(() => window.files['.php-ide/php-intelligence.json'])), { excluded: ['vendor/acme'], pasteImports: 'ask' });
 await page.keyboard.type(' '); await page.waitForTimeout(1500);
 const left = await page.evaluate(() => monacoApi.editor.getModelMarkers({ owner: 'php-inspections' }).map(m => m.message));
 assert.deepEqual(left, [], 'excluded package: no class mismatch is asserted: ' + left);
});

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
let browser; const results = {}; const failures = [];
process.on('exit', () => server.kill('SIGKILL'));
try {
 await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (String(d).includes(String(port))) resolve(); }); server.once('exit', reject); });
 browser = process.argv.includes('--chromium') ? await chromium.launch({ headless: true, channel: 'chrome' }) : await webkit.launch({ headless: true });
 await mkdir(out, { recursive: true });
 // Warm-up: the first load triggers Vite's dependency optimization and a reload of the deps.
 { const warm = await browser.newPage(); await warm.goto(`http://127.0.0.1:${port}/node_modules/.vite/deps/monaco-editor.js`).catch(() => {}); await warm.goto(`http://127.0.0.1:${port}`).catch(() => {}); await warm.waitForTimeout(2500); await warm.close(); }
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
} finally { await browser?.close(); server.kill('SIGKILL'); }
