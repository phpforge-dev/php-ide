// Tela "Keymap" (UI-KEYMAP-001): busca por nome e por tecla, edição, remoção, restauração e aviso de conflito.
import { t, html, msg } from './i18n';
import { confirmDialog } from './confirm-dialog';
import { keymap, profiles, formatStroke, strokeFromEvent, DOUBLE_SHIFT, type ProfileId, type ActionSpec } from './keymap';
import { openMenu } from './context-menu';
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
 dialog.innerHTML = html`<header><h2>Keymap</h2><button type="button" id="keymap-close" aria-label="Fechar keymap">×</button></header><div class="keymap-toolbar"><label for="keymap-profile">Perfil</label><select id="keymap-profile"></select><button type="button" id="keymap-gear" aria-haspopup="menu" aria-label="Opções do perfil" title="Opções do perfil"></button><button type="button" id="keymap-reset-profile">Restaurar perfil</button></div><div class="keymap-filters"><input id="keymap-search" type="search" autocomplete="off" aria-label="Buscar ação pelo nome" placeholder="Buscar ação pelo nome"><button type="button" id="keymap-by-key" aria-pressed="false" title="Pressione o atalho para ver quais ações o usam">Buscar por atalho</button><label><input type="checkbox" id="keymap-conflicts-only"> Só conflitos</label></div><p id="keymap-status" role="status"></p><div id="keymap-list"></div><footer>Salvo automaticamente nas configurações deste usuário. No gravador, Esc cancela e Shift duas vezes grava o Shift duplo; marque Segunda tecla para um atalho de duas teclas.</footer>`;
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
   if (keyFilter) return keymap.bindings(spec.id).some(binding => binding === keyFilter || binding.startsWith(keyFilter + ' '));
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
  // Same fields as the reference's Keyboard Shortcut dialog (capture 58): first stroke, "Second stroke" check
  // box with its own recorder, conflicts listed below (capture 59), Save disabled until a stroke is recorded.
  const box = document.createElement('div'); box.className = 'keymap-editor';
  const recorderField = (label: string) => { const field = document.createElement('span'); field.className = 'keymap-recorder'; field.tabIndex = 0; field.setAttribute('role', 'textbox'); field.setAttribute('aria-label', label); field.textContent = t('Pressione o atalho…'); return field; };
  const field = recorderField(msg`Pressione o novo atalho para ${name(id)}`);
  const secondLabel = document.createElement('label'); secondLabel.className = 'keymap-second';
  const secondCheck = document.createElement('input'); secondCheck.type = 'checkbox';
  const second = recorderField(msg`Segunda tecla do atalho para ${name(id)}`); second.setAttribute('aria-disabled', 'true'); second.tabIndex = -1;
  secondLabel.append(secondCheck, ' ' + t('Segunda tecla:'));
  const info = document.createElement('small'); info.setAttribute('role', 'status');
  const save = document.createElement('button'); save.type = 'button'; save.textContent = t('Salvar'); save.disabled = true;
  const replace = document.createElement('button'); replace.type = 'button'; replace.textContent = t('Salvar e remover dos outros'); replace.hidden = true;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = t('Cancelar');
  let first = '', next = '';
  const combined = () => first && secondCheck.checked && next ? first + ' ' + next : first;
  const evaluate = () => {
   const value = combined(); if (!value) { save.disabled = true; replace.hidden = true; info.textContent = ''; return; }
   const others = keymap.conflictingActions(value, id), already = keymap.bindings(id).includes(value);
   const notes = [already ? t('Esta ação já usa este atalho.') : '', others.length ? msg`Já atribuído a: ${others.map(name).join(', ')}.` : '', keymap.isReserved(value.split(' ')[0]) ? t('Atenção: pode ser capturado pelo sistema ou pela edição de texto.') : ''].filter(Boolean);
   info.textContent = notes.join(' ') || t('Atalho livre.');
   info.classList.toggle('keymap-warning', notes.length > 0);
   save.disabled = already || (secondCheck.checked && !next); replace.hidden = already || !others.length;
  };
  const close = (message = '') => { editing = ''; box.remove(); status.dataset.auto = message ? '' : '1'; status.textContent = message; render(); row.isConnected ? row.querySelector<HTMLElement>('[data-focus-key^="add:"]')?.focus() : dialog.querySelector<HTMLElement>(`[data-action="${CSS.escape(id)}"] [data-focus-key^="add:"]`)?.focus(); };
  recorder(field, value => { first = value; field.textContent = fmt(value); if (value === DOUBLE_SHIFT) { secondCheck.checked = false; secondCheck.dispatchEvent(new Event('change')); } else if (secondCheck.checked) second.focus(); evaluate(); }, () => close());
  recorder(second, value => { if (value === DOUBLE_SHIFT) return; next = value; second.textContent = fmt(value); evaluate(); }, () => close(), () => secondCheck.checked);
  secondCheck.onchange = () => { second.setAttribute('aria-disabled', String(!secondCheck.checked)); second.tabIndex = secondCheck.checked ? 0 : -1; if (secondCheck.checked) second.focus(); else { next = ''; second.textContent = t('Pressione o atalho…'); } evaluate(); };
  const commit = (removeFromOthers: boolean) => {
   const value = combined(); if (!value) return;
   try { keymap.addBinding(id, value, { removeFromOthers }); close(msg`${fmt(value)} atribuído a ${name(id)}.`); }
   catch (error) { info.textContent = String((error as Error).message ?? error); }
  };
  save.onclick = () => commit(false); replace.onclick = () => commit(true); cancel.onclick = () => close();
  box.append(field, secondLabel, second, save, replace, cancel, info); row.append(box); field.focus();
 }

 // Import/export (gear menu). PhpStorm's gear offers Duplicate… for bundled keymaps (capture 57) and exports
 // keymaps through Manage IDE Settings; here the gear exports this profile's customizations as JSON and imports
 // that JSON or a PhpStorm keymap XML (known actions mapped, others listed). Files are read, never executed.
 function exchange(kind: 'export' | 'import') {
  const box = document.createElement('dialog'); box.className = 'keymap-exchange'; box.setAttribute('aria-label', kind === 'export' ? t('Exportar atalhos') : t('Importar atalhos'));
  const heading = document.createElement('h3'); heading.textContent = kind === 'export' ? t('Exportar atalhos') : t('Importar atalhos');
  const note = document.createElement('p'); note.textContent = kind === 'export' ? t('Personalizações do perfil atual. Copie e guarde o texto em um arquivo .json.') : t('Cole um export desta IDE (JSON) ou um keymap do PhpStorm (XML), ou escolha o arquivo.');
  const text = document.createElement('textarea'); text.spellcheck = false; text.rows = 12; text.setAttribute('aria-label', heading.textContent);
  const result = document.createElement('p'); result.className = 'keymap-exchange-result'; result.setAttribute('role', 'status');
  const actions = document.createElement('div'); actions.className = 'keymap-exchange-actions';
  const done = () => { box.close(); box.remove(); dialog.querySelector<HTMLElement>('#keymap-gear')?.focus(); };
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = t('Fechar'); closeButton.onclick = done;
  if (kind === 'export') {
   text.readOnly = true; text.value = keymap.exportProfile();
   const copyButton = document.createElement('button'); copyButton.type = 'button'; copyButton.className = 'primary'; copyButton.textContent = t('Copiar');
   copyButton.onclick = async () => { try { await navigator.clipboard.writeText(text.value); result.textContent = t('Copiado para a área de transferência.'); } catch { text.select(); result.textContent = t('Selecionado: copie com o atalho do sistema.'); } };
   actions.append(copyButton, closeButton);
  } else {
   const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,.xml,application/json,text/xml'; file.hidden = true;
   const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = t('Escolher arquivo…'); choose.onclick = () => file.click();
   file.onchange = async () => { const picked = file.files?.[0]; if (picked) { text.value = await picked.text(); result.textContent = picked.name; } };
   const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'primary'; apply.textContent = t('Importar');
   apply.onclick = () => {
    try {
     const report = keymap.importProfile(text.value);
     result.textContent = msg`${report.applied.length} ação(ões) importada(s) no perfil atual.` + (report.skipped.length ? ' ' + msg`Sem equivalente: ${report.skipped.join(', ')}.` : '') + (report.invalid.length ? ' ' + msg`Atalhos inválidos ignorados em: ${report.invalid.join(', ')}.` : '');
     status.dataset.auto = ''; status.textContent = result.textContent;
    } catch (error) { result.textContent = String((error as Error).message ?? error); }
   };
   actions.append(file, choose, apply, closeButton);
  }
  box.append(heading, note, text, result, actions); dialog.append(box);
  box.addEventListener('cancel', event => { event.preventDefault(); done(); });
  box.showModal(); (kind === 'export' ? text : text).focus();
 }
 const gear = $<HTMLButtonElement>('#keymap-gear');
 gear.onclick = () => { const r = gear.getBoundingClientRect(); openMenu([
  { id: 'export', label: t('Exportar…'), run: () => exchange('export') },
  { id: 'import', label: t('Importar…'), run: () => exchange('import') },
  '-',
  { id: 'reset', label: t('Restaurar padrões'), run: () => $<HTMLButtonElement>('#keymap-reset-profile').click() },
 ], r.left, r.bottom + 2, { restore: gear, label: t('Opções do perfil') }); };

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
 // Conflict chooser at dispatch: several enabled actions share the shortcut in the same context (public help,
 // "Keyboard shortcuts conflicts": a popup lists them). Arrows/Enter choose, Esc cancels.
 keymap.chooser = (actions: ActionSpec[], stroke: string, run: (id: string) => void) => {
  document.querySelector('.keymap-chooser')?.remove();
  const previous = document.activeElement as HTMLElement | null;
  const box = document.createElement('div'); box.className = 'keymap-chooser'; box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', msg`Ações com ${fmt(stroke)}`);
  const title = document.createElement('div'); title.className = 'keymap-chooser-title'; title.textContent = msg`Escolha a ação para ${fmt(stroke)}`; box.append(title);
  const close = (restore = true) => { box.remove(); document.removeEventListener('mousedown', outside, true); if (restore && previous?.isConnected) previous.focus(); };
  const outside = (event: MouseEvent) => { if (!box.contains(event.target as Node)) close(false); };
  const options = actions.map((spec, index) => {
   const option = document.createElement('div'); option.setAttribute('role', 'option'); option.tabIndex = -1; option.textContent = t(spec.label);
   if (spec.category) { const category = document.createElement('small'); category.textContent = t(spec.category); option.append(category); }
   option.setAttribute('aria-selected', String(index === 0));
   option.onmouseenter = () => pick(option); option.onclick = () => { close(); run(spec.id); };
   box.append(option); return option;
  });
  const pick = (option: HTMLElement) => { for (const item of options) item.setAttribute('aria-selected', String(item === option)); option.focus(); };
  box.addEventListener('keydown', event => {
   const at = options.findIndex(o => o.getAttribute('aria-selected') === 'true');
   if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); pick(options[(at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]); }
   else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); options[Math.max(0, at)].click(); }
   else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });
  box.dataset.keymapCapture = '';
  document.body.append(box);
  const anchor = previous?.getBoundingClientRect(); const size = box.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min((anchor && anchor.width ? anchor.left + 12 : (innerWidth - size.width) / 2), innerWidth - size.width - 8)) + 'px';
  box.style.top = Math.max(8, Math.min((anchor && anchor.height ? anchor.top + Math.min(anchor.height, 24) : innerHeight / 3), innerHeight - size.height - 8)) + 'px';
  pick(options[0]); document.addEventListener('mousedown', outside, true);
 };
 // First stroke of a chord: the status bar says it waits for the second one; the previous text comes back after.
 let before: string | null = null;
 keymap.onPending = stroke => {
  const bar = document.getElementById('status'); if (!bar) return;
  if (stroke) { before ??= bar.textContent; bar.textContent = msg`${fmt(stroke)} pressionado. Aguardando a segunda tecla…`; }
  else if (before !== null) { bar.textContent = before; before = null; }
 };
 return { show };
}
