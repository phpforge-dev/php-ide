import * as monaco from 'monaco-editor';
import { t } from './i18n';
import { structureOf, symbolPath, crumbLabel, type CodeSymbol } from './code-structure';
import { fileIcon, symbolIcon } from './file-icons';
import type { Entry } from '../shared/contracts';
import './code-breadcrumbs.css';
// UI-BREADCRUMBS-001. Observed on PhpStorm 2026.1.4 (captures 54–56, 2026-11-03):
// - editor breadcrumbs at the bottom of the editor (`\Fixture › Broken › total()`), hidden while the caret is
//   outside any declaration; a click moves the caret to the element's name, highlights that crumb and keeps the
//   deeper crumbs dimmed until the caret moves again;
// - the navigation bar in the status bar continues the file path with the code path (`Broken › total`); a click
//   on any segment opens a popup with that segment's children, sorted by name, and choosing one navigates.
// Hovering a crumb highlights the element's range in the editor (public docs, "Breadcrumbs"). Our own drawing.

type Hooks = {
 /** Active buffer key and whether it is a project file (virtual buffers get no popups). */
 path(): string | undefined; isFile(path: string): boolean;
 project(): string; tree(path: string): Promise<Entry[]>; open(path: string): Promise<void>; status(text: string): void;
};
type Choice = { label: string; icon?: HTMLElement; detail?: string; run(): void | Promise<void> };

export function mountCodeBreadcrumbs(editor: monaco.editor.IStandaloneCodeEditor, hooks: Hooks) {
 let cache: { model: monaco.editor.ITextModel; version: number; symbols: CodeSymbol[] | undefined } | undefined;
 const structure = () => {
  const model = editor.getModel(); if (!model) return undefined;
  if (cache?.model !== model || cache.version !== model.getVersionId()) cache = { model, version: model.getVersionId(), symbols: structureOf(model.getLanguageId(), model.getValue()) };
  return cache.symbols;
 };
 const caretPath = () => { const model = editor.getModel(), position = editor.getPosition(), symbols = structure(); return model && position && symbols ? symbolPath(symbols, model.getOffsetAt(position)) : []; };

 // --- editor breadcrumbs -----------------------------------------------------------------
 const bar = document.createElement('nav'); bar.id = 'code-breadcrumbs'; bar.className = 'code-breadcrumbs'; bar.setAttribute('aria-label', t('Breadcrumbs')); bar.hidden = true;
 editor.getContainerDomNode().after(bar);
 const highlight = editor.createDecorationsCollection();
 let pinned: { model: monaco.editor.ITextModel; path: CodeSymbol[]; index: number } | undefined;
 let moving = false;
 const go = (symbol: CodeSymbol) => {
  const model = editor.getModel(); if (!model) return;
  const position = model.getPositionAt(symbol.nameStart);
  moving = true; try { editor.setPosition(position); editor.revealPositionInCenterIfOutsideViewport(position); } finally { moving = false; }
  editor.focus();
 };
 function renderBar() {
  const model = editor.getModel();
  const path = pinned && pinned.model === model ? pinned.path : caretPath(); const selected = pinned && pinned.model === model ? pinned.index : -1;
  const hide = !path.length;
  if (bar.hidden !== hide) { bar.hidden = hide; editor.layout(); }
  const items: HTMLElement[] = [];
  path.forEach((symbol, index) => {
   if (index) { const separator = document.createElement('span'); separator.className = 'crumb-separator'; separator.setAttribute('aria-hidden', 'true'); items.push(separator); }
   const crumb = document.createElement('button'); crumb.type = 'button'; crumb.className = 'crumb'; crumb.textContent = crumbLabel(symbol); crumb.dataset.kind = symbol.kind;
   if (index === selected) crumb.setAttribute('aria-current', 'location'); if (selected >= 0 && index > selected) crumb.classList.add('crumb-after');
   crumb.title = crumbLabel(symbol);
   crumb.onclick = () => { pinned = { model: model!, path, index }; go(symbol); renderAll(); };
   crumb.onmouseenter = () => { const m = editor.getModel(); if (!m) return; const a = m.getPositionAt(symbol.start), b = m.getPositionAt(Math.min(symbol.end + 1, m.getValueLength()));
    highlight.set([{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), options: { className: 'breadcrumb-range', isWholeLine: true } }]); };
   crumb.onmouseleave = () => highlight.clear();
   items.push(crumb);
  });
  bar.replaceChildren(...items);
 }

 // --- navigation bar (status bar) ---------------------------------------------------------
 let closePopup: (() => void) | undefined;
 function popup(anchor: HTMLElement, choices: Choice[], label: string) {
  closePopup?.();
  if (!choices.length) return;
  const box = document.createElement('div'); box.className = 'nav-popup'; box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', label); box.tabIndex = -1;
  const query = document.createElement('div'); query.className = 'nav-popup-query'; query.hidden = true;
  let filter = '';
  const rows = choices.map(choice => {
   const row = document.createElement('div'); row.className = 'nav-popup-row'; row.setAttribute('role', 'option'); row.tabIndex = -1;
   const name = document.createElement('span'); name.textContent = choice.label; row.append(...(choice.icon ? [choice.icon] : []), name);
   if (choice.detail) { const detail = document.createElement('small'); detail.textContent = choice.detail; row.append(detail); }
   row.onmouseenter = () => select(row); row.onclick = () => { close(); void Promise.resolve(choice.run()).catch(error => hooks.status(String(error?.message ?? error))); };
   return row;
  });
  const visible = () => rows.filter(row => !row.hidden);
  const select = (row: HTMLElement | undefined) => { if (!row) return; for (const item of rows) item.setAttribute('aria-selected', String(item === row)); row.focus(); row.scrollIntoView({ block: 'nearest' }); };
  box.append(query, ...rows);
  const close = () => { box.remove(); document.removeEventListener('mousedown', outside, true); window.removeEventListener('blur', close); anchor.classList.remove('nav-open'); closePopup = undefined; };
  const outside = (event: MouseEvent) => { if (!box.contains(event.target as Node)) close(); };
  box.addEventListener('keydown', event => {
   const list = visible(); const at = list.findIndex(row => row.getAttribute('aria-selected') === 'true');
   if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); select(list[(at + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]); }
   else if (event.key === 'Enter') { event.preventDefault(); list[Math.max(0, at)]?.click(); }
   else if (event.key === 'Escape') { event.preventDefault(); close(); anchor.focus(); }
   else if (event.key === 'Backspace' || (event.key.length === 1 && !event.metaKey && !event.ctrlKey)) {
    // Speed search, as in the reference popups: typing filters by substring.
    event.preventDefault(); filter = event.key === 'Backspace' ? filter.slice(0, -1) : filter + event.key;
    query.hidden = !filter; query.textContent = filter;
    for (const [index, row] of rows.entries()) row.hidden = !!filter && !choices[index].label.toLocaleLowerCase().includes(filter.toLocaleLowerCase());
    select(visible()[0]);
   }
  });
  document.body.append(box); anchor.classList.add('nav-open');
  const r = anchor.getBoundingClientRect(), size = box.getBoundingClientRect();
  box.style.left = Math.max(4, Math.min(r.left - 6, innerWidth - size.width - 4)) + 'px';
  box.style.top = Math.max(4, r.top - size.height - 4) + 'px';
  select(rows[0]);
  document.addEventListener('mousedown', outside, true); window.addEventListener('blur', close);
  closePopup = close;
 }
 const byName = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
 const symbolChoices = (symbols: CodeSymbol[]) => symbols.flatMap(s => s.kind === 'namespace' ? s.children : [s])
  .map(symbol => ({ label: crumbLabel(symbol, 'nav'), icon: symbolIcon(symbol.kind), run: () => { pinned = undefined; go(symbol); renderAll(); } })).sort(byName);
 async function directoryPopup(anchor: HTMLElement, directory: string) {
  const entries = await hooks.tree(directory);
  popup(anchor, entries.map(entry => ({ label: entry.name, icon: fileIcon(entry.path, entry.directory), run: () => entry.directory ? directoryPopup(anchor, entry.path) : hooks.open(entry.path) })),
   directory || hooks.project());
 }
 function renderNav() {
  const nav = document.getElementById('breadcrumbs'); if (!nav) return;
  const path = hooks.path();
  if (!path) { nav.textContent = t('Selecione um arquivo no projeto'); return; }
  if (!hooks.isFile(path)) { nav.textContent = path.split('/').join('  ›  '); return; }
  const parts = path.split('/'); const items: HTMLElement[] = [];
  const segment = (label: string, icon: HTMLElement | undefined, open: (button: HTMLElement) => void, kind: string) => {
   if (items.length) { const separator = document.createElement('span'); separator.className = 'nav-separator'; separator.setAttribute('aria-hidden', 'true'); items.push(separator); }
   const button = document.createElement('button'); button.type = 'button'; button.className = 'nav-crumb'; button.dataset.kind = kind;
   const text = document.createElement('span'); text.textContent = label; button.append(...(icon ? [icon] : []), text);
   button.onclick = () => open(button); items.push(button);
  };
  segment(hooks.project(), undefined, button => void directoryPopup(button, '').catch(error => hooks.status(String(error))), 'project');
  parts.slice(0, -1).forEach((name, index) => { const dir = parts.slice(0, index + 1).join('/'); segment(name, undefined, button => void directoryPopup(button, dir).catch(error => hooks.status(String(error))), 'directory'); });
  const model = editor.getModel(); const symbols = structure() ?? [];
  segment(parts.at(-1)!, fileIcon(path, false, model?.getValue()), button => popup(button, symbolChoices(symbols), parts.at(-1)!), 'file');
  for (const symbol of caretPath().filter(s => s.kind !== 'namespace'))
   segment(crumbLabel(symbol, 'nav'), symbolIcon(symbol.kind), button => { if (symbol.children.length) popup(button, symbolChoices(symbol.children), symbol.name); else { pinned = undefined; go(symbol); } }, symbol.kind);
  nav.replaceChildren(...items);
 }

 let frame = 0;
 const renderAll = () => { cancelAnimationFrame(frame); frame = 0; renderBar(); renderNav(); };
 const schedule = () => { if (!frame) frame = requestAnimationFrame(renderAll); };
 let typing: ReturnType<typeof setTimeout> | undefined;
 editor.onDidChangeCursorPosition(() => { if (!moving) pinned = undefined; schedule(); });
 editor.onDidChangeModel(() => { pinned = undefined; highlight.clear(); closePopup?.(); schedule(); });
 editor.onDidChangeModelContent(() => { clearTimeout(typing); typing = setTimeout(schedule, 120); });
 editor.onDidChangeModelLanguage(schedule);
 renderAll();
 return { refresh: renderAll, element: bar };
}
