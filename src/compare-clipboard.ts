import * as monaco from 'monaco-editor';
import { t, msg } from './i18n';
import './compare-clipboard.css';
// UI-CONTEXT-001, round 2 — Compare with Clipboard (editor menu, capture 31). The reference opens a diff of the
// clipboard (left) against the selection, or the whole file without one (right). Here the right side is the file
// itself (editable, the same document) or a read-only copy of the selection; Esc or the × button closes it.

let counter = 0;
export async function compareWithClipboard(editor: monaco.editor.IStandaloneCodeEditor, name: string, status: (text: string) => void) {
 const model = editor.getModel(); if (!model) return;
 let clipboard: string;
 try { clipboard = await navigator.clipboard.readText(); } catch (error) { status(msg`Área de transferência indisponível: ${String((error as Error)?.message ?? error)}`); return; }
 const selection = editor.getSelection(); const partial = !!selection && !selection.isEmpty();
 const id = ++counter;
 const original = monaco.editor.createModel(clipboard, model.getLanguageId(), monaco.Uri.from({ scheme: 'php-ide-clipboard', path: `/clipboard-${id}` }));
 const modified = partial ? monaco.editor.createModel(model.getValueInRange(selection!), model.getLanguageId(), monaco.Uri.from({ scheme: 'php-ide-clipboard', path: `/selection-${id}` })) : model;
 const dialog = document.createElement('dialog'); dialog.className = 'compare-clipboard'; dialog.setAttribute('aria-label', t('Comparar com a área de transferência'));
 const head = document.createElement('header');
 const title = document.createElement('h2'); title.className = 'compare-clipboard-title'; title.textContent = partial ? t('Área de transferência vs. seleção') : msg`Área de transferência vs. ${name}`;
 const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', t('Fechar comparação'));
 head.append(title, close);
 const labels = document.createElement('div'); labels.className = 'compare-clipboard-labels';
 const left = document.createElement('span'); left.textContent = t('Área de transferência'); const right = document.createElement('span'); right.textContent = partial ? t('Seleção') : name;
 labels.append(left, right);
 const host = document.createElement('div'); host.className = 'compare-clipboard-editor';
 const summary = document.createElement('footer'); summary.setAttribute('role', 'status');
 dialog.append(head, labels, host, summary); document.body.append(dialog);
 const previous = document.activeElement as HTMLElement | null;
 dialog.showModal();
 const diff = monaco.editor.createDiffEditor(host, { automaticLayout: true, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false, originalEditable: false, readOnly: partial, minimap: { enabled: false }, scrollBeyondLastLine: false,
  fontSize: editor.getOption(monaco.editor.EditorOption.fontSize), fontFamily: editor.getOption(monaco.editor.EditorOption.fontFamily), lineHeight: editor.getOption(monaco.editor.EditorOption.lineHeight) });
 diff.setModel({ original, modified });
 const count = () => { const changes = diff.getLineChanges(); summary.textContent = changes === null ? '' : changes.length ? msg`${changes.length} diferença(s)` : t('Conteúdos idênticos'); };
 const updated = diff.onDidUpdateDiff(count);
 const dispose = () => { updated.dispose(); diff.dispose(); original.dispose(); if (partial) modified.dispose(); dialog.remove(); if (previous?.isConnected) previous.focus(); else editor.focus(); };
 close.onclick = () => { dialog.close(); };
 dialog.addEventListener('close', dispose, { once: true });
 dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
 // Monaco consumes Escape (selection, multi-cursor): close first, unless one of its widgets is open.
 dialog.addEventListener('keydown', event => { if (event.key === 'Escape' && !dialog.querySelector('.suggest-widget.visible,.find-widget.visible,.rename-box')) { event.preventDefault(); event.stopPropagation(); dialog.close(); } }, true);
 diff.getModifiedEditor().focus();
}
