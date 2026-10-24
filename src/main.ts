import { mountImagePreview, isImagePath } from './image-preview';
import {mountFormatting} from './formatting';
import { mountSvgPreview, isSvgPath } from './svg-preview';
import { mountTreeGitStatus } from './tree-git-status';
import { isBashDocument } from '../shared/bash-document';
import { isDockerfilePath, isComposeDocument } from '../shared/docker-document';
import { registerDotenvLanguage } from './dotenv-language';
import { isEnvPath } from '../shared/env-document';
import { t as tr, msg, html } from './i18n';
import { fileIcon } from './file-icons';
import { showTabMenu } from './tab-menu';
import { mountDocker } from './docker-panel';
import { mountRecentProjects } from './recent-projects';
import { isPhpDeclaration } from './php-navigation';
import { mountUsages, askBaseMethod, chooseTarget } from './editor-usages';
import { mountPhpInsights } from './php-editor-insights';
import { mountMulticursor } from './editor-multicursor';
import { mountSearchEverywhere } from './search-everywhere';
import { mountEditorChanges } from './editor-changes';
import { editorColors, editorFont, editorRules } from './editor-theme';
import { mountTerminal } from './terminal-panel';
import { mountProjectActions } from './project-actions';
import { mountRefactorings } from './refactor-ui';
import { mountTests } from './test-panel';
import { mountComposer } from './composer-panel';
import { mountPluginLanguages } from './plugin-languages';
import { mountDebugger } from './debug-panel';
import * as monaco from 'monaco-editor';
import { installEditorWorkers } from './editor-workers';
import { installWebLanguages,webLanguage } from './web-languages';
import { WebProject } from './web-project';
import {frameworkTypes} from './framework-types';
import type { IdeApi, FileBuffer, LanguageMethod } from '../shared/contracts';
import './style.css';
import './workbench.css';
import './theme-surfaces.css';
import './tool-windows.css';
import './markdown-preview.css';
import { mountGit } from './git-panel';
import { mountDatabase } from './database-panel';
import { sqlConsole } from './sql-console';
import { mountAgent } from './agent-panel';
import { mountAppearance } from './appearance';
import { mountWorkbench } from './workbench';
import { mountPluginManager } from './plugin-manager';
import { mountWorkspaceSync } from './workspace-sync';
import { mountMarkdown } from './markdown-preview';
import { isMarkdownPath } from '../shared/markdown';
import { isIgnorePath } from '../shared/language/plugins/gitignore';
import { keymap } from './keymap';
declare global { interface Window { ide: IdeApi; } }
installEditorWorkers();
const webLanguages=installWebLanguages();
const api = window.ide;
document.querySelector('#app')!.innerHTML = html`<header><strong>PHP IDE</strong><span id="project"></span><button id="open">Abrir projeto</button><button id="appearance">Aparência</button><span class="muted">PHP IDE · prévia</span></header><main><aside><h3>Projeto</h3><nav id="tree"></nav></aside><section class="code"><div id="tabs"></div><div id="breadcrumbs" aria-label="Caminho do arquivo"></div><div id="navigation" role="toolbar" aria-label="Navegação de código"><button id="nav-back" disabled title="Voltar · Alt+←">←</button><button id="nav-forward" disabled title="Avançar · Alt+→">→</button><button id="definition" disabled>Declaração · F12</button><button id="references" disabled>Encontrar usos</button><button id="implementations" disabled>Implementações</button></div><div id="editor"></div></section><aside class="tools"><div class="switch"><button id="show-agent">Agente</button><button id="show-db">Bancos</button></div><div id="agent"></div><form id="db" hidden><h3>Conexão de banco</h3><label>Driver<select name="driver"><option value="postgres">PostgreSQL</option><option value="mysql">MySQL / MariaDB</option></select></label><label>Host<input name="host" value="localhost" required></label><label>Porta<input name="port" type="number" value="5432" required></label><label>Banco<input name="database" required></label><label>Usuário<input name="user" required></label><label>Senha<input name="password" type="password"></label><label><input name="tls" type="checkbox"> TLS com certificado válido</label><button>Testar e listar schemas</button><pre id="db-result"></pre><p>Oracle, SQL Server e Redis: planejados. Esta versão consulta metadados; não executa SQL livre.</p></form></aside></main><footer><span id="status">Abra um arquivo PHP para iniciar a análise.</span><span id="plugins" title="Plugins ativos neste projeto"></span><span id="cursor-position"></span></footer>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let statusAt = 0;
const status = (text: string) => { statusAt = Date.now(); $('status').textContent = text; };
// Progresso do servidor de linguagem não apaga logo a resposta de uma ação do usuário.
const backgroundStatus = (text: string) => { if (Date.now() - statusAt > 4000) $('status').textContent = text; };
const run = (fn: () => Promise<unknown>) => { void fn().catch(error => status(String(error.message ?? error))); };
const webProject=new WebProject(api,status);
window.addEventListener('ide-workspace-file-changed',event=>{if(/\.(?:[cm]?[jt]sx?|vue)$/.test((event as CustomEvent).detail.path))webProject.invalidate();});
monaco.editor.defineTheme('independent-dark', { base: 'vs-dark', inherit: true, rules: editorRules(false), colors: editorColors(false) });
const editor = monaco.editor.create($('editor'), { theme: 'independent-dark', automaticLayout: true, fontSize: editorFont.size, lineHeight: editorFont.lineHeight(editorFont.size), fontFamily: editorFont.family, codeLensFontFamily: editorFont.codeLensFamily, codeLensFontSize: editorFont.codeLensSize, bracketPairColorization: {enabled: false}, quickSuggestions: {other: true, comments: false, strings: true}, suggestOnTriggerCharacters: true, wordBasedSuggestions: 'off', minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 12 } });
editor.updateOptions({'semanticHighlighting.enabled':true});
mountMulticursor(editor,showCursor);
// Monaco stores bracket colors on models too; diff editors must not restore their defaults.
monaco.editor.onDidCreateModel(model=>model.updateOptions({bracketColorizationOptions:{enabled:false,independentColorPoolPerBracketType:false}}));
// Blade como linguagem própria: na linguagem `php` do Monaco o texto fora de <?php é HTML
// embutido e os providers PHP não são chamados ali.
monaco.languages.register({ id: 'blade', extensions: ['.blade.php'] });
monaco.languages.setLanguageConfiguration('blade', { comments: { blockComment: ['{{--', '--}}'] }, brackets: [['{{', '}}'], ['(', ')'], ['[', ']']], autoClosingPairs: [{ open: '{{', close: ' }}' }, { open: '(', close: ')' }, { open: '[', close: ']' }, { open: '"', close: '"' }, { open: "'", close: "'" }] });
monaco.languages.setMonarchTokensProvider('blade', { tokenizer: {
 root: [[/\{\{--/, 'comment', '@comment'], [/\{!!|\{\{/, 'delimiter', '@echo'], [/@[A-Za-z_]\w*/, 'keyword'], [/<\/?[\w\-.:]+/, 'tag'], [/[:\w-]+(?==)/, 'attribute.name'], [/"[^"]*"|'[^']*'/, 'attribute.value'], [/[^<@{"']+/, ''], [/./, '']],
 comment: [[/--\}\}/, 'comment', '@pop'], [/./, 'comment']],
 echo: [[/!!\}|\}\}/, 'delimiter', '@pop'], [/\$\w+/, 'variable'], [/'[^']*'|"[^"]*"/, 'string'], [/\w+/, 'identifier'], [/./, '']]
} });
// Arquivos ignore (.gitignore, .dockerignore, .git/info/exclude): comentários, negação e curingas.
monaco.languages.register({ id: 'ignore', aliases: ['Ignore'] });
monaco.languages.setLanguageConfiguration('ignore', { comments: { lineComment: '#' } });
monaco.languages.setMonarchTokensProvider('ignore', { tokenizer: { root: [[/^\s*#.*$/, 'comment'], [/^!/, 'keyword'], [/\*\*|[*?]|\[[^\]]*\]/, 'regexp'], [/\\./, 'string.escape'], [/[^*?[\\]+/, ''], [/./, '']] } });
registerDotenvLanguage();
const phpLike = ['php', 'blade'];
const languageFor = (path: string, text = '') => isSvgPath(path) ? 'xml' : isDockerfilePath(path) ? 'dockerfile' : isComposeDocument(path,text) ? 'yaml' : path.endsWith('.blade.php') ? 'blade' : path.endsWith('.php') ? 'php' : isMarkdownPath(path) ? 'markdown' : isIgnorePath(path) ? 'ignore' : isEnvPath(path) ? 'dotenv' : isBashDocument(path,text) ? 'shell' : undefined;
// Linguagens com navegação pelo backend: PHP/Blade (Phpactor + plugins) e Markdown (plugin).
const navigable = ['shell','dockerfile','yaml','dotenv', ...phpLike, 'markdown','javascript','typescript','vue'];
// virtual: console SQL (editável, não salvo em disco) ou DDL gerado (somente leitura).
type Buffer = { file: FileBuffer; model: monaco.editor.ITextModel; saved: string; virtual?: 'console' | 'ddl' | 'library' | 'image' };
const buffers = new Map<string, Buffer>();
const autosaveTimers = new Map<Buffer, ReturnType<typeof setTimeout>>();
const saving = new Map<Buffer, Promise<void>>();
let autosaveEnabled = true;
try { autosaveEnabled = localStorage.getItem('php-ide-autosave') !== 'false'; } catch { /* Default remains enabled. */ }
function scheduleAutosave(b: Buffer) {
 clearTimeout(autosaveTimers.get(b)); autosaveTimers.delete(b);
 if (!autosaveEnabled || b.virtual || b.model.isDisposed() || !dirty(b)) return;
 autosaveTimers.set(b, setTimeout(() => {
  autosaveTimers.delete(b);
  const path = [...buffers].find(([, value]) => value === b)?.[0];
  if (path && autosaveEnabled) void saveBuffer(path, b).catch(error => status(tr('Falha no salvamento automático. Use Salvar para tentar novamente: ') + path + ': ' + String(error)));
 }, 800));
}
function bufferChanged(model: monaco.editor.ITextModel) { tabs(); const b = [...buffers.values()].find(b => b.model === model); if (b) scheduleAutosave(b); }
window.addEventListener('ide-autosave-changed', () => {
 try { autosaveEnabled = localStorage.getItem('php-ide-autosave') !== 'false'; } catch { return; }
 for (const b of buffers.values()) scheduleAutosave(b);
});
const dirty = (b: Buffer) => !b.virtual && b.model.getValue() !== b.saved;
let active: string | undefined;
const gitPanel = mountGit(api, () => [...buffers.values()].some(dirty), async () => { editor.setModel(null); buffers.forEach(b => b.model.dispose()); buffers.clear(); active = undefined; opened.clear(); views.clear(); backStack.length=0;forwardStack.length=0;navigationButtons(); tabs(); await tree(); });
type Place = { path: string; line: number; column: number };
const backStack: Place[] = []; const forwardStack: Place[] = [];
const views = new Map<string, monaco.editor.ICodeEditorViewState>();
const opened = new Set<string>();
function place(): Place | undefined { const p = editor.getPosition(); return active && p ? { path: active, line: p.lineNumber, column: p.column } : undefined; }
function navigationButtons() { $<HTMLButtonElement>('nav-back').disabled = !backStack.length; $<HTMLButtonElement>('nav-forward').disabled = !forwardStack.length; }
function remember(previous: Place | undefined) { if (!previous) return; const next = place(); if (next && JSON.stringify(next) !== JSON.stringify(previous)) { const last = backStack.at(-1); if (JSON.stringify(last) !== JSON.stringify(previous)) backStack.push(previous); if (backStack.length > 100) backStack.shift(); forwardStack.length = 0; navigationButtons(); } }
function tabs() {
 document.querySelector('.code')!.classList.toggle('has-document',!!active);
 document.querySelectorAll<HTMLButtonElement>('#tree button').forEach(button=>button.classList.toggle('selected',button.dataset.path===active));
 const language = editor.getModel()?.getLanguageId() ?? '';
 $<HTMLButtonElement>('definition').disabled = !navigable.includes(language);
 $<HTMLButtonElement>('references').disabled=!(phpLike.includes(language)||webLanguage(language));
 $<HTMLButtonElement>('implementations').disabled=!(phpLike.includes(language)||language==='vue');
 $('breadcrumbs').textContent = active ? active.split('/').join('  ›  ') : tr('Selecione um arquivo no projeto');
 $('tabs').replaceChildren(...[...opened].filter(path => buffers.has(path)).map(path => {
  const b = buffers.get(path)!; const tab = document.createElement('div'); tab.className = 'file-tab';
  const button = document.createElement('button'); button.textContent = path.split('/').pop()! + (dirty(b) ? ' •' : ''); button.title = path; button.className = path === active ? 'active' : ''; button.dataset.ext = path.split('.').pop(); button.prepend(fileIcon(path,false,b.model.getValue())); button.onclick = () => activate(path);
  for(const entry of $('tree').querySelectorAll<HTMLButtonElement>('button[data-path]')) if(entry.dataset.path===path){const icon=fileIcon(path,false,b.model.getValue());if(entry.firstElementChild?.getAttribute('data-icon')!==icon.dataset.icon)entry.firstElementChild?.replaceWith(icon);}
  const close = document.createElement('button'); close.textContent = '×'; close.className = 'close-tab'; close.setAttribute('aria-label', tr('Fechar ') + path); close.onclick = () => closeFile(path);
  // Prevent WebView autoscroll; close only on release, through the same dirty-buffer guard.
  tab.onmousedown = event => { if (event.button === 1) event.preventDefault(); };
  tab.onauxclick = event => { if (event.button === 1) { event.preventDefault(); closeFile(path); } };
  tab.oncontextmenu = event => {
   event.preventDefault();
   const rect = tab.getBoundingClientRect();
   showTabMenu(tab, event.clientX || rect.left, event.clientY || rect.bottom, scope => {
    const targets = scope === 'this' ? [path] : [...opened].filter(item => scope === 'all' || item !== path);
    for (const target of targets) closeFile(target);
   });
  };
  tab.append(button, close); return tab;
 }));
}
function closeFile(path: string) {
 const b = buffers.get(path); if (!b) return;
 if (dirty(b)) { status(tr('Salve as alterações antes de fechar esta aba.')); return; }
 opened.delete(path);
 if (active === path) { const next = [...opened].at(-1); if (next) activate(next); else { editor.setModel(null); active = undefined; } }
 if(!webProject.retain(b.model))b.model.dispose(); buffers.delete(path); views.delete(path); tabs();
}
// Trocar de modelo não emite evento de cursor; atualizar a barra também ao ativar arquivo.
function showCursor() { if (active && buffers.get(active)?.virtual === 'image') { $('cursor-position').textContent = ''; return; } const p = editor.getPosition(); const count=editor.getSelections()?.length??0;const multiple=count>1?msg`${count} cursores`+' · ':'';const column=editor.getOption(monaco.editor.EditorOption.columnSelection)?tr('Seleção em coluna')+' · ':'';$('cursor-position').textContent = p ? `${column}${multiple}Ln ${p.lineNumber}, Col ${p.column} · UTF-8` : ''; }
function activate(path: string, track = true) {
 const previous = place(); if(active) { const view = editor.saveViewState(); if(view) views.set(active, view); }
 active = path; opened.add(path); editor.setModel(buffers.get(path)!.model); editor.updateOptions({ readOnly: ['ddl','library','image'].includes(buffers.get(path)!.virtual??'') }); if(views.has(path)) editor.restoreViewState(views.get(path)!); showCursor(); tabs(); if (buffers.get(path)!.virtual === 'image') document.querySelector<HTMLElement>('#image-preview .image-viewport')?.focus(); else editor.focus(); if(track) remember(previous);
}
async function open(path: string, track = true) {
 if(frameworkTypes[path]){const key='library:'+path;virtual(key,frameworkTypes[path],'typescript','library',monaco.Uri.file(path));activate(key,track);return;}
 if (isImagePath(path)) {
  if (!buffers.has(path)) virtual(path, '', 'plaintext', 'image', monaco.Uri.from({ scheme: 'php-ide-image', path: '/' + path }));
  activate(path, track); return;
 }
 if (buffers.get(path)?.virtual) { activate(path, track); return; }
 const file = await api.read(path);
 if (!buffers.has(file.path)) { const uri=monaco.Uri.parse(file.uri);const model = monaco.editor.getModel(uri)??monaco.editor.createModel(file.text, languageFor(file.path,file.text),uri);webProject.claim(model);if(model.getValue()!==file.text)model.setValue(file.text); buffers.set(file.path,{file,model,saved:file.text}); model.onDidChangeContent(() => bufferChanged(model)); }
 activate(file.path, track);
 if(webLanguage(editor.getModel()!.getLanguageId()))run(()=>webProject.prepare());
 if (phpLike.includes(languageFor(file.path,file.text) ?? '')) {
  status(tr('Preparando análise PHP…'));
  const model = buffers.get(file.path)!.model;
  void request('textDocument/hover', model, new monaco.Position(1,1)).then(() => { if(editor.getModel()===model) status(tr('Análise PHP pronta · ⌘/Ctrl+clique: declaração · Ctrl+Espaço: autocomplete')); }).catch(error => status(String(error)));
 } else if (languageFor(file.path,file.text) === 'markdown') status(tr('Markdown · ⌘/Ctrl+Shift+V: editor/dividido/prévia · ⌘/Ctrl+clique: abrir link · ⌘/Ctrl+Shift+O: títulos'));
}
monaco.editor.registerEditorOpener({openCodeEditor: async (_source,resource,selection) => {
 if(resource.scheme === 'php-ide-ddl' || resource.scheme === 'php-ide-console' || resource.scheme === 'phar') {
  const key = [...buffers].find(([,b]) => b.model.uri.toString() === resource.toString())?.[0]; if (!key) return false;
  const previous = place(); activate(key, false);
  if (selection && 'startLineNumber' in selection) { editor.setSelection(selection); editor.revealRangeInCenter(selection); } else if (selection) { editor.setPosition(selection); editor.revealPositionInCenter(selection); }
  remember(previous); return true;
 }
 if(resource.scheme !== 'file')return false;
 const previous = place(); await open(resource.fsPath, false);
 if(selection){if('startLineNumber' in selection){editor.setSelection(selection);editor.revealRangeInCenter(selection);}else{editor.setPosition(selection);editor.revealPositionInCenter(selection);}}
 remember(previous); return true;
}});
async function travel(back: boolean) {
 const source = back ? backStack : forwardStack; const destination = back ? forwardStack : backStack; const target = source.at(-1); if(!target)return;
 const current = place(); await open(target.path, false); editor.setPosition({ lineNumber: target.line, column: target.column }); editor.revealPositionInCenter({ lineNumber: target.line, column: target.column }); source.pop(); if(current)destination.push(current); navigationButtons();
}
$('nav-back').onclick = () => run(() => travel(true)); $('nav-forward').onclick = () => run(() => travel(false));
// Alt+←/→ e ⌘B/Ctrl+B: ações nav.back/nav.forward/nav.declaration do keymap central (workbench.ts).
// Resolve the clicked position directly; do not depend on an earlier hover link.
let navigationPending = false;
function nameInRange(model: monaco.editor.ITextModel | null, range: monaco.IRange, name: string): monaco.Range | undefined {
 if (!model || !/^\w+$/.test(name)) return undefined; const from = model.getOffsetAt({lineNumber:range.startLineNumber,column:range.startColumn}); const to = Math.max(model.getOffsetAt({lineNumber:range.endLineNumber,column:range.endColumn}), model.getOffsetAt({lineNumber:range.startLineNumber,column:model.getLineMaxColumn(range.startLineNumber)}));
 if (to - from === name.length) return undefined;
 const match = new RegExp(`(?<![\\w$])${name}(?!\\w)`, 'i').exec(model.getValue().slice(from, to)); if (!match) return undefined;
 const start = model.getPositionAt(from + match.index); return new monaco.Range(start.lineNumber, start.column, start.lineNumber, start.column + name.length);
}
async function navigateDefinition(position: monaco.Position) {
 const model = editor.getModel(); if (!model || navigationPending) return;
 const word = model.getWordAtPosition(position);
 if(word && phpLike.includes(model.getLanguageId()) && isPhpDeclaration(model.getValue(), model.getOffsetAt({lineNumber:position.lineNumber,column:word.startColumn}))) { await usages.show(position,{single:'jump'}); return; }
 navigationPending = true;
 try {
  const targets = await locations('textDocument/definition', model, position);
  if (editor.getModel() !== model || !targets.length) return;
  if (targets.length > 1) { editor.setPosition(position); editor.trigger('navigation','editor.action.peekDefinition',{}); return; }
  const previous = place(); const target = targets[0];
  const virtualKey = [...buffers].find(([, b]) => b.model.uri.toString() === target.uri.toString())?.[0];
  await open(virtualKey ?? target.uri.fsPath, false);
  // O servidor devolve o nó da declaração (ex.: `public function label…`); o cursor vai ao nome, como na referência.
  const landed = word ? nameInRange(editor.getModel(), target.range, word.word) : undefined;
  editor.setSelection(landed ?? target.range); editor.revealRangeInCenter(landed ?? target.range); remember(previous);
 } finally { navigationPending = false; }
}
// A navigation gesture is a completed click, never a press or a text-selection drag.
let navigationPress: { x:number; y:number; model:monaco.editor.ITextModel; position:monaco.Position; dragged:boolean } | undefined;
$('editor').addEventListener('mousedown', event => {
 navigationPress=undefined;
 if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.button !== 0) return;
 const target=editor.getTargetAtClientPoint(event.clientX,event.clientY);const model=editor.getModel();
 if(model&&target?.position&&target.type===monaco.editor.MouseTargetType.CONTENT_TEXT)navigationPress={x:event.clientX,y:event.clientY,model,position:target.position,dragged:false};
},true);
document.addEventListener('mousemove',event=>{if(navigationPress&&Math.hypot(event.clientX-navigationPress.x,event.clientY-navigationPress.y)>4)navigationPress.dragged=true;},true);
document.addEventListener('mouseup',event=>{
 const press=navigationPress;navigationPress=undefined;
 if(!press||press.dragged||event.button!==0||!(event.ctrlKey||event.metaKey)||event.shiftKey||event.altKey||editor.getModel()!==press.model||!$('editor').contains(event.target as Node)||Math.hypot(event.clientX-press.x,event.clientY-press.y)>4)return;
 event.preventDefault();event.stopImmediatePropagation();editor.focus();editor.setPosition(press.position);run(()=>navigateDefinition(press.position));
},true);
window.addEventListener('blur',()=>{navigationPress=undefined;});
$('editor').addEventListener('contextmenu', event => { if(event.ctrlKey || event.metaKey) event.preventDefault(); }, true);
const consoleUi = sqlConsole(api, editor, { virtual, open: path => open(path), status });
mountMarkdown(api, editor, { path: () => active, status, open: async (path, line) => {
 const previous = place(); await open(path, false);
 if (line !== undefined) { editor.setPosition({ lineNumber: line + 1, column: 1 }); editor.revealLineNearTop(line + 1); }
 remember(previous);
} });
const databasePanel = mountDatabase(api, { openConsole: session => run(() => consoleUi.open(session)), disconnected: id => consoleUi.forget(id) });
mountAppearance(editor);
mountSvgPreview(editor,{path:()=>active});
const imagePreview = mountImagePreview(editor, api, { path: () => active });
// `expanded`: diretórios reabertos ao recarregar a árvore depois de ações de arquivo.
async function tree(path = '', parent: HTMLElement = $('tree'), expanded?: Set<string>) {
 const entries = await api.tree(path);
 const pending: {path:string;button:HTMLElement}[]=[];
 parent.replaceChildren();
 for (const entry of entries) {
  if (entry.directory) { const details = document.createElement('details'); details.dataset.path = entry.path; const summary = document.createElement('summary'); const label=document.createElement('span');label.className='resource-name';label.textContent=entry.name;summary.append(fileIcon(entry.path,true),label); summary.dataset.path = entry.path; details.append(summary); const children = document.createElement('div'); details.append(children); details.ontoggle = () => { if (details.open) run(() => tree(entry.path,children,expanded)); }; parent.append(details); if (expanded?.has(entry.path)) details.open = true; }
  else { const button = document.createElement('button'); const label=document.createElement('span');label.className='resource-name';label.textContent=entry.name;button.append(fileIcon(entry.path),label); button.setAttribute('aria-label',entry.name); button.dataset.ext=entry.name.split('.').pop(); button.dataset.path=entry.path; button.onclick = () => run(() => open(entry.path)); parent.append(button);if(/\.php$/i.test(entry.path)&&!/\.blade\.php$/i.test(entry.path))pending.push({path:entry.path,button}); }
 }
 // Only visible directory entries, with bounded reads; never scan vendor recursively for icons.
 let next=0;
 void Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{while(next<pending.length){const item=pending[next++];if(!item.button.isConnected)continue;try{const text=buffers.get(item.path)?.model.getValue()??(await api.read(item.path)).text;if(item.button.isConnected)item.button.firstElementChild?.replaceWith(fileIcon(item.path,false,buffers.get(item.path)?.model.getValue()??text));}catch{/* Unreadable files keep the generic PHP icon. */}}}));
}
/** Buffer sem arquivo: reaproveita o modelo e atualiza o conteúdo gerado. */
function virtual(path: string, text: string, language: string, kind: 'console' | 'ddl' | 'library' | 'image', uri: monaco.Uri) {
 const existing = buffers.get(path);
 if (existing) { if (kind === 'ddl' && existing.model.getValue() !== text) { existing.model.setValue(text); existing.saved = text; } return existing.model; }
 const model = monaco.editor.getModel(uri)??monaco.editor.createModel(text, language, uri);webProject.claim(model);
 buffers.set(path, { file: { path, uri: uri.toString(), text, etag: '' }, model, saved: text, virtual: kind }); model.onDidChangeContent(() => bufferChanged(model));
 return model;
}
async function saveBuffer(path: string, b: Buffer): Promise<void> {
 const pending = saving.get(b);
 if (pending) { await pending; if (dirty(b)) return saveBuffer(path, b); return; }
 if (b.virtual || b.model.isDisposed() || buffers.get(path) !== b || !dirty(b)) return;
 const text = b.model.getValue();
 const operation = (async () => {
  status(tr('Salvando…'));
  b.file.etag = await api.save(path, text, b.file.etag); b.saved = text;
  tabs(); phpInsights.refresh(); status(tr('Arquivo salvo') + ': ' + path);
 })();
 saving.set(b, operation);
 try { await operation; } finally { saving.delete(b); }
 if (dirty(b)) scheduleAutosave(b);
 await editorChanges.refresh();
}
async function save() {
 if (!active) return;
 const b = buffers.get(active)!;
 if (b.virtual) { status(b.virtual === 'image' ? tr('Imagem: somente visualização.') : b.virtual === 'library' ? tr('Declaração de biblioteca: somente leitura.') : b.virtual === 'ddl' ? tr('DDL gerado: somente leitura.') : tr('O console não é salvo em disco; execute com ⌘/Ctrl+Enter.')); return; }
 await saveBuffer(active, b);
}
async function request(method: LanguageMethod, model: monaco.editor.ITextModel, position: monaco.Position): Promise<any> {
 const b = [...buffers.values()].find(b => b.model === model);
 if (!b) return null; // Read-only diff models are not workspace buffers.
 return api.language({method,path:b.file.path,text:model.getValue(),version:model.getVersionId(),position:{line:position.lineNumber-1,character:position.column-1}});
}
const range = (r: any) => ({startLineNumber:r.start.line+1,startColumn:r.start.character+1,endLineNumber:r.end.line+1,endColumn:r.end.character+1});
async function locations(method: LanguageMethod, model: monaco.editor.ITextModel, pos: monaco.Position) {
 const label = method === 'textDocument/references' ? 'usos' : method === 'textDocument/implementation' ? tr('implementações') : tr('declarações');
 status(`Buscando ${label}…`);
 let result;
 try { result = webLanguage(model.getLanguageId())?await webLanguages.locations(model,pos,method):await request(method,model,pos); } catch(error) { status(msg`Falha ao buscar ${label}: ${String(error)}`); throw error; }
 if (method === 'textDocument/definition' && model.getLanguageId() === 'php') result = await phpInsights.refineDefinition(model, pos, result); // traits com insteadof/as
 const values = result ? Array.isArray(result) ? result : [result] : [];
 const output = await toLocations(values);
 status(output.length ? `${output.length} resultado(s) de ${label}` : msg`Nenhum resultado de ${label} neste ponto`); return output;
}
/** Resultado LSP (Location/LocationLink) → locais do Monaco, abrindo buffers dos arquivos alvo. */
async function toLocations(values: any[]) {
 const output: {uri: monaco.Uri; range: monaco.IRange}[] = [];
 for (const item of values) { const uri = monaco.Uri.parse(item.uri ?? item.targetUri);
  if (uri.scheme === 'php-ide-ddl' && typeof item.content === 'string') { virtual(`ddl${decodeURIComponent(uri.path)}`, item.content, 'sql', 'ddl', uri); output.push({uri,range:range(item.range)}); continue; }
  // Stubs nativos do Phpactor (phar://) abrem como biblioteca somente leitura.
  if (uri.scheme === 'phar') { try { const stub = await api.languageStub(uri.toString()); virtual('library:'+uri.toString(), stub.text, 'php', 'library', uri); output.push({uri,range:range(item.range ?? item.targetSelectionRange)}); } catch(error) { status(msg`Stub nativo indisponível: ${String(error)}`); } continue; }
  if (uri.scheme !== 'file') continue;
  if(frameworkTypes[uri.fsPath]){virtual('library:'+uri.fsPath,frameworkTypes[uri.fsPath],'typescript','library',uri);output.push({uri,range:range(item.range ?? item.targetSelectionRange)});continue;}
  const file = await api.read(uri.fsPath); if (!buffers.has(file.path)) { const m = monaco.editor.getModel(uri)??monaco.editor.createModel(file.text,languageFor(file.path,file.text),uri);webProject.claim(m); buffers.set(file.path,{file,model:m,saved:file.text}); m.onDidChangeContent(() => bufferChanged(m)); }
  // Referência a arquivo (string com caminho) abre o arquivo na última posição conhecida.
  const kept = item.preserveView ? views.get(file.path)?.cursorState[0]?.position : undefined;
  output.push({uri,range:kept?{startLineNumber:kept.lineNumber,startColumn:kept.column,endLineNumber:kept.lineNumber,endColumn:kept.column}:range(item.range ?? item.targetSelectionRange)});
 } return output;
}
const usages = mountUsages(editor, {
 status,
 find: async (model, position, options) => await phpFamilyUsages(model, position, !options.lens) ?? locations('textDocument/references', model, position),
 open: async target => { const previous = place(); await open(target.uri.fsPath, false); editor.setSelection(target.range); editor.revealRangeInCenter(target.range); remember(previous); },
});
// Recorte 29: métodos com hierarquia (usos atual/base, implementações) pelo índice próprio + Phpactor.
type FamilyApi = { phpMethodFamily(input: unknown): Promise<any>; phpMethodUsages(input: unknown, scope: 'current' | 'base'): Promise<any[] | null> };
const phpInput = (model: monaco.editor.ITextModel, position: monaco.Position) => { const b = [...buffers.values()].find(b => b.model === model); return b ? {path:b.file.path,text:model.getValue(),version:model.getVersionId(),position:{line:position.lineNumber-1,character:position.column-1}} : undefined; };
/** `ask`: pergunta atual × base (ações); CodeLens usa o método atual sem diálogo. */
async function phpFamilyUsages(model: monaco.editor.ITextModel, position: monaco.Position, ask = true) {
 const input = model.getLanguageId() === 'php' ? phpInput(model, position) : undefined; if (!input) return undefined;
 const family = await (api as unknown as FamilyApi).phpMethodFamily(input).catch(() => null); if (!family) return undefined;
 let scope: 'current' | 'base' = 'current';
 if (family.bases.length && ask) { const base = family.bases[0]; const choice = await askBaseMethod(family.name, family.ownerName, base.name, !!base.isAbstract); if (!choice) return null; scope = choice; }
 const found = await (api as unknown as FamilyApi).phpMethodUsages(input, scope); if (!found) return undefined;
 const output = await toLocations(found); status(msg`${output.length} uso(s) de ${family.name}() (${scope === 'base' ? tr('método base') : tr('método atual')})`); return output;
}
async function phpImplementations(model: monaco.editor.ITextModel, position: monaco.Position) {
 const input = phpInput(model, position); if (!input) return false;
 const family = await (api as unknown as FamilyApi).phpMethodFamily(input).catch(() => null); if (!family) return false;
 const targets = family.implementations as any[];
 if (!targets.length) { status(msg`Nenhuma implementação de ${family.name}() encontrada`); return true; }
 const go = async (t: any) => { const [target] = await toLocations([t]); if (!target) return; const previous = place(); await open(target.uri.fsPath, false); editor.setSelection(target.range); editor.revealRangeInCenter(target.range); remember(previous); };
 if (targets.length === 1) { await go(targets[0]); return true; }
 const chosen = await chooseTarget(editor, msg`Escolher implementação de ${family.owner}::${family.name} (${targets.length} encontradas)`, targets.map(t => ({ ...t, label: t.name + (t.isAbstract ? ' (abstrato)' : ''), detail: t.path })));
 if (chosen) await go(chosen); return true;
}
const editorChanges = mountEditorChanges(api, editor, {path: () => active && !buffers.get(active)?.virtual ? active : undefined, status});
const phpInsights=mountPhpInsights(editor,{
 references:(model,position)=>request('textDocument/references',model,position),
 clean:()=>![...buffers.values()].some(b=>b.model.getLanguageId()==='php'&&dirty(b)),
 show:position=>{void usages.show(position,{lens:true});},
 request:(method,model,position)=>request(method,model,position),
 open:async target=>{const previous=place();await open(target.uri.fsPath,false);editor.setSelection(target.range);editor.revealRangeInCenter(target.range);remember(previous);},
 files:api,
});
monaco.languages.registerDefinitionProvider([...phpLike,'markdown'],{provideDefinition:(m,p)=>locations('textDocument/definition',m,p)});
monaco.languages.registerImplementationProvider(phpLike,{provideImplementation:(m,p)=>locations('textDocument/implementation',m,p)});
monaco.languages.registerReferenceProvider(phpLike,{provideReferences:(m,p)=>locations('textDocument/references',m,p)});
monaco.languages.registerHoverProvider(phpLike,{provideHover:async(m,p)=> { const v=await request('textDocument/hover',m,p); if(!v) return null; const contents=Array.isArray(v.contents)?v.contents:[v.contents]; return {contents:contents.map((x:any)=>({value:typeof x==='string'?x:x.value})),range:v.range?range(v.range):undefined}; }});
const lspKinds = ['Text','Method','Function','Constructor','Field','Variable','Class','Interface','Module','Property','Unit','Value','Enum','Keyword','Snippet','Color','File','Reference','Folder','EnumMember','Constant','Struct','Event','Operator','TypeParameter'] as const;
const completionKind = (kind: number) => monaco.languages.CompletionItemKind[lspKinds[kind - 1] ?? 'Text'] ?? monaco.languages.CompletionItemKind.Text;
monaco.languages.registerCompletionItemProvider(phpLike,{triggerCharacters:['>','$',':','\\',"'",'"','.'],resolveCompletionItem:async(item)=> { const source = (item as any).__source; if(!source) return item; try { const v:any = await api.language({...source.input, method:'completionItem/resolve', completionItem:source.item}); return {...item, detail:v?.detail ?? item.detail, documentation:v?.documentation?.value ? {value:v.documentation.value} : v?.documentation ?? item.documentation}; } catch { return item; } }, provideCompletionItems:async(m,p)=> { let v:any; try { v=await request('textDocument/completion',m,p); } catch(error) { status(msg`Autocomplete PHP indisponível: ${String(error)}`); return {suggestions:[]}; } const word=m.getWordUntilPosition(p); const items=Array.isArray(v)?v:v?.items??[];
 return {incomplete:!Array.isArray(v)&&!!v?.isIncomplete,suggestions:items.map((i:any)=>({__source:{item:i,input:{path:[...buffers.values()].find(b=>b.model===m)?.file.path,text:m.getValue(),version:m.getVersionId(),position:{line:p.lineNumber-1,character:p.column-1}}},label:{label:i.label,detail:i.labelDetails?.detail,description:i.labelDetails?.description},kind:i.phpDeclarationKind==='trait'?monaco.languages.CompletionItemKind.Struct:completionKind(i.kind),detail:i.detail,documentation:i.documentation?.value?{value:i.documentation.value}:i.documentation,filterText:i.filterText,sortText:i.sortText,insertText:i.textEdit?.newText??i.insertText??i.label,insertTextRules:i.insertTextFormat===2?monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet:undefined,range:i.textEdit?.insert?{insert:range(i.textEdit.insert),replace:range(i.textEdit.replace)}:i.textEdit?range(i.textEdit.range):{startLineNumber:p.lineNumber,endLineNumber:p.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn},additionalTextEdits:i.additionalTextEdits?.map((e:any)=>({range:range(e.range),text:e.newText}))}))}; }});
// Markdown: caminhos relativos após `](` e âncoras após `#`, respondidos pelo plugin.
monaco.languages.registerCompletionItemProvider('markdown',{triggerCharacters:['(','/','#'],provideCompletionItems:async(m,p)=> {
 let v:any; try { v=await request('textDocument/completion',m,p); } catch(error) { status(msg`Sugestões Markdown indisponíveis: ${String(error)}`); return {suggestions:[]}; }
 return {suggestions:(v?.items??[]).map((i:any)=>({label:i.label,kind:i.phpDeclarationKind==='trait'?monaco.languages.CompletionItemKind.Struct:completionKind(i.kind),detail:i.detail,filterText:i.filterText,sortText:i.sortText,insertText:i.textEdit?.newText??i.label,range:range(i.textEdit.range)}))};
}});
// Arquivos ignore: caminhos do projeto e padrões comuns, respondidos pelo plugin.
monaco.languages.registerCompletionItemProvider('ignore',{triggerCharacters:['/','!','.'],provideCompletionItems:async(m,p)=> {
 let v:any; try { v=await request('textDocument/completion',m,p); } catch(error) { status(msg`Sugestões de .gitignore indisponíveis: ${String(error)}`); return {suggestions:[]}; }
 return {suggestions:(v?.items??[]).map((i:any)=>({label:i.label,kind:i.phpDeclarationKind==='trait'?monaco.languages.CompletionItemKind.Struct:completionKind(i.kind),detail:i.detail,filterText:i.filterText,sortText:i.sortText,insertText:i.textEdit?.newText??i.label,range:range(i.textEdit.range),...(i.kind===19?{command:{id:'editor.action.triggerSuggest',title:''}}:{})}))};
}});
editor.onDidChangeModel(()=> { const uri=editor.getModel()?.uri.toString(); const entry=[...buffers].find(([,b])=>b.model.uri.toString()===uri); if(entry){active=entry[0];tabs();} });
editor.onDidChangeCursorPosition(showCursor);
mountFormatting(editor,api,{path:()=>active&&!buffers.get(active)?.virtual?active:undefined,status});
keymap.registerAction({id:'file.save',label:'Salvar arquivo',category:'Arquivo',aliases:'save gravar',defaults:{mac:'Meta+S',other:'Ctrl+S'},enabled:()=>!!active,run:()=>run(save)});
$('references').onclick=()=>run(()=>usages.show());
// ⌘B em PHP: Declaration or Usages (declaração leva aos usos; uso único navega direto).
for(const [id,action] of [['definition','editor.action.revealDefinition'],['implementations','editor.action.goToImplementation']]) $(id).onclick=()=>run(async()=>{editor.focus();const model=editor.getModel(),position=editor.getPosition();if(id==='definition'&&model&&position&&phpLike.includes(model.getLanguageId())){await navigateDefinition(position);return;}if(id==='implementations'&&model&&position&&model.getLanguageId()==='php'&&await phpImplementations(model,position))return;editor.trigger('navigation-toolbar',action,{});});
async function chooseProject(path?: string): Promise<boolean> { if([...buffers.values()].some(dirty)){throw Error(tr('Salve os arquivos alterados antes de trocar de projeto.'));} const info=path ? await api.openRecentProject(path) : await api.openProject(); if(info){webProject.reset();gitPanel.reset();databasePanel.reset();consoleUi.reset();agentPanel.reset();terminalPanel.reset();dockerPanel.reset();testPanel.reset();composerPanel.reset();debugPanel.reset();backStack.length=0;forwardStack.length=0;opened.clear();views.clear();navigationButtons();editor.setModel(null);buffers.forEach(b=>b.model.dispose());buffers.clear();active=undefined;tabs();$('project').textContent=info.name;await tree();showPlugins();return true;} return false; }
$('show-agent').onclick=()=>{$('agent').hidden=false;$('db').hidden=true;};
$('show-db').onclick=()=>{$('agent').hidden=true;$('db').hidden=false;};
const agentPanel = mountAgent(api, $('agent'), {
 context: () => { const b = active ? buffers.get(active) : undefined; if (!b || b.virtual) return undefined; const selection = editor.getSelection(); const selected = selection && !selection.isEmpty() ? b.model.getValueInRange(selection) : undefined; return { path: b.file.path, text: b.model.getValue(), ...(selected ? { selection: selected } : {}) }; },
 reload: async paths => { webProject.invalidate();for (const path of paths) { const b = buffers.get(path); if (!b || dirty(b)) continue; if (b.virtual === 'image') { imagePreview.reload(); continue; } const file = await api.read(path); b.file = file; b.saved = file.text; b.model.setValue(file.text); } tabs(); },
 status, language: languageFor,
});
api.onEvent(event=>{if(event.type==='language')backgroundStatus(event.message);else if(event.type==='acp')agentPanel.handle(event.event);});
mountWorkbench(api);
await mountPluginManager(api).ready;
mountTreeGitStatus(api, $('tree'));
mountWorkspaceSync(api, buffers, { tabs, status, editor, active: () => active });
mountSearchEverywhere(api,editor,async(path,line,column)=>{await open(path);if(line){editor.setPosition({lineNumber:line,column:column??1});editor.revealLineInCenter(line);}});
mountRecentProjects(api, chooseProject);
const terminalPanel=mountTerminal(api);
const affected = (prefix: string) => [...buffers.keys()].filter(path => (!buffers.get(path)!.virtual || buffers.get(path)!.virtual === 'image') && (!prefix || path === prefix || path.startsWith(prefix + '/')));
// Rename Symbol, quick fixes/autoimport, inspeções e Extract/Inline (recorte 19).
const refactorings = mountRefactorings(api, editor, {
 status,
 pathOf: model => [...buffers].find(([, b]) => b.model === model && !b.virtual)?.[0],
 buffer: path => { const b = buffers.get(path); return b && !b.virtual ? { model: b.model, dirty: dirty(b) } : undefined; },
 saved: (path, text, etag) => { const b = buffers.get(path); if (b) { b.saved = text; b.file.etag = etag; tabs(); } },
 relocateFile: (path, target) => projectActions.relocateFile(path, target),
});
const projectActions = mountProjectActions(api, {
 status, language: languageFor, refactor: refactorings,
 refresh: async () => { const expanded = new Set([...document.querySelectorAll<HTMLElement>('#tree details[open]')].map(d => d.dataset.path!)); await tree('', $('tree'), expanded); tabs(); },
 open: async (path, line, column) => { const previous = place(); await open(path, false); if (line) { editor.setPosition({ lineNumber: line, column: column ?? 1 }); editor.revealPositionInCenter({ lineNumber: line, column: column ?? 1 }); } remember(previous); },
 dirtyUnder: path => affected(path).some(p => dirty(buffers.get(p)!)),
 // Abas de arquivos renomeados/movidos reabrem no novo caminho; excluídos fecham.
 relocate: async (from, to) => {
  const map = (path: string) => to === undefined ? undefined : to + path.slice(from.length); const was = active; const reopen: string[] = [];
  for (const path of affected(from)) { if (opened.has(path)) reopen.push(path); opened.delete(path); views.delete(path); buffers.get(path)!.model.dispose(); buffers.delete(path); }
  if (active && !buffers.has(active)) { editor.setModel(null); active = undefined; }
  for (const stack of [backStack, forwardStack]) for (let i = stack.length - 1; i >= 0; i--) { const path = stack[i].path; if (path !== from && !path.startsWith(from + '/')) continue; const next = map(path); if (next) stack[i] = { ...stack[i], path: next }; else stack.splice(i, 1); }
  navigationButtons();
  for (const path of reopen) { const next = map(path); if (next) await open(next, false).catch(() => {}); }
  const target = was && map(was); if (target && buffers.has(target)) activate(target, false); else if (!active) { const next = [...opened].at(-1); if (next) activate(next, false); }
  tabs();
 },
 reload: async path => { const b = buffers.get(path); if (!b || dirty(b)) return; if (b.virtual === 'image') { imagePreview.reload(); return; } const file = await api.read(path); b.file = file; b.saved = file.text; b.model.setValue(file.text); tabs(); },
 findUsages: async (path, line, column) => { await open(path); const position = new monaco.Position(line, column); editor.setPosition(position); editor.revealPositionInCenter(position); await usages.show(position); },
 terminal: cwd => terminalPanel.open(cwd),
});
const dockerPanel=mountDocker(api,terminalPanel);
// Pest/PHPUnit: ▶ acima de arquivo, classe, describe e teste (plugin php-tests); resultados no painel Testes.
const testPanel = mountTests(api, { status, open: async (path, line) => { const previous = place(); await open(path, false); editor.setPosition({ lineNumber: line + 1, column: 1 }); editor.revealLineInCenter(line + 1); editor.focus(); remember(previous); } });
monaco.editor.registerCommand('php-ide.runTests', (_accessor, request) => { void testPanel.run(request); });
// Composer (composer.json) e Symfony (Twig/YAML de config): providers dos plugins e janela Composer.
const pluginLanguages = mountPluginLanguages(api, { status, path: m => [...buffers.values()].find(b => b.model === m)?.file.path });
const composerPanel = mountComposer(api, { status, open: async path => { const previous = place(); await open(path, false); remember(previous); }, changed: () => pluginLanguages.refresh() });
monaco.editor.registerCommand('php-ide.composer', (_accessor, request) => { void composerPanel.run(request); });
// Xdebug/DBGp: breakpoints na gutter, painel Depurar (Alt+5), F7/F8/Shift+F8/F9, Cmd+F8.
const debugPanel = mountDebugger(api, { editor, status, open: async (path, line) => { await open(path, false); editor.setPosition({ lineNumber: line + 1, column: 1 }); editor.revealLineInCenterIfOutsideViewport(line + 1); } });
const pluginLensChanges=new monaco.Emitter<monaco.languages.CodeLensProvider>();
const pluginLenses:monaco.languages.CodeLensProvider={onDidChange:pluginLensChanges.event,provideCodeLenses:async m=> {
 let v:any; try { v=await request('textDocument/codeLens',m,new monaco.Position(1,1)); } catch { return {lenses:[],dispose(){}}; }
 return {lenses:(v??[]).map((l:any)=>({range:{startLineNumber:l.line+1,startColumn:1,endLineNumber:l.line+1,endColumn:1},command:{id:l.command,title:l.title,tooltip:l.tooltip,arguments:l.arguments}})),dispose(){}};
}};
monaco.languages.registerCodeLensProvider('php',pluginLenses);
window.addEventListener('ide-plugins-changed',()=>pluginLensChanges.fire(pluginLenses));
window.addEventListener('beforeunload',event=>{if([...buffers.values()].some(dirty)){event.preventDefault();event.returnValue='';}});
const showPlugins = () => run(async () => { $('plugins').textContent = (await api.plugins()).map(p => p.version ? `${p.name}: ${p.version}` : p.name).join(' · '); });
export const ready=(async()=>{$('project').textContent=(await api.workspace()).name;await tree();showPlugins();})();
const closeProjectButton=document.createElement('button');closeProjectButton.id='close-project';closeProjectButton.textContent=tr('Fechar projeto');document.querySelector('header')!.append(closeProjectButton);closeProjectButton.onclick=()=>run(async()=>{if([...buffers.values()].some(dirty))throw Error(tr('Salve os arquivos alterados antes de fechar o projeto.'));await api.closeProject();location.reload();});

window.addEventListener('ide-before-language-change',event=>{if([...buffers.values()].some(dirty)){event.preventDefault();status(tr('Salve os arquivos alterados antes de aplicar o idioma.'));}});
