// Tela "Keymap" (UI-KEYMAP-001): busca por nome e por tecla, edição, remoção, restauração e aviso de conflito.
import { t, html, msg } from './i18n';
import { confirmDialog } from './confirm-dialog';
import { keymap, profiles, formatStroke, strokeFromEvent, DOUBLE_SHIFT, type ProfileId } from './keymap';
import './keymap.css';

/** Grava um atalho a partir do teclado; Shift solto duas vezes (sem outra tecla) grava o Shift duplo. */
let recorderEscape = 0;
function recorder(element: HTMLElement, onStroke: (stroke: string) => void, onCancel: () => void, active = () => true) {
 element.dataset.keymapCapture = '';
 let lastShift = 0, cleanShift = false;
 element.addEventListener('keydown', event => {
  if (!active()) return;
  if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) return; // mantém a navegação por teclado
  event.preventDefault(); event.stopPropagation();
  if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) { recorderEscape = performance.now(); onCancel(); return; }
  if (event.key === 'Shift') { cleanShift = !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey; return; }
  cleanShift = false; lastShift = 0;
  const stroke = strokeFromEvent(event); if (stroke) onStroke(stroke);
 });
 element.addEventListener('keyup', event => {
  if (!active() || event.key !== 'Shift' || !cleanShift) return;
  const now = performance.now(); cleanShift = false;
  if (lastShift && now - lastShift < 450) { lastShift = 0; onStroke(DOUBLE_SHIFT); } else lastShift = now;
 });
}

export function mountKeymapSettings() {
 const dialog = document.createElement('dialog'); dialog.id = 'keymap-dialog'; dialog.setAttribute('aria-label', t('Keymap'));
 dialog.innerHTML = html`<header><h2>Keymap</h2><button type="button" id="keymap-close" aria-label="Fechar keymap">×</button></header><div class="keymap-toolbar"><label for="keymap-profile">Perfil</label><select id="keymap-profile"></select><button type="button" id="keymap-reset-profile">Restaurar perfil</button></div><div class="keymap-filters"><input id="keymap-search" type="search" autocomplete="off" aria-label="Buscar ação pelo nome" placeholder="Buscar ação pelo nome"><button type="button" id="keymap-by-key" aria-pressed="false" title="Pressione o atalho para ver quais ações o usam">Buscar por atalho</button><label><input type="checkbox" id="keymap-conflicts-only"> Só conflitos</label></div><p id="keymap-status" role="status"></p><div id="keymap-list"></div><footer>Salvo automaticamente nas configurações deste usuário. No gravador, Esc cancela e Shift duas vezes grava o Shift duplo.</footer>`;
 document.body.append(dialog);
 const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
 const profile = $<HTMLSelectElement>('#keymap-profile'), search = $<HTMLInputElement>('#keymap-search'), byKey = $<HTMLButtonElement>('#keymap-by-key');
 const conflictsOnly = $<HTMLInputElement>('#keymap-conflicts-only'), list = $<HTMLElement>('#keymap-list'), status = $<HTMLElement>('#keymap-status');
 for (const item of profiles) profile.add(new Option(t(item.label), item.id));
 let keyFilter = '', editing = '', previous: HTMLElement | null = null;
 const fmt = (stroke: string) => formatStroke(stroke, keymap.platform);
 const name = (id: string) => t(keymap.action(id)?.label ?? id);

 function render() {
  if (!dialog.open) return;
  profile.value = keymap.profile;
  const query = search.value.trim().toLocaleLowerCase();
  const conflicted = new Set(keymap.conflicts().flatMap(item => item.actions));
  const focused = (document.activeElement as HTMLElement | null)?.dataset.focusKey;
  const visible = keymap.actions().filter(spec => {
   if (keyFilter) return keymap.bindings(spec.id).includes(keyFilter);
   if (conflictsOnly.checked && !conflicted.has(spec.id)) return false;
   return !query || `${t(spec.label)} ${spec.label} ${spec.aliases ?? ''} ${spec.id} ${keymap.shortcuts(spec.id).join(' ')}`.toLocaleLowerCase().includes(query);
  }).sort((a, b) => t(a.category ?? 'Geral').localeCompare(t(b.category ?? 'Geral')) || t(a.label).localeCompare(t(b.label)));
  list.replaceChildren();
  let category = '';
  for (const spec of visible) {
   const group = t(spec.category ?? 'Geral');
   if (group !== category) { category = group; const heading = document.createElement('h3'); heading.textContent = group; list.append(heading); }
   const row = document.createElement('div'); row.className = 'keymap-row'; row.dataset.action = spec.id;
   const title = document.createElement('span'); title.className = 'keymap-name'; title.textContent = t(spec.label);
   if (keymap.isCustomized(spec.id)) { const badge = document.createElement('small'); badge.textContent = t('personalizado'); title.append(' ', badge); }
   const keys = document.createElement('span'); keys.className = 'keymap-keys';
   const strokes = keymap.bindings(spec.id);
   if (!strokes.length) { const none = document.createElement('small'); none.textContent = t('sem atalho'); keys.append(none); }
   for (const stroke of strokes) {
    const chip = document.createElement('span'); chip.className = 'keymap-chip';
    const kbd = document.createElement('kbd'); kbd.textContent = fmt(stroke);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.dataset.focusKey = `remove:${spec.id}:${stroke}`;
    remove.setAttribute('aria-label', msg`Remover ${fmt(stroke)} de ${t(spec.label)}`);
    remove.onclick = () => { keymap.removeBinding(spec.id, stroke); status.textContent = msg`${fmt(stroke)} removido de ${t(spec.label)}.`; };
    chip.append(kbd, remove); keys.append(chip);
   }
   const notes = document.createElement('span'); notes.className = 'keymap-notes';
   for (const stroke of strokes) {
    const others = keymap.conflictingActions(stroke, spec.id);
    if (others.length) notes.append(warning(msg`${fmt(stroke)} também em: ${others.map(name).join(', ')}`));
    if (keymap.isReserved(stroke)) notes.append(warning(msg`${fmt(stroke)} pode ser capturado pelo sistema ou pela edição de texto.`));
   }
   const buttons = document.createElement('span'); buttons.className = 'keymap-buttons';
   const add = document.createElement('button'); add.type = 'button'; add.textContent = t('Adicionar atalho'); add.dataset.focusKey = `add:${spec.id}`; add.onclick = () => edit(spec.id, row);
   buttons.append(add);
   if (keymap.isCustomized(spec.id)) { const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = t('Restaurar'); reset.dataset.focusKey = `reset:${spec.id}`; reset.onclick = () => { keymap.resetAction(spec.id); status.textContent = msg`${t(spec.label)} restaurado para o perfil.`; }; buttons.append(reset); }
   row.append(title, keys, buttons, notes); list.append(row);
  }
  if (!visible.length) { const empty = document.createElement('p'); empty.className = 'keymap-empty'; empty.textContent = keyFilter ? msg`Nenhuma ação usa ${fmt(keyFilter)}.` : t('Nenhuma ação encontrada.'); list.append(empty); }
  const total = conflicted.size;
  if (!status.textContent || status.dataset.auto) { status.dataset.auto = '1'; status.textContent = (keymap.lastError ? t(keymap.lastError) + ' ' : '') + (total ? msg`${total} ação(ões) com conflito de atalho.` : t('Nenhum conflito de atalho.')); }
  if (focused) dialog.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focused)}"]`)?.focus();
  else if (!dialog.contains(document.activeElement)) search.focus();
 }
 function warning(text: string) { const item = document.createElement('small'); item.className = 'keymap-warning'; item.textContent = '⚠ ' + text; return item; }

 function edit(id: string, row: HTMLElement) {
  editing = id;
  const box = document.createElement('div'); box.className = 'keymap-editor';
  const field = document.createElement('span'); field.className = 'keymap-recorder'; field.tabIndex = 0; field.setAttribute('role', 'textbox'); field.setAttribute('aria-label', msg`Pressione o novo atalho para ${name(id)}`); field.textContent = t('Pressione o atalho…');
  const info = document.createElement('small'); info.setAttribute('role', 'status');
  const save = document.createElement('button'); save.type = 'button'; save.textContent = t('Salvar'); save.disabled = true;
  const replace = document.createElement('button'); replace.type = 'button'; replace.textContent = t('Salvar e remover dos outros'); replace.hidden = true;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = t('Cancelar');
  let stroke = '';
  const close = (message = '') => { editing = ''; box.remove(); status.dataset.auto = message ? '' : '1'; status.textContent = message; render(); row.isConnected ? row.querySelector<HTMLElement>('[data-focus-key^="add:"]')?.focus() : dialog.querySelector<HTMLElement>(`[data-action="${CSS.escape(id)}"] [data-focus-key^="add:"]`)?.focus(); };
  recorder(field, value => {
   stroke = value; field.textContent = fmt(value);
   const others = keymap.conflictingActions(value, id), already = keymap.bindings(id).includes(value);
   const notes = [already ? t('Esta ação já usa este atalho.') : '', others.length ? msg`Conflito: também usado por ${others.map(name).join(', ')}.` : '', keymap.isReserved(value) ? t('Atenção: pode ser capturado pelo sistema ou pela edição de texto.') : ''].filter(Boolean);
   info.textContent = notes.join(' ') || t('Atalho livre.');
   info.classList.toggle('keymap-warning', notes.length > 0);
   save.disabled = already; replace.hidden = already || !others.length;
  }, () => close());
  const commit = (removeFromOthers: boolean) => {
   if (!stroke) return;
   try { keymap.addBinding(id, stroke, { removeFromOthers }); close(msg`${fmt(stroke)} atribuído a ${name(id)}.`); }
   catch (error) { info.textContent = String((error as Error).message ?? error); }
  };
  save.onclick = () => commit(false); replace.onclick = () => commit(true); cancel.onclick = () => close();
  box.append(field, save, replace, cancel, info); row.append(box); field.focus();
 }

 keymap.onChange(() => { if (!editing) render(); });
 profile.onchange = () => { keymap.setProfile(profile.value as ProfileId); status.dataset.auto = ''; status.textContent = msg`Perfil ${profile.selectedOptions[0]?.text ?? ''} ativo.`; };
 $<HTMLButtonElement>('#keymap-reset-profile').onclick = async () => { if (!await confirmDialog(t('Descartar todos os atalhos personalizados deste perfil?'), t('Descartar'))) return; keymap.resetProfile(); status.dataset.auto = ''; status.textContent = t('Perfil restaurado.'); };
 search.oninput = () => { if (!keyFilter) render(); };
 conflictsOnly.onchange = render;
 const stopKeySearch = () => { keyFilter = ''; byKey.setAttribute('aria-pressed', 'false'); delete search.dataset.keymapCapture; search.readOnly = false; search.value = ''; search.placeholder = t('Buscar ação pelo nome'); render(); };
 byKey.onclick = () => {
  if (byKey.getAttribute('aria-pressed') === 'true') { stopKeySearch(); search.focus(); return; }
  byKey.setAttribute('aria-pressed', 'true'); search.value = ''; search.readOnly = true; search.placeholder = t('Pressione o atalho… (Esc sai)'); search.focus();
 };
 // O gravador da busca só captura teclas no modo "Buscar por atalho"; no modo nome a digitação é normal.
 recorder(search, stroke => { keyFilter = stroke; search.value = fmt(stroke); render(); }, stopKeySearch, () => byKey.getAttribute('aria-pressed') === 'true');
 function close() { editing = ''; dialog.close(); if (previous?.isConnected) previous.focus(); }
 $<HTMLButtonElement>('#keymap-close').onclick = close;
 dialog.addEventListener('cancel', event => { event.preventDefault(); if (!editing && performance.now() - recorderEscape > 100) close(); });
 function show(filter = '') {
  previous = document.activeElement as HTMLElement | null;
  if (byKey.getAttribute('aria-pressed') === 'true') stopKeySearch();
  search.value = filter; status.textContent = ''; status.dataset.auto = '1';
  if (!dialog.open) dialog.showModal();
  render(); search.focus();
 }
 keymap.registerAction({ id: 'ide.keymap', label: 'Keymap', category: 'Configurações', aliases: 'atalhos teclado shortcuts keyboard keybindings', defaults: {}, run: () => show() });
 const appearance = document.getElementById('appearance-dialog');
 if (appearance) {
  const button = document.createElement('button'); button.type = 'button'; button.id = 'open-keymap'; button.className = 'keymap-open'; button.textContent = t('Keymap…');
  button.onclick = () => { (appearance as HTMLDialogElement).close(); show(); };
  appearance.querySelector('.appearance-footer')?.before(button);
 }
 return { show };
}
