import { t as tr, msg, html } from './i18n';
import * as monaco from 'monaco-editor';
type Location = {uri: monaco.Uri; range: monaco.IRange};
export function mountUsages(editor: monaco.editor.IStandaloneCodeEditor, hooks: {
 /** `null`: o usuário cancelou (ex.: pergunta do método base). */
 find(model: monaco.editor.ITextModel, position: monaco.Position, options: { lens?: boolean }): Promise<Location[] | null>;
 open(location: Location): Promise<void>;
 status(message: string): void;
}) {
 let popup: HTMLElement | undefined; let generation = 0;
 function close() { generation++; popup?.remove(); popup = undefined; }
 /** `single: 'jump'` (⌘B numa declaração): com um único uso, navega direto e mostra uma dica, como Declaration or Usages. */
 async function show(position = editor.getPosition(), options: { single?: 'jump'; lens?: boolean } = {}) {
  const model = editor.getModel(); if (!model || !position) return;
  close(); const token = generation;
  const symbol = model.getWordAtPosition(position)?.word ?? tr('símbolo');
  const root = document.createElement('section'); popup = root; root.className = 'usages-popup'; root.setAttribute('role','dialog'); root.setAttribute('aria-label',`Usos de ${symbol}`);
  root.innerHTML = html('<header><strong></strong><span class="usages-count"></span><button aria-label="Fechar referências">×</button></header><input type="search" aria-label="Filtrar referências" placeholder="Filtrar por arquivo ou código…"><div class="usages-results" role="list"></div><footer>↑ ↓ navegar · Enter abrir · Esc fechar</footer>');
  root.querySelector('strong')!.textContent = `Usos de ${symbol}`;
  root.querySelector('button')!.onclick = () => { close(); editor.focus(); };
  document.body.append(root);
  const rect = editor.getDomNode()!.getBoundingClientRect(); const point = editor.getScrolledVisiblePosition(position);
  root.style.left = Math.max(8,Math.min(rect.left + (point?.left ?? 50),innerWidth - 680))+'px';
  root.style.top = Math.max(8,Math.min(rect.top + (point?.top ?? 40) + (point?.height ?? 20),innerHeight - 390))+'px';
  const results = root.querySelector<HTMLElement>('.usages-results')!; results.textContent = tr('Buscando referências no projeto…');
  const filter = root.querySelector('input')!; filter.focus();
  root.addEventListener('keydown', e => {
   if(e.key === 'Escape') { e.preventDefault(); close(); editor.focus(); }
   const buttons = [...results.querySelectorAll<HTMLButtonElement>('button')];
   const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
   if(e.key==='ArrowDown' || e.key==='ArrowUp') { e.preventDefault(); buttons[(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus(); }
   if(e.key==='Enter' && document.activeElement===filter) { e.preventDefault(); buttons[0]?.click(); }
  });
  try {
   const found = await hooks.find(model, position, options); if(token!==generation) return;
   if(found === null) { close(); editor.focus(); hooks.status(tr('Busca de usos cancelada.')); return; }
   const seen = new Set<string>(); const rows = found.filter(location => { const key = location.uri.toString()+JSON.stringify(location.range); if(seen.has(key))return false;seen.add(key);return true; }).map(location => {
    const source = monaco.editor.getModel(location.uri);
    const path = location.uri.path; const snippet = source?.getLineContent(location.range.startLineNumber).trim() ?? '';
    return {location,path,snippet};
   }).sort((a,b)=>a.path.localeCompare(b.path)||a.location.range.startLineNumber-b.location.range.startLineNumber);
   if(options.single==='jump' && rows.length===1) {
    close(); await hooks.open(rows[0].location);
    const message = editor.getContribution<any>('editor.contrib.messageController');
    message?.showMessage?.(msg`É o único uso nos arquivos do projeto · Encontrar usos (${/Mac/.test(navigator.platform) ? '⌥F7' : 'Alt+F7'})`, editor.getPosition());
    hooks.status(tr('É o único uso nos arquivos do projeto')); return;
   }
   root.querySelector('.usages-count')!.textContent = msg`${rows.length} referência(s)`;
   function render() {
    results.replaceChildren(); const query = filter.value.toLocaleLowerCase();
    const visible = rows.filter(r=>(r.path+' '+r.snippet).toLocaleLowerCase().includes(query));
    if(!visible.length) { results.textContent = rows.length ? tr('Nenhuma referência corresponde ao filtro.') : tr('Nenhum uso encontrado para este símbolo.'); return; }
    for(const row of visible) {
     const button = document.createElement('button'); button.type='button'; button.className='usage-result'; button.setAttribute('role','listitem');
     const file = document.createElement('span'); file.className='usage-path'; file.textContent=`${row.path.split('/').slice(-3).join('/')} : ${row.location.range.startLineNumber}`;
     file.title=row.path; const code=document.createElement('code'); code.textContent=row.snippet; button.append(file,code);
     button.onclick=()=>{ close(); void hooks.open(row.location).catch(error=>hooks.status(msg`Falha ao abrir referência: ${String(error)}`)); }; results.append(button);
    }
   }
   filter.oninput=render; render();
  } catch(error) { if(token===generation) results.textContent=msg`Não foi possível buscar referências: ${String(error)}`; }
 }
 // CodeLens executes its command during mousedown; dismiss before that command creates a popup.
 document.addEventListener('pointerdown',e=>{if(popup && !popup.contains(e.target as Node) && !(e.target as HTMLElement).closest('#references')) close();});
 editor.onDidChangeModel(close); editor.onDidChangeModelContent(close);
 editor.addAction({id:'php-ide.showUsages',label:tr('Mostrar usos do símbolo'),keybindings:[monaco.KeyMod.Alt|monaco.KeyCode.F7,monaco.KeyMod.CtrlCmd|monaco.KeyMod.Alt|monaco.KeyCode.F7],contextMenuGroupId:'navigation',contextMenuOrder:1.5,run:()=>show()});
 return {show,close};
}

/** Pergunta do Find Usages num método que implementa/sobrescreve outro: atual, base ou cancelar. */
export function askBaseMethod(method: string, owner: string, base: string, implementsBase: boolean): Promise<'current' | 'base' | undefined> {
 return new Promise(resolve => {
  const d = document.createElement('dialog'); d.className = 'project-dialog usages-base-dialog';
  const form = document.createElement('form'); form.method = 'dialog';
  const p = document.createElement('p'); p.textContent = implementsBase ? msg`O método '${method}()' da classe '${owner}' implementa o método de '${base}'. Deseja buscar os usos do método base?` : msg`O método '${method}()' da classe '${owner}' sobrescreve o método de '${base}'. Deseja buscar os usos do método base?`;
  const footer = document.createElement('footer');
  for (const [value, label, primary] of [['cancel', tr('Cancelar'), false], ['current', tr('Método atual'), false], ['base', tr('Método base'), true]] as const) { const b = document.createElement('button'); b.value = value; b.textContent = label; if (primary) b.className = 'primary'; footer.append(b); }
  form.append(p, footer); d.append(form); document.body.append(d);
  d.addEventListener('close', () => { const v = d.returnValue; d.remove(); resolve(v === 'current' || v === 'base' ? v : undefined); });
  d.showModal(); footer.querySelector<HTMLButtonElement>('.primary')?.focus();
 });
}

/** Escolha entre vários destinos (Go to Implementation); Enter abre, Esc fecha. */
export function chooseTarget<T extends { label: string; detail: string }>(editor: monaco.editor.IStandaloneCodeEditor, title: string, items: T[]): Promise<T | undefined> {
 return new Promise(resolve => {
  document.querySelector('.implementations-popup')?.remove();
  const root = document.createElement('section'); root.className = 'usages-popup implementations-popup'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', title);
  const header = document.createElement('header'); const strong = document.createElement('strong'); strong.textContent = title; header.append(strong);
  const list = document.createElement('div'); list.className = 'usages-results'; list.setAttribute('role', 'list');
  let done = false; const finish = (value?: T) => { if (done) return; done = true; root.remove(); document.removeEventListener('pointerdown', outside, true); if (!value) editor.focus(); resolve(value); };
  const outside = (e: Event) => { if (!root.contains(e.target as Node)) finish(); };
  for (const item of items) {
   const b = document.createElement('button'); b.type = 'button'; b.className = 'usage-result'; b.setAttribute('role', 'listitem');
   const name = document.createElement('code'); name.textContent = item.label; const path = document.createElement('span'); path.className = 'usage-path'; path.textContent = item.detail;
   b.append(name, path); b.onclick = () => finish(item); list.append(b);
  }
  const footer = document.createElement('footer'); footer.textContent = tr('↑ ↓ navegar · Enter abrir · Esc fechar');
  root.append(header, list, footer); document.body.append(root);
  const rect = editor.getDomNode()!.getBoundingClientRect(); const point = editor.getScrolledVisiblePosition(editor.getPosition()!);
  root.style.left = Math.max(8, Math.min(rect.left + (point?.left ?? 50), innerWidth - 680)) + 'px';
  root.style.top = Math.max(8, Math.min(rect.top + (point?.top ?? 40) + (point?.height ?? 20), innerHeight - 320)) + 'px';
  root.addEventListener('keydown', e => {
   const buttons = [...list.querySelectorAll<HTMLButtonElement>('button')]; const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
   if (e.key === 'Escape') { e.preventDefault(); finish(); }
   if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  });
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  list.querySelector<HTMLButtonElement>('button')?.focus();
 });
}
