import * as monaco from 'monaco-editor';
import { t } from './i18n';
import { keymap } from './keymap';
import { fileIcon } from './file-icons';
import './editor-split.css';
// UI-CONTEXT-001, round 2 — Split Right / Split Down from the editor tab menu (capture 53). The reference opens the
// tab in a second editor window beside or below the current one; both show the same document, so edits are
// shared. Here the second pane holds one document (no tab strip of its own) and "Unsplit" closes it; the main
// editor keeps navigation, inspections widgets and breadcrumbs. "Split and Move Right/Down" are not offered.

type Hooks = {
 /** Active project tab. */
 active(): string | undefined;
 /** Workspace model of a tab, or undefined when the tab is gone. */
 model(path: string): monaco.editor.ITextModel | undefined;
 /** The pane got focus: the main tab of this document becomes active so file actions follow it. */
 focus?(path: string): void;
};
export type Orientation = 'right' | 'down';
type State = { path: string; orientation: Orientation; editor: monaco.editor.IStandaloneCodeEditor; wrapper: HTMLElement; disposables: monaco.IDisposable[] };

export function mountEditorSplit(editor: monaco.editor.IStandaloneCodeEditor, hooks: Hooks) {
 let state: State | undefined;
 // The editor slot may be wrapped by document previews (editor-preview-layout.ts); the split wraps that slot.
 const slot = () => { let element: HTMLElement = editor.getContainerDomNode(); while (element.parentElement?.classList.contains('editor-split')) element = element.parentElement; return element; };
 function split(path: string, orientation: Orientation) {
  const model = hooks.model(path); if (!model) return false;
  if (state) unsplit();
  const target = slot(); const wrapper = document.createElement('div'); wrapper.className = 'editor-tab-split'; wrapper.dataset.orientation = orientation;
  target.replaceWith(wrapper); wrapper.append(target);
  const divider = document.createElement('div'); divider.className = 'editor-split-divider'; divider.setAttribute('role', 'separator'); divider.tabIndex = 0;
  divider.setAttribute('aria-orientation', orientation === 'right' ? 'vertical' : 'horizontal'); divider.setAttribute('aria-label', t('Redimensionar divisão'));
  const pane = document.createElement('section'); pane.className = 'editor-split-pane'; pane.setAttribute('aria-label', t('Editor dividido'));
  const strip = document.createElement('div'); strip.className = 'split-tabs';
  const tab = document.createElement('div'); tab.className = 'split-tab file-like'; tab.title = path;
  const name = document.createElement('span'); name.textContent = path.split('/').pop()!;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'close-tab'; close.textContent = '×'; close.title = t('Desfazer divisão'); close.setAttribute('aria-label', t('Desfazer divisão'));
  close.onclick = () => { unsplit(); editor.focus(); };
  tab.append(fileIcon(path, false, model.getValue()), name, close); strip.append(tab);
  const host = document.createElement('div'); host.className = 'editor-split-host';
  pane.append(strip, host); wrapper.append(divider, pane);
  const raw = editor.getRawOptions();
  const second = monaco.editor.create(host, { ...raw, model, automaticLayout: true, readOnly: !!editor.getOption(monaco.editor.EditorOption.readOnly) });
  const position = editor.getModel() === model ? editor.getPosition() : null;
  if (position) { second.setPosition(position); second.revealPositionInCenter(position); }
  const disposables = [
   model.onWillDispose(() => unsplit()),
   second.onDidFocusEditorText(() => { pane.classList.add('focused'); hooks.focus?.(path); }),
   second.onDidBlurEditorText(() => pane.classList.remove('focused')),
  ];
  // Drag or arrow keys on the divider resize the two panes (fractions kept while the split lasts).
  const resize = (fraction: number) => { const f = Math.min(.85, Math.max(.15, fraction)); target.style.flex = `${f} 1 0`; pane.style.flex = `${1 - f} 1 0`; };
  divider.onpointerdown = event => {
   event.preventDefault(); divider.setPointerCapture(event.pointerId);
   const box = wrapper.getBoundingClientRect();
   const move = (e: PointerEvent) => resize(orientation === 'right' ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height);
   const up = () => { divider.removeEventListener('pointermove', move); divider.removeEventListener('pointerup', up); };
   divider.addEventListener('pointermove', move); divider.addEventListener('pointerup', up);
  };
  divider.onkeydown = event => {
   const back = orientation === 'right' ? 'ArrowLeft' : 'ArrowUp', forward = orientation === 'right' ? 'ArrowRight' : 'ArrowDown';
   if (event.key !== back && event.key !== forward) return; event.preventDefault();
   const box = wrapper.getBoundingClientRect(), first = target.getBoundingClientRect();
   resize((orientation === 'right' ? first.width / box.width : first.height / box.height) + (event.key === forward ? .05 : -.05));
  };
  resize(.5);
  state = { path, orientation, editor: second, wrapper, disposables };
  editor.layout(); second.focus();
  window.dispatchEvent(new CustomEvent('ide-editor-split', { detail: { path, orientation } }));
  return true;
 }
 function unsplit() {
  const current = state; if (!current) return; state = undefined;
  for (const d of current.disposables) d.dispose();
  current.editor.dispose();
  const first = current.wrapper.firstElementChild as HTMLElement | null;
  if (first) { first.style.flex = ''; current.wrapper.replaceWith(first); } else current.wrapper.remove();
  editor.layout();
  window.dispatchEvent(new CustomEvent('ide-editor-split', { detail: null }));
 }
 const active = () => state ? { path: state.path, orientation: state.orientation } : undefined;
 keymap.registerAction({ id: 'editor.splitRight', label: 'Dividir à direita', category: 'Abas do editor', aliases: 'split right vertically dividir', defaults: {}, enabled: () => !!editor.getModel(),
  run: () => { const path = hooks.active(); if (path) split(path, 'right'); } });
 keymap.registerAction({ id: 'editor.splitDown', label: 'Dividir para baixo', category: 'Abas do editor', aliases: 'split down horizontally dividir', defaults: {}, enabled: () => !!editor.getModel(),
  run: () => { const path = hooks.active(); if (path) split(path, 'down'); } });
 keymap.registerAction({ id: 'editor.unsplit', label: 'Desfazer divisão', category: 'Abas do editor', aliases: 'unsplit close split', defaults: {}, enabled: () => !!state, run: () => unsplit() });
 return { split, unsplit, active, editor: () => state?.editor };
}
