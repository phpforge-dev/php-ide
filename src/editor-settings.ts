import { t, html } from './i18n';
import { keymap } from './keymap';
import { BREADCRUMB_LANGUAGES } from './code-structure';
import './editor-settings.css';
// Editor settings page (Settings › Editor › General in the reference): Breadcrumbs (public help, "Breadcrumbs":
// Show breadcrumbs, Placement Top/Bottom with Bottom by default, one check box per language) and Editor Tabs
// (public help, "Editor tabs": tab placement Top/None, show file icon, close button, tab limit — 10 by default;
// opening more closes the least recently used tab that is not pinned and has no unsaved changes).
// Reached from the tab menu's "Configure Editor Tabs…" (capture 53), the breadcrumbs bar and the Appearance dialog. Changes apply at
// once and persist for this user, like the Keymap screen; the reference has Apply/OK instead.

export type BreadcrumbsPlacement = 'top' | 'bottom';
export type EditorSettings = {
 breadcrumbs: { show: boolean; placement: BreadcrumbsPlacement; languages: Record<string, boolean> };
 tabs: { placement: 'top' | 'none'; showIcon: boolean; showClose: boolean; limit: number };
};
const STORAGE = 'php-ide-editor-settings';
const defaults = (): EditorSettings => ({
 breadcrumbs: { show: true, placement: 'bottom', languages: Object.fromEntries(BREADCRUMB_LANGUAGES.map(l => [l.id, true])) },
 tabs: { placement: 'top', showIcon: true, showClose: true, limit: 10 },
});
let settings = load();
const listeners = new Set<(value: EditorSettings) => void>();
function load(): EditorSettings {
 const base = defaults();
 try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<EditorSettings>;
  const crumbs = saved.breadcrumbs;
  if (crumbs && typeof crumbs === 'object') base.breadcrumbs = {
   show: crumbs.show !== false, placement: crumbs.placement === 'top' ? 'top' : 'bottom',
   languages: { ...base.breadcrumbs.languages, ...Object.fromEntries(Object.entries(crumbs.languages ?? {}).filter(([, v]) => typeof v === 'boolean')) },
  };
  const tabs = saved.tabs;
  if (tabs && typeof tabs === 'object') base.tabs = {
   placement: tabs.placement === 'none' ? 'none' : 'top', showIcon: tabs.showIcon !== false, showClose: tabs.showClose !== false,
   limit: Number.isInteger(tabs.limit) && tabs.limit >= 0 ? Math.min(tabs.limit, 200) : base.tabs.limit,
  };
 } catch { /* defaults */ }
 return base;
}
export const editorSettings = () => settings;
/** Listener runs now and on every change. */
export function onEditorSettings(listener: (value: EditorSettings) => void) { listeners.add(listener); listener(settings); return () => listeners.delete(listener); }
export function updateEditorSettings(change: (draft: EditorSettings) => void) {
 const draft = structuredClone(settings); change(draft); settings = draft;
 try { localStorage.setItem(STORAGE, JSON.stringify(settings)); } catch { /* kept for this session */ }
 for (const listener of [...listeners]) { try { listener(settings); } catch (error) { console.error(error); } }
}

export function mountEditorSettings() {
 const dialog = document.createElement('dialog'); dialog.id = 'editor-settings-dialog'; dialog.setAttribute('aria-label', t('Editor'));
 dialog.innerHTML = html`<header><h2>Editor</h2><button type="button" class="editor-settings-close" aria-label="Fechar configurações do editor">×</button></header>
<div class="editor-settings-body">
<section data-section="breadcrumbs" aria-labelledby="editor-settings-breadcrumbs"><h3 id="editor-settings-breadcrumbs">Breadcrumbs</h3>
<label class="editor-settings-check"><input type="checkbox" id="breadcrumbs-show"> Mostrar breadcrumbs</label>
<fieldset class="editor-settings-indent" data-depends="breadcrumbs-show"><legend>Posição:</legend><label><input type="radio" name="breadcrumbs-placement" value="top"> Topo</label><label><input type="radio" name="breadcrumbs-placement" value="bottom"> Rodapé</label></fieldset>
<fieldset class="editor-settings-indent editor-settings-languages" data-depends="breadcrumbs-show"><legend>Mostrar breadcrumbs para:</legend></fieldset>
</section>
<section data-section="tabs" aria-labelledby="editor-settings-tabs"><h3 id="editor-settings-tabs">Abas do editor</h3>
<label class="editor-settings-row">Posição das abas: <select id="tabs-placement"><option value="top">Topo</option><option value="none">Nenhuma</option></select></label>
<label class="editor-settings-check"><input type="checkbox" id="tabs-show-icon"> Mostrar ícone do arquivo</label>
<label class="editor-settings-check"><input type="checkbox" id="tabs-show-close"> Mostrar botão de fechar</label>
<label class="editor-settings-row">Limite de abas: <input type="number" id="tabs-limit" min="0" max="200" step="1"></label>
<p class="editor-settings-note">Ao passar do limite, fecha a aba usada há mais tempo que não está fixada nem tem alterações. 0 = sem limite.</p>
</section>
</div>
<footer>Salvo automaticamente nas configurações deste usuário.</footer>`;
 document.body.append(dialog);
 const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
 const languages = $<HTMLElement>('.editor-settings-languages');
 for (const language of BREADCRUMB_LANGUAGES) {
  const label = document.createElement('label'); const box = document.createElement('input'); box.type = 'checkbox'; box.dataset.breadcrumbsLanguage = language.id;
  label.append(box, ' ' + language.label); languages.append(label);
 }
 const show = $<HTMLInputElement>('#breadcrumbs-show');
 const placement = $<HTMLSelectElement>('#tabs-placement'), icon = $<HTMLInputElement>('#tabs-show-icon'), closeButton = $<HTMLInputElement>('#tabs-show-close'), limit = $<HTMLInputElement>('#tabs-limit');
 placement.onchange = () => updateEditorSettings(s => { s.tabs.placement = placement.value === 'none' ? 'none' : 'top'; });
 icon.onchange = () => updateEditorSettings(s => { s.tabs.showIcon = icon.checked; });
 closeButton.onchange = () => updateEditorSettings(s => { s.tabs.showClose = closeButton.checked; });
 limit.onchange = () => { const value = Math.round(Number(limit.value)); if (!Number.isFinite(value) || value < 0) { limit.value = String(settings.tabs.limit); return; } updateEditorSettings(s => { s.tabs.limit = Math.min(value, 200); }); };
 function render() {
  placement.value = settings.tabs.placement; icon.checked = settings.tabs.showIcon; closeButton.checked = settings.tabs.showClose; if (document.activeElement !== limit) limit.value = String(settings.tabs.limit);
  const crumbs = settings.breadcrumbs;
  show.checked = crumbs.show;
  dialog.querySelectorAll<HTMLInputElement>('input[name=breadcrumbs-placement]').forEach(radio => { radio.checked = radio.value === crumbs.placement; });
  dialog.querySelectorAll<HTMLInputElement>('[data-breadcrumbs-language]').forEach(box => { box.checked = crumbs.languages[box.dataset.breadcrumbsLanguage!] !== false; });
  dialog.querySelectorAll<HTMLFieldSetElement>('[data-depends=breadcrumbs-show]').forEach(set => { set.disabled = !crumbs.show; });
 }
 show.onchange = () => updateEditorSettings(s => { s.breadcrumbs.show = show.checked; });
 dialog.querySelectorAll<HTMLInputElement>('input[name=breadcrumbs-placement]').forEach(radio => { radio.onchange = () => updateEditorSettings(s => { s.breadcrumbs.placement = radio.value as BreadcrumbsPlacement; }); });
 languages.addEventListener('change', event => { const box = event.target as HTMLInputElement; const id = box.dataset.breadcrumbsLanguage; if (id) updateEditorSettings(s => { s.breadcrumbs.languages[id] = box.checked; }); });
 onEditorSettings(render);
 let previous: HTMLElement | null = null;
 const close = () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
 $<HTMLButtonElement>('.editor-settings-close').onclick = close;
 dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
 function open(section = 'breadcrumbs') {
  previous = document.activeElement as HTMLElement | null;
  if (!dialog.open) dialog.showModal();
  render();
  const target = dialog.querySelector<HTMLElement>(`[data-section="${section}"]`) ?? dialog.querySelector<HTMLElement>('section')!;
  target.scrollIntoView({ block: 'start' }); target.querySelector<HTMLElement>('input:not(:disabled),select')?.focus();
 }
 window.addEventListener('ide-editor-settings', event => open((event as CustomEvent).detail?.section));
 keymap.registerAction({ id: 'ide.editorSettings', label: 'Configurações do editor…', category: 'Configurações', aliases: 'editor settings breadcrumbs tabs abas general geral', defaults: {}, run: () => open() });
 const appearance = document.getElementById('appearance-dialog');
 if (appearance) {
  const button = document.createElement('button'); button.type = 'button'; button.id = 'open-editor-settings'; button.className = 'keymap-open'; button.textContent = t('Editor…');
  button.onclick = () => { (appearance as HTMLDialogElement).close(); open(); };
  appearance.querySelector('.appearance-footer')?.before(button);
 }
 return { open };
}
