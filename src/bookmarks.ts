import * as monaco from 'monaco-editor';
import { t, msg } from './i18n';
import { keymap } from './keymap';
import { fileIcon } from './file-icons';
import './bookmarks.css';
// UI-CONTEXT-001, round 2 — Bookmarks (public help, "Bookmarks"; macOS keymap: F3 toggles a line bookmark, ⌥F3 a
// mnemonic bookmark with a digit or letter, ⌘F3 shows all, ^digit jumps to a numeric mnemonic; Windows/Linux:
// F11, Ctrl+F11, Shift+F11, Ctrl+digit). The editor tab menu adds a file bookmark (whole file). Bookmarks are per
// project, follow their line while the document is edited and are kept in this user's storage. Not reproduced:
// several bookmark lists, the Bookmarks tool window and descriptions edited in place.

export type Bookmark = { path: string; line: number; mnemonic?: string; description?: string };
type Hooks = {
 /** Project-relative path of a workspace model, undefined for virtual buffers. */
 pathOf(model: monaco.editor.ITextModel): string | undefined;
 /** Opens the file and, for a line bookmark, puts the caret on the line. */
 open(path: string, line: number): Promise<void>;
 /** Storage scope (project root). */
 scope(): string;
 status(text: string): void;
};
const MNEMONICS = [...'1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export function mountBookmarks(editor: monaco.editor.IStandaloneCodeEditor, hooks: Hooks) {
 let bookmarks: Bookmark[] = []; let loaded = '';
 const key = () => 'php-ide-bookmarks:' + hooks.scope();
 const ensure = () => { const scope = hooks.scope(); if (loaded === scope) return; loaded = scope; try { const raw = JSON.parse(localStorage.getItem(key()) ?? '[]'); bookmarks = Array.isArray(raw) ? raw.filter(b => b && typeof b.path === 'string' && Number.isInteger(b.line)) : []; } catch { bookmarks = []; } paintAll(); };
 const save = () => { try { localStorage.setItem(key(), JSON.stringify(bookmarks)); } catch { /* kept for this session */ } };
 const changed = () => { save(); paintAll(); window.dispatchEvent(new Event('ide-bookmarks-changed')); };

 // --- gutter decorations (model level, so split panes show them too) ----------------------------
 const painted = new Map<monaco.editor.ITextModel, { ids: string[]; marks: Bookmark[] }>();
 function paint(model: monaco.editor.ITextModel) {
  if (model.isDisposed()) return;
  const path = hooks.pathOf(model);
  const lines = path ? bookmarks.filter(b => b.path === path && b.line > 0 && b.line <= model.getLineCount()) : [];
  const next = lines.map(b => ({ range: new monaco.Range(b.line, 1, b.line, 1), options: {
   glyphMarginClassName: 'bookmark-glyph' + (b.mnemonic ? ' bookmark-m-' + b.mnemonic : ''), stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
   glyphMarginHoverMessage: { value: b.mnemonic ? msg`Marcador ${b.mnemonic}` + (b.description ? ': ' + b.description : '') : t('Marcador') },
   overviewRuler: { color: '#8f9ba8', position: monaco.editor.OverviewRulerLane.Left },
  } }));
  painted.set(model, { ids: model.deltaDecorations(painted.get(model)?.ids ?? [], next), marks: lines });
  if (lines.length && editor.getModel() === model && !editor.getOption(monaco.editor.EditorOption.glyphMargin)) editor.updateOptions({ glyphMargin: true });
 }
 const paintAll = () => { for (const model of monaco.editor.getModels()) paint(model); };
 // Bookmarks follow their decoration when lines are inserted or removed above them.
 const follow = (model: monaco.editor.ITextModel) => {
  const entry = painted.get(model); if (!entry?.ids.length) return;
  let moved = false;
  entry.ids.forEach((id, index) => { const range = model.getDecorationRange(id); const b = entry.marks[index]; if (range && b && bookmarks.includes(b) && b.line !== range.startLineNumber) { b.line = range.startLineNumber; moved = true; } });
  if (moved) { save(); window.dispatchEvent(new Event('ide-bookmarks-changed')); }
 };
 const watch = (model: monaco.editor.ITextModel) => { let timer: ReturnType<typeof setTimeout> | undefined; model.onDidChangeContent(() => { clearTimeout(timer); timer = setTimeout(() => follow(model), 150); }); model.onWillDispose(() => { clearTimeout(timer); follow(model); painted.delete(model); }); setTimeout(() => { ensure(); paint(model); }); };
 monaco.editor.getModels().forEach(watch); monaco.editor.onDidCreateModel(watch);
 editor.onDidChangeModel(() => { ensure(); const model = editor.getModel(); if (model) paint(model); });

 // --- operations ----------------------------------------------------------------------------
 const here = () => { const model = editor.getModel(), position = editor.getPosition(); const path = model && hooks.pathOf(model); return path && position ? { path, line: position.lineNumber } : undefined; };
 const find = (path: string, line: number) => bookmarks.find(b => b.path === path && b.line === line);
 function toggle(path: string, line: number) {
  ensure(); const found = find(path, line);
  if (found) { bookmarks = bookmarks.filter(b => b !== found); hooks.status(line ? msg`Marcador removido da linha ${line}.` : t('Marcador do arquivo removido.')); }
  else { bookmarks.push({ path, line }); hooks.status(line ? msg`Marcador adicionado na linha ${line}.` : t('Marcador adicionado ao arquivo.')); }
  changed();
 }
 function assign(path: string, line: number, mnemonic: string | undefined, description = '') {
  ensure();
  const previous = mnemonic ? bookmarks.find(b => b.mnemonic === mnemonic && !(b.path === path && b.line === line)) : undefined;
  if (previous) previous.mnemonic = undefined;
  const target = find(path, line) ?? (bookmarks.push({ path, line }), bookmarks.at(-1)!);
  target.mnemonic = mnemonic; target.description = description || undefined;
  hooks.status(mnemonic ? msg`Marcador ${mnemonic} em ${path.split('/').pop()!}${line ? ':' + line : ''}.` + (previous ? ' ' + msg`(movido de ${previous.path.split('/').pop()!}:${previous.line})` : '') : t('Marcador atualizado.'));
  changed();
 }
 async function go(b: Bookmark) { await hooks.open(b.path, b.line); }

 // --- ⌥F3: mnemonic chooser ---------------------------------------------------------------------
 function mnemonicPopup(path: string, line: number, anchor?: { x: number; y: number }) {
  ensure(); document.querySelector('.bookmark-mnemonic')?.remove();
  const previous = document.activeElement as HTMLElement | null;
  const existing = find(path, line);
  const box = document.createElement('div'); box.className = 'bookmark-mnemonic'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', t('Marcador mnemônico')); box.dataset.keymapCapture = '';
  const title = document.createElement('div'); title.className = 'bookmark-mnemonic-title'; title.textContent = line ? msg`Marcador mnemônico · ${path.split('/').pop()!}:${line}` : msg`Marcador mnemônico · ${path.split('/').pop()!}`;
  const grid = document.createElement('div'); grid.className = 'bookmark-grid'; grid.setAttribute('role', 'grid');
  let chosen = existing?.mnemonic ?? '';
  const keys = MNEMONICS.map(m => {
   const b = document.createElement('button'); b.type = 'button'; b.textContent = m; b.dataset.mnemonic = m;
   const used = bookmarks.find(x => x.mnemonic === m); if (used && used !== existing) { b.classList.add('used'); b.title = msg`Em uso: ${used.path.split('/').pop()!}:${used.line}`; }
   b.setAttribute('aria-pressed', String(m === chosen));
   b.onclick = () => { if (chosen === m) { commit(); return; } chosen = m; for (const k of keys) k.setAttribute('aria-pressed', String(k.dataset.mnemonic === m)); };
   grid.append(b); return b;
  });
  const description = document.createElement('input'); description.type = 'text'; description.placeholder = t('Descrição (opcional)'); description.value = existing?.description ?? ''; description.setAttribute('aria-label', t('Descrição do marcador'));
  const hint = document.createElement('small'); hint.textContent = t('Digite um número ou letra; Enter confirma, Esc cancela.');
  box.append(title, grid, description, hint);
  const close = () => { box.remove(); document.removeEventListener('mousedown', outside, true); if (previous?.isConnected) previous.focus(); };
  const commit = () => { const value = chosen || undefined; close(); if (value || existing) assign(path, line, value, description.value.trim()); else if (!existing) toggle(path, line); };
  const outside = (event: MouseEvent) => { if (!box.contains(event.target as Node)) close(); };
  box.addEventListener('keydown', event => {
   if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
   if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commit(); return; }
   if (event.target === description) return;
   const m = event.key.length === 1 ? event.key.toUpperCase() : '';
   if (MNEMONICS.includes(m) && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); chosen = m; commit(); }
   else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); chosen = ''; for (const k of keys) k.setAttribute('aria-pressed', 'false'); }
  });
  document.body.append(box);
  const size = box.getBoundingClientRect(); const at = anchor ?? { x: (innerWidth - size.width) / 2, y: innerHeight / 3 };
  box.style.left = Math.max(8, Math.min(at.x, innerWidth - size.width - 8)) + 'px'; box.style.top = Math.max(8, Math.min(at.y, innerHeight - size.height - 8)) + 'px';
  (keys.find(k => k.dataset.mnemonic === chosen) ?? keys[0]).focus();
  document.addEventListener('mousedown', outside, true);
 }

 // --- ⌘F3: all bookmarks ---------------------------------------------------------------------------
 async function listPopup() {
  ensure(); document.querySelector('.bookmarks-popup')?.remove();
  const previous = document.activeElement as HTMLElement | null;
  const box = document.createElement('div'); box.className = 'bookmarks-popup'; box.dataset.keymapCapture = '';
  const title = document.createElement('div'); title.className = 'bookmarks-popup-title'; title.textContent = t('Marcadores');
  const list = document.createElement('div'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', t('Marcadores')); list.tabIndex = 0;
  box.append(title, list);
  const lineText = (b: Bookmark) => { if (!b.line) return ''; const model = monaco.editor.getModels().find(m => hooks.pathOf(m) === b.path); return model && b.line <= model.getLineCount() ? model.getLineContent(b.line).trim() : ''; };
  const sorted = () => [...bookmarks].sort((a, b) => (a.mnemonic ? 0 : 1) - (b.mnemonic ? 0 : 1) || (a.mnemonic ?? '').localeCompare(b.mnemonic ?? '') || a.path.localeCompare(b.path) || a.line - b.line);
  let selected = 0;
  const close = () => { box.remove(); document.removeEventListener('mousedown', outside, true); if (previous?.isConnected) previous.focus(); };
  const outside = (event: MouseEvent) => { if (!box.contains(event.target as Node)) close(); };
  function render() {
   const items = sorted(); list.replaceChildren();
   if (!items.length) { const none = document.createElement('div'); none.className = 'bookmarks-empty'; none.textContent = t('Nenhum marcador. F3 adiciona um na linha atual.'); list.append(none); return; }
   selected = Math.min(selected, items.length - 1);
   items.forEach((b, index) => {
    const row = document.createElement('div'); row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(index === selected));
    const mark = document.createElement('span'); mark.className = 'bookmark-key'; mark.textContent = b.mnemonic ?? '';
    const where = document.createElement('span'); where.className = 'bookmark-where'; where.textContent = b.path.split('/').pop()! + (b.line ? ':' + b.line : '');
    const code = document.createElement('small'); code.textContent = b.description ?? lineText(b);
    row.append(mark, fileIcon(b.path, false), where, code); row.title = b.path + (b.line ? ':' + b.line : '');
    row.onmouseenter = () => { selected = index; for (const r of list.children) r.setAttribute('aria-selected', String(r === row)); };
    row.onclick = () => { close(); void go(b); };
    list.append(row);
   });
  }
  list.addEventListener('keydown', event => {
   const items = sorted();
   if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); if (items.length) selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; render(); }
   else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); const b = items[selected]; close(); if (b) void go(b); }
   else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); const b = items[selected]; if (b) { bookmarks = bookmarks.filter(x => x !== b); changed(); render(); } }
   else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  render(); document.body.append(box);
  const size = box.getBoundingClientRect(); box.style.left = Math.max(8, (innerWidth - size.width) / 2) + 'px'; box.style.top = Math.max(8, innerHeight / 4) + 'px';
  list.focus(); document.addEventListener('mousedown', outside, true);
 }

 const caretAnchor = () => { const position = editor.getPosition(); const node = editor.getDomNode(); if (!position || !node) return undefined; const at = editor.getScrolledVisiblePosition(position); const r = node.getBoundingClientRect(); return at ? { x: r.left + at.left, y: r.top + at.top + at.height + 4 } : undefined; };
 const editorReady = () => !!here();
 keymap.registerAction({ id: 'bookmarks.toggle', label: 'Alternar marcador', category: 'Marcadores', aliases: 'bookmark toggle marcador favorito', context: 'editor', defaults: { mac: 'F3', other: 'F11' }, enabled: editorReady, run: () => { const h = here(); if (h) toggle(h.path, h.line); } });
 keymap.registerAction({ id: 'bookmarks.mnemonic', label: 'Alternar marcador com mnemônico', category: 'Marcadores', aliases: 'bookmark mnemonic marcador mnemônico', context: 'editor', defaults: { mac: 'Alt+F3', other: 'Ctrl+F11' }, enabled: editorReady, run: () => { const h = here(); if (h) mnemonicPopup(h.path, h.line, caretAnchor()); } });
 keymap.registerAction({ id: 'bookmarks.show', label: 'Mostrar todos os marcadores', category: 'Marcadores', aliases: 'bookmarks show list marcadores', defaults: { mac: 'Meta+F3', other: 'Shift+F11' }, run: () => listPopup() });
 const sortedLines = () => { ensure(); return [...bookmarks].filter(b => b.line > 0).sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line); };
 const step = (forward: boolean) => { const h = here(); const all = sortedLines(); if (!all.length) { hooks.status(t('Nenhum marcador.')); return; }
  const after = all.filter(b => h && (b.path === h.path ? (forward ? b.line > h.line : b.line < h.line) : (forward ? b.path > h.path : b.path < h.path)));
  void go(forward ? after[0] ?? all[0] : after.at(-1) ?? all.at(-1)!); };
 keymap.registerAction({ id: 'bookmarks.next', label: 'Próximo marcador de linha', category: 'Marcadores', aliases: 'next bookmark', defaults: {}, run: () => step(true) });
 keymap.registerAction({ id: 'bookmarks.previous', label: 'Marcador de linha anterior', category: 'Marcadores', aliases: 'previous bookmark', defaults: {}, run: () => step(false) });
 for (const digit of '1234567890') keymap.registerAction({ id: 'bookmarks.goto' + digit, label: 'Ir para o marcador ' + digit, category: 'Marcadores', aliases: 'go to bookmark mnemonic ' + digit, defaults: { mac: 'Ctrl+' + digit, other: 'Ctrl+' + digit },
  enabled: () => { ensure(); return bookmarks.some(b => b.mnemonic === digit); }, run: () => { const b = bookmarks.find(x => x.mnemonic === digit); if (b) void go(b); } });

 return {
  list: () => { ensure(); return [...bookmarks]; },
  hasFile: (path: string) => { ensure(); return !!find(path, 0); },
  toggleFile: (path: string) => toggle(path, 0),
  mnemonicFile: (path: string) => mnemonicPopup(path, 0),
  show: () => listPopup(),
  /** Paths renamed or deleted (UI-CONTEXT-001 file actions). */
  relocate(from: string, to: string | undefined) { ensure(); bookmarks = bookmarks.flatMap(b => b.path === from || b.path.startsWith(from + '/') ? (to === undefined ? [] : [{ ...b, path: to + b.path.slice(from.length) }]) : [b]); changed(); },
 };
}
