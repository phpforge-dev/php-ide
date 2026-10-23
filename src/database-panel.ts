import './database-connection.css';
import { toolIcon } from './tool-window';
import { t as tr, msg, html } from './i18n';
import type { DataSource, DatabaseDriver, DatabasePage, DatabaseSession, IdeApi, RedisEdit } from '../shared/contracts';
import { buildUrl, defaultName, driverInfo, drivers, newSource, normalizeSource, parseUrl, plannedDrivers, toInput, validateSource } from '../shared/datasource';

const badge = (driver: DatabaseDriver) => { const b = document.createElement('span'); b.className = `driver-badge driver-${driver}`; b.textContent = driverInfo(driver).badge; b.setAttribute('aria-hidden', 'true'); return b; };
const uid = () => crypto.randomUUID();

/** Janela Database: fontes de dados do projeto, diálogo "Fontes de dados e drivers" e prévia de tabelas. */
export function mountDatabase(api: IdeApi, hooks: { openConsole(session: DatabaseSession): void; disconnected(id: string): void }) {
  const root = document.getElementById('db')!;
  root.innerHTML = html('<div class="tool-heading"><h3>Database</h3><div class="db-toolbar" role="toolbar" aria-label="Ações de banco"><button type="button" id="db-add" title="Nova fonte de dados">＋</button><button type="button" id="db-properties" title="Propriedades da fonte de dados" disabled>⚙</button><button type="button" id="db-refresh" title="Atualizar" disabled>⟳</button><button type="button" id="db-disconnect" title="Desconectar" disabled>⏻</button><button type="button" id="db-console-open" title="Abrir console" disabled>&gt;_</button></div></div><div class="db-empty"><span class="database-emblem">▤</span><strong>Conecte seu banco</strong><p>PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, SQLite e Redis. Explore schemas, abra tabelas e execute comandos sem sair do editor.</p><button type="button" id="db-empty-add">Nova fonte de dados</button><button type="button" id="db-empty-import" class="db-import-link">Importar do Laravel .env…</button></div><p id="db-result" role="status" aria-live="polite"></p><div id="db-sources" role="tree" aria-label="Fontes de dados"></div>');

  // Diálogo de fontes de dados
  const dialog = document.createElement('dialog'); dialog.className = 'connection-dialog datasources-dialog'; dialog.setAttribute('aria-label', tr('Fontes de dados e drivers'));
  dialog.innerHTML = html('<form id="connection-form" novalidate></form>'); document.body.append(dialog);
  const form = dialog.querySelector('form')!;
  const driverOptions = drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  form.innerHTML = html`<header><h2>Fontes de dados e drivers</h2><button type="button" id="db-dialog-close" aria-label="Fechar conexão">×</button></header>
<div class="connection-body">
 <aside class="ds-sidebar">
  <div class="ds-actions" role="toolbar" aria-label="Fontes de dados"><button type="button" id="ds-new" title="Adicionar fonte de dados" aria-haspopup="menu">＋</button><button type="button" id="ds-remove" title="Remover">−</button><button type="button" id="ds-duplicate" title="Duplicar">⧉</button></div>
  <div class="driver-menu" id="ds-driver-menu" role="menu" hidden><small>Fonte de dados</small><div class="driver-list"></div><p class="planned">Planejados: ${plannedDrivers.join(', ')}</p></div>
  <button type="button" id="ds-import-env" class="ds-import-button">Importar do Laravel .env…</button><div class="ds-import-picker" id="ds-import-picker" hidden><label>Arquivo de ambiente<select id="ds-env-file"></select></label><button type="button" id="ds-import-read">Importar conexão</button></div><p id="ds-import-status" role="status" aria-live="polite"></p>
  <small class="ds-group">Fontes de dados do projeto</small>
  <ul class="ds-list" id="ds-list" role="listbox" aria-label="Fontes de dados do projeto"></ul>
 </aside>
 <section class="connection-settings">
  <div class="ds-none" id="ds-none"><p>Nenhuma fonte de dados. Use ＋ para escolher um driver.</p></div>
  <div class="ds-editor" id="ds-editor"><div class="ds-driver-heading"><span id="ds-driver-symbol"></span><div><strong id="ds-driver-title"></strong><span>Configuração da conexão</span></div></div>
   <div class="ds-head"><label class="inline">Nome:<input name="name" autocomplete="off"></label><button type="button" id="ds-reset-name" title="Restaurar nome padrão">↺</button></div>

   <div class="ds-tabs" role="tablist"><button type="button" role="tab" data-tab="general" aria-selected="true">Geral</button><button type="button" role="tab" data-tab="options" aria-selected="false">Opções</button><button type="button" role="tab" data-tab="ssh" aria-selected="false">SSH/SSL</button><button type="button" role="tab" data-tab="schemas" aria-selected="false">Schemas</button></div>
   <div class="ds-panel" data-panel="general" role="tabpanel">
    <label class="grid">Driver:<select name="driver">${driverOptions}</select></label>
    <div class="grid-row host-row"><label class="grid">Host:<input name="host" autocomplete="off"></label><label class="port">Porta:<input name="port" type="number" min="1" max="65535"></label></div>
    <div class="grid-row file-row"><label class="grid">Arquivo:<input name="file" autocomplete="off" placeholder="/caminho/para/banco.sqlite"></label><button type="button" data-pick="sqlite" title="Escolher arquivo">…</button></div>
    <label class="grid auth-row">Autenticação:<select name="auth"><option value="password">Usuário e senha</option><option value="none">Sem autenticação</option></select></label>
    <label class="grid user-row">Usuário:<input name="user" autocomplete="off"></label>
    <div class="grid-row password-row"><label class="grid">Senha:<input name="password" type="password" autocomplete="off"></label><label class="port">Salvar:<select name="savePassword"><option value="session">Até reiniciar</option><option value="never">Nunca</option></select></label></div>
    <label class="grid connect-row">Tipo de conexão:<select name="connectType"><option value="service">Service name</option><option value="sid">SID</option></select></label>
    <label class="grid database-row"><span id="ds-database-label">Banco de dados:</span><input name="database" autocomplete="off"></label>
    <label class="grid">URL:<input name="url" autocomplete="off" spellcheck="false"></label>
    <p class="ds-hint" id="ds-hint"></p><p id="ds-import-note" class="ds-import-note" hidden></p>
   </div>
   <div class="ds-panel" data-panel="options" role="tabpanel" hidden><label class="grid">Comentário:<input name="comment" autocomplete="off"></label>
    <label class="check"><input name="readOnly" type="checkbox"> Somente leitura</label><p class="ds-hint" id="ds-readonly-hint"></p>
    <label class="stack">Script de inicialização (executado em cada conexão)<textarea name="startup" rows="5" spellcheck="false" placeholder="SET search_path TO app, public;"></textarea></label>
   </div>
   <div class="ds-panel" data-panel="ssh" role="tabpanel" hidden>
    <fieldset class="ssh-fields"><legend><label class="check"><input name="sshEnabled" type="checkbox"> Usar túnel SSH</label></legend>
     <div class="grid-row"><label class="grid">Host:<input name="sshHost" autocomplete="off"></label><label class="port">Porta:<input name="sshPort" type="number" min="1" max="65535"></label></div>
     <label class="grid">Usuário:<input name="sshUser" autocomplete="off"></label>
     <div class="grid-row"><label class="grid">Chave privada:<input name="sshKey" autocomplete="off" placeholder="Agente SSH ou ~/.ssh/config"></label><button type="button" data-pick="key" title="Escolher chave">…</button></div>
     <p class="ds-hint">Autenticação por chave ou agente (ssh do sistema). Senha SSH não é suportada.</p>
    </fieldset>
    <fieldset class="ssl-fields"><legend>SSL</legend>
     <label class="grid">Modo:<select name="sslMode"><option value="disable">Desativado</option><option value="prefer">Preferir</option><option value="require">Exigir</option><option value="verify-ca">Verificar CA</option><option value="verify-full">Verificação completa</option></select></label>
     <div class="grid-row ca-row"><label class="grid">Arquivo CA:<input name="sslCa" autocomplete="off"></label><button type="button" data-pick="cert" title="Escolher certificado">…</button></div>
    </fieldset>
   </div>
   <div class="ds-panel" data-panel="schemas" role="tabpanel" hidden>
    <label class="check"><input name="allSchemas" type="checkbox"> Mostrar todos os schemas</label>
    <div class="schema-list" id="ds-schemas"></div>
    <button type="button" id="ds-load-schemas">Carregar schemas</button>
   </div>

  </div>
 </section>
</div>
<footer><div class="ds-test"><button type="button" id="db-test" class="link">Testar conexão</button><span id="db-connection-result" role="status" aria-live="polite"></span></div><button type="button" id="db-cancel">Cancelar</button><button type="button" id="db-apply">Aplicar</button><button id="db-connect" class="primary">Conectar</button></footer>`;
  const menuList = form.querySelector<HTMLElement>('.driver-menu .driver-list')!;
  for (const d of drivers) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.dataset.driver = d.id; b.append(badge(d.id), d.name); menuList.append(b); }

  const passwordDialog = document.createElement('dialog'); passwordDialog.className = 'connection-dialog db-password-dialog';
  passwordDialog.innerHTML = html('<form method="dialog"><header><h2 id="db-password-title">Senha</h2></header><div class="connection-settings"><label class="grid">Senha:<input name="password" type="password" autocomplete="off"></label><label class="grid">Salvar:<select name="savePassword"><option value="session">Até reiniciar</option><option value="never">Nunca</option></select></label></div><footer><button type="button" value="cancel" id="db-password-cancel">Cancelar</button><button value="ok" class="primary">Conectar</button></footer></form>');
  document.body.append(passwordDialog);

  const panel = document.createElement('section'); panel.id = 'data-panel'; panel.hidden = true;
  panel.innerHTML = html('<div class="data-toolbar"><strong id="data-title"></strong><button id="data-rows">Dados</button><button id="data-columns">Estrutura</button><button id="data-close" aria-label="Fechar prévia de dados">×</button></div><div class="data-toolbar redis-actions" id="redis-actions" role="toolbar" aria-label="Edição Redis" hidden><button type="button" id="redis-add">＋ Adicionar</button><button type="button" id="redis-edit">Editar valor</button><button type="button" id="redis-remove">Remover item</button><button type="button" id="redis-ttl">TTL…</button><button type="button" id="redis-rename">Renomear chave…</button><button type="button" id="redis-delete">Excluir chave</button></div><div id="data-message" role="status"></div><div id="data-grid" tabindex="0" aria-label="Resultados da tabela"></div><div class="data-toolbar"><button id="data-prev">Anterior</button><span id="data-range"></span><button id="data-next">Próxima</button><button id="data-refresh">Atualizar</button></div>');
  document.querySelector('.code')!.append(panel);
  const editDialog = document.createElement('dialog'); editDialog.className = 'connection-dialog redis-edit-dialog';
  editDialog.innerHTML = html('<form method="dialog"><header><h2 id="redis-edit-title"></h2></header><div class="connection-settings" id="redis-edit-fields"></div><p class="ds-hint" id="redis-edit-note"></p><footer><button type="button" id="redis-edit-cancel">Cancelar</button><button value="ok" class="primary" id="redis-edit-ok">OK</button></footer></form>');
  document.body.append(editDialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const field = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement = HTMLInputElement>(name: string) => form.elements.namedItem(name) as T;

  toolIcon(el('ds-new'),'<path d="M12 5v14M5 12h14"/>',tr('Adicionar fonte de dados'));
  toolIcon(el('ds-remove'),'<path d="M5 12h14"/>',tr('Remover'));
  toolIcon(el('ds-duplicate'),'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',tr('Duplicar'));
  let importRequest=0;
  const imported=new Map<string,string>();
  async function chooseEnv(){
    const token=++importRequest;const version=epoch;el('ds-driver-menu').hidden=true;el('ds-import-status').textContent=tr('Procurando arquivos .env…');el('ds-import-picker').hidden=true;
    try{const files=await api.databaseLaravelFiles();if(token!==importRequest||version!==epoch||!dialog.open)return;
      const select=el<HTMLSelectElement>('ds-env-file');select.replaceChildren(...files.map(file=>new Option(file,file)));el('ds-import-picker').hidden=!files.length;
      el('ds-import-status').textContent=files.length?tr('Selecione o ambiente. A importação não conecta ao banco.'):tr('Nenhum arquivo .env encontrado na raiz do projeto.');
    }catch(error){if(token===importRequest&&dialog.open)el('ds-import-status').textContent=tr(String(error));}
  }
  el('ds-import-env').onclick=()=>void chooseEnv();
  el('ds-import-read').onclick=async()=>{
    const token=++importRequest;const version=epoch;const file=el<HTMLSelectElement>('ds-env-file').value;if(!file)return;
    el<HTMLButtonElement>('ds-import-read').disabled=true;el('ds-import-status').textContent=tr('Lendo conexão…');
    try{const result=await api.databaseImportLaravel(file);if(token!==importRequest||version!==epoch||!dialog.open)return;
      const source=newSource(result.driver,uid());Object.assign(source,{host:result.host,port:result.port,database:result.database,user:result.user,file:result.file});source.name=defaultName(source);source.comment='Laravel · '+file;
      typed.set(source.id,result.password);imported.set(source.id,[msg`Importado de ${file}. Revise os campos antes de conectar.`,...result.warnings.map(tr)].join(' '));
      drafts.push(source);edit(source.id);showTab('general');el('ds-import-picker').hidden=true;el('ds-import-status').textContent=tr('Conexão importada para revisão.');field(driverInfo(source.driver).file?'file':'host').focus();
    }catch(error){if(token===importRequest&&dialog.open)el('ds-import-status').textContent=tr(String(error));}
    finally{el<HTMLButtonElement>('ds-import-read').disabled=false;}
  };
  let sources: DataSource[] = [];
  const sessions = new Map<string, DatabaseSession>();
  let selected: string | undefined;
  /** Redis: `tokens` guarda o cursor de cada página já visitada (HSCAN/SSCAN/XRANGE). */
  let selection: { session: DatabaseSession; schema: string; table: string; offset: number; tokens: Map<number, string | null>; row?: number } | undefined;
  let page: DatabasePage | undefined;
  let mode: 'rows' | 'columns' = 'rows';
  let epoch = 0; let request = 0;
  function message(text: string) { el('db-result').textContent = text; }

  // Prévia de dados
  function render() {
    if (!page) return;
    el('data-rows').setAttribute('aria-pressed', String(mode === 'rows')); el('data-columns').setAttribute('aria-pressed', String(mode === 'columns'));
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    const labels = mode === 'rows' ? page.columns.map(c => c.name) : ['Coluna', 'Tipo', 'Nulo', 'Chave'];
    for (const label of labels) { const th = document.createElement('th'); th.textContent = label; head.append(th); }
    const body = table.createTBody();
    const rows = mode === 'rows' ? page.rows : page.columns.map(c => [c.name, c.type, c.nullable ? 'Sim' : tr('Não'), c.primary ? 'PK' : '']);
    const redis = !!page.kind && mode === 'rows';
    for (const [index, values] of rows.entries()) {
      const row = body.insertRow();
      if (redis) { row.setAttribute('aria-selected', String(selection?.row === index)); row.onclick = () => pick(index); row.ondblclick = () => { pick(index); void editItem(); }; }
      for (const value of values) { const cell = row.insertCell(); cell.textContent = value === null ? tr('NULL') : value.length > page.cellLimit ? value.slice(0, page.cellLimit) + '…' : value; if (value === null) cell.className = 'null-value'; }
    }
    el('data-grid').replaceChildren(table);
    el('data-range').textContent = page.rows.length ? `${page.offset + 1}–${page.offset + page.rows.length}` : tr('Tabela vazia');
    el<HTMLButtonElement>('data-prev').disabled = !page.offset;
    el<HTMLButtonElement>('data-next').disabled = !page.hasMore;
    el('redis-actions').hidden = !page.kind;
    if (page.kind) { redisButtons(); el('data-message').textContent = page.meta + ' · ' + (page.kind === 'stream' ? tr('Streams são somente leitura na prévia; use XADD/XDEL no console.') : page.kind === 'hash' || page.kind === 'set' ? tr('Ordem do SCAN. Duplo clique ou Enter edita; Delete remove o item.') : tr('Duplo clique ou Enter edita; Delete remove o item.')); return; }
    el('data-message').textContent = (page.meta ? page.meta + ' · ' : '') + msg`Somente leitura · células limitadas a ${page.cellLimit} caracteres. ${page.ordered ? tr('Ordenação pela chave primária.') : tr('Sem chave primária: ordem e paginação podem variar.')}`;
  }
  function pick(index: number) { if (!selection || !page) return; selection.row = Math.max(0, Math.min(index, page.rows.length - 1)); el('data-grid').querySelectorAll('tbody tr').forEach((r, i) => r.setAttribute('aria-selected', String(i === selection!.row))); redisButtons(); }
  function redisButtons() {
    const kind = page?.kind; const row = selection?.row !== undefined && !!page?.rows[selection.row];
    el<HTMLButtonElement>('redis-add').disabled = !kind || kind === 'string' || kind === 'stream';
    el<HTMLButtonElement>('redis-edit').disabled = !kind || kind === 'stream' || (!row && kind !== 'string');
    el<HTMLButtonElement>('redis-remove').disabled = !kind || kind === 'string' || kind === 'stream' || !row;
  }

  // Edição Redis: diálogo genérico; senhas nunca passam por aqui.
  type Field = { name: string; label: string; value?: string; multiline?: boolean; type?: string };
  function ask(title: string, fields: Field[], note = ''): Promise<Record<string, string> | undefined> {
    el('redis-edit-title').textContent = title; el('redis-edit-note').textContent = note;
    const box = el('redis-edit-fields'); box.replaceChildren();
    for (const f of fields) {
      const label = document.createElement('label'); label.className = f.multiline ? 'stack' : 'grid'; label.append(f.label);
      const input = document.createElement(f.multiline ? 'textarea' : 'input') as HTMLInputElement; input.name = f.name; input.value = f.value ?? ''; input.spellcheck = false;
      if (f.multiline) (input as unknown as HTMLTextAreaElement).rows = 8; else { input.type = f.type ?? 'text'; input.autocomplete = 'off'; if (f.type === 'number') input.step = 'any'; }
      label.append(input); box.append(label);
    }
    el('redis-edit-ok').textContent = fields.length ? tr('Salvar') : tr('Excluir');
    editDialog.showModal(); (box.querySelector('input,textarea') as HTMLElement | null ?? el('redis-edit-ok')).focus();
    return new Promise(resolve => {
      el('redis-edit-cancel').onclick = () => editDialog.close('cancel');
      editDialog.addEventListener('close', () => {
        const ok = editDialog.returnValue === 'ok'; editDialog.returnValue = '';
        resolve(ok ? Object.fromEntries([...box.querySelectorAll<HTMLInputElement>('input,textarea')].map(i => [i.name, i.value])) : undefined);
      }, { once: true });
    });
  }
  const clipped = (v: string | null | undefined) => !!page && (v ?? '').length > page.cellLimit;
  async function redis(edit: RedisEdit, done: string, key = selection?.table) {
    if (!selection) return false; const current = selection;
    try {
      await api.databaseRedisEdit(current.session.id, current.schema, edit);
      if (key !== current.table) current.table = key!;
      message(done); await load(); return true;
    } catch (error) { el('data-message').textContent = String(error); message(String(error)); return false; }
  }
  async function full(edit: RedisEdit): Promise<string | undefined> {
    if (!selection) return;
    try { return (await api.databaseRedisEdit(selection.session.id, selection.schema, edit)).value ?? ''; }
    catch (error) { el('data-message').textContent = String(error); }
  }
  const row = () => (selection?.row !== undefined ? page?.rows[selection.row] : undefined);
  async function editItem() {
    if (!selection || !page?.kind) return; const key = selection.table; const r = row();
    switch (page.kind) {
      case 'string': { const old = await full({ op: 'get', kind: 'string', key }); if (old === undefined) return; const v = await ask(msg`Editar ${key}`, [{ name: 'value', label: tr('Valor'), value: old, multiline: true }]); if (v) await redis({ op: 'set', key, old, value: v.value }, tr('Valor salvo.')); return; }
      case 'hash': { if (!r) return; const field = r[0] ?? ''; if (clipped(field)) { el('data-message').textContent = tr('Campo longo demais para editar pela prévia; use o console.'); return; }
        const old = await full({ op: 'get', kind: 'hash', key, field }); if (old === undefined) return;
        const v = await ask(msg`Editar campo de ${key}`, [{ name: 'field', label: tr('Campo'), value: field }, { name: 'value', label: tr('Valor'), value: old, multiline: true }]);
        if (v) await redis({ op: 'hset', key, field, old, newField: v.field, value: v.value }, tr('Campo salvo.')); return; }
      case 'list': { if (!r) return; const index = Number(r[0]); const old = await full({ op: 'get', kind: 'list', key, index }); if (old === undefined) return;
        const v = await ask(msg`Editar item ${index} de ${key}`, [{ name: 'value', label: tr('Valor'), value: old, multiline: true }]);
        if (v) await redis({ op: 'lset', key, index, old, value: v.value }, tr('Item salvo.')); return; }
      case 'set': { if (!r) return; const member = r[0] ?? ''; if (clipped(member)) { el('data-message').textContent = tr('Membro longo demais para editar pela prévia; use o console.'); return; }
        const v = await ask(msg`Editar membro de ${key}`, [{ name: 'value', label: tr('Membro'), value: member, multiline: true }]);
        if (v) await redis({ op: 'sreplace', key, member, value: v.value }, tr('Membro salvo.')); return; }
      case 'zset': { if (!r) return; const member = r[0] ?? ''; if (clipped(member)) { el('data-message').textContent = tr('Membro longo demais para editar pela prévia; use o console.'); return; }
        const v = await ask(msg`Editar membro de ${key}`, [{ name: 'member', label: tr('Membro'), value: member }, { name: 'score', label: tr('Score'), value: r[1] ?? '0', type: 'number' }]);
        if (v) await redis({ op: 'zadd', key, old: member, member: v.member, score: Number(v.score) }, tr('Membro salvo.')); return; }
    }
  }
  async function addItem() {
    if (!selection || !page?.kind) return; const key = selection.table;
    const fields: Record<string, Field[]> = { hash: [{ name: 'field', label: tr('Campo') }, { name: 'value', label: tr('Valor'), multiline: true }], list: [{ name: 'value', label: tr('Valor (adicionado ao fim)'), multiline: true }], set: [{ name: 'member', label: tr('Membro') }], zset: [{ name: 'member', label: tr('Membro') }, { name: 'score', label: tr('Score'), value: '0', type: 'number' }] };
    if (!fields[page.kind]) return; const v = await ask(msg`Adicionar a ${key}`, fields[page.kind]); if (!v) return;
    const op: Record<string, RedisEdit> = { hash: { op: 'hset', key, field: v.field, value: v.value }, list: { op: 'rpush', key, value: v.value }, set: { op: 'sadd', key, member: v.member }, zset: { op: 'zadd', key, member: v.member, score: Number(v.score) } };
    await redis(op[page.kind], tr('Item adicionado.'));
  }
  async function removeItem() {
    if (!selection || !page?.kind) return; const key = selection.table; const r = row(); if (!r) return;
    const name = r[0] ?? ''; if (page.kind !== 'list' && clipped(name)) { el('data-message').textContent = tr('Item longo demais para remover pela prévia; use o console.'); return; }
    let old: string | undefined; if (page.kind === 'list') { old = await full({ op: 'get', kind: 'list', key, index: Number(name) }); if (old === undefined) return; }
    if (!(await ask(msg`Remover item de ${key}?`, [], page.kind === 'list' ? msg`Índice ${name}: ${old!.slice(0, 200)}` : name.slice(0, 200)))) return;
    const op: Record<string, RedisEdit> = { hash: { op: 'hdel', key, field: name }, list: { op: 'ldel', key, index: Number(name), old }, set: { op: 'srem', key, member: name }, zset: { op: 'zrem', key, member: name } };
    if (op[page.kind]) { selection.row = undefined; await redis(op[page.kind], tr('Item removido.')); }
  }
  async function ttl() {
    if (!selection || !page?.kind) return; const key = selection.table;
    const v = await ask(msg`TTL de ${key}`, [{ name: 'ttl', label: tr('Segundos'), value: page.ttl && page.ttl > 0 ? String(page.ttl) : '', type: 'number' }], tr('Vazio ou 0 remove a expiração (PERSIST).'));
    if (!v) return; const seconds = Math.floor(Number(v.ttl || 0)); if (!Number.isFinite(seconds) || seconds < 0) { el('data-message').textContent = tr('TTL inválido.'); return; }
    await redis({ op: 'ttl', key, ttl: seconds }, seconds ? msg`Expira em ${seconds}s.` : tr('Expiração removida.'));
  }
  function treeKey(key: string) { return [...el('db-sources').querySelectorAll<HTMLButtonElement>('.db-table')].find(b => b.textContent === key && selection && b.closest('details')?.querySelector('summary')?.textContent === selection.schema); }
  async function rename() {
    if (!selection || !page?.kind) return; const key = selection.table;
    const v = await ask(msg`Renomear ${key}`, [{ name: 'to', label: tr('Novo nome'), value: key }], tr('Não sobrescreve uma chave existente (RENAMENX).'));
    if (!v || !v.to || v.to === key) return; const button = treeKey(key);
    if (await redis({ op: 'rename', key, to: v.to }, msg`Chave renomeada para ${v.to}.`, v.to) && button) { button.textContent = v.to; button.setAttribute('aria-label', v.to); const s = selection!; button.onclick = () => { selection = { session: s.session, schema: s.schema, table: v.to, offset: 0, tokens: new Map() }; mode = 'rows'; void load(); }; }
  }
  async function deleteKey() {
    if (!selection || !page?.kind) return; const current = selection; const key = current.table;
    if (!(await ask(msg`Excluir a chave ${key}?`, [], msg`${page.kind} · ${page.size ?? 0} item(ns). Esta ação não pode ser desfeita.`))) return;
    try { await api.databaseRedisEdit(current.session.id, current.schema, { op: 'delete', key }); treeKey(key)?.remove(); request++; selection = undefined; panel.hidden = true; message(msg`Chave ${key} excluída.`); }
    catch (error) { el('data-message').textContent = String(error); }
  }
  el('redis-add').onclick = () => void addItem(); el('redis-edit').onclick = () => void editItem(); el('redis-remove').onclick = () => void removeItem();
  el('redis-ttl').onclick = () => void ttl(); el('redis-rename').onclick = () => void rename(); el('redis-delete').onclick = () => void deleteKey();
  el('data-grid').addEventListener('keydown', event => {
    if (!page?.kind || mode !== 'rows' || editDialog.open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); pick((selection?.row ?? -1) + (event.key === 'ArrowDown' ? 1 : -1)); el('data-grid').querySelector('tr[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'Enter') { event.preventDefault(); void editItem(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); void removeItem(); }
  });
  async function load() {
    if (!selection) return; const current = selection; const token = ++request;
    page = undefined; el('data-grid').replaceChildren(); el('data-range').textContent = ''; el('redis-actions').hidden = true;
    panel.hidden = false; el('data-title').textContent = `${current.schema}.${current.table}`;
    el('data-message').textContent = tr('Carregando dados…');
    for (const id of ['data-prev', 'data-next', 'data-refresh']) el<HTMLButtonElement>(id).disabled = true;
    try {
      const result = await api.databasePage(current.session.id, current.schema, current.table, current.offset, current.tokens.get(current.offset) ?? null);
      if (result.cursor !== undefined) current.tokens.set(current.offset + 50, result.cursor);
      if (current.row !== undefined && current.row >= result.rows.length) current.row = result.rows.length ? result.rows.length - 1 : undefined;
      if (token !== request) return; page = result; render();
    } catch (error) { if (token === request) { page = undefined; el('data-grid').replaceChildren(); el('data-message').textContent = String(error); } }
    finally { if (token === request) el<HTMLButtonElement>('data-refresh').disabled = false; }
  }

  // Árvore
  function toolbar() {
    const source = sources.find(s => s.id === selected); const session = selected ? sessions.get(selected) : undefined;
    el<HTMLButtonElement>('db-properties').disabled = !source; el<HTMLButtonElement>('db-refresh').disabled = !session;
    el<HTMLButtonElement>('db-disconnect').disabled = !session; el<HTMLButtonElement>('db-console-open').disabled = !source;
    (document.querySelector('.db-empty') as HTMLElement).hidden = sources.length > 0;
  }
  function select(id: string) { selected = id; el('db-sources').querySelectorAll('.db-source-title').forEach(t => t.setAttribute('aria-selected', String((t.parentElement as HTMLElement).dataset.id === id))); toolbar(); }
  function schemaNodes(session: DatabaseSession, container: HTMLElement) {
    container.replaceChildren();
    if (!session.schemas.length) { const p = document.createElement('p'); p.textContent = tr('Nenhum schema visível. Ajuste a aba Schemas.'); container.append(p); }
    for (const schema of session.schemas) {
      const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = schema;
      const objects = document.createElement('div'); details.append(summary, objects); container.append(details);
      let loaded = false;
      details.ontoggle = async () => {
        if (!details.open || loaded) return; const version = epoch; objects.textContent = session.driver === 'redis' ? tr('Lendo chaves (SCAN)…') : tr('Carregando tabelas…');
        try {
          const tables = await api.databaseTables(session.id, schema); if (version !== epoch || !container.isConnected) return;
          objects.replaceChildren(); loaded = true;
          if (!tables.length) objects.textContent = session.driver === 'redis' ? tr('Nenhuma chave.') : tr('Nenhuma tabela ou view.');
          for (const table of tables) { const button = document.createElement('button'); button.type = 'button'; button.className = 'db-table'; button.dataset.kind = table.kind.toLowerCase(); button.textContent = table.name; button.setAttribute('aria-label', table.name); button.title = table.kind; button.onclick = () => { selection = { session, schema, table: table.name, offset: 0, tokens: new Map() }; mode = 'rows'; void load(); }; objects.append(button); }
          if (tables.length === 2000) { const note = document.createElement('p'); note.textContent = session.driver === 'redis' ? tr('Limite: 2.000 chaves por SCAN.') : tr('Limite: 2.000 objetos por schema.'); objects.append(note); }
        } catch (error) { objects.textContent = String(error); }
      };
    }
  }
  function renderTree() {
    const list = el('db-sources'); const open = new Set([...list.querySelectorAll<HTMLElement>('.db-source.expanded')].map(n => n.dataset.id));
    list.replaceChildren();
    for (const source of sources) {
      const node = document.createElement('section'); node.className = 'db-source'; node.dataset.id = source.id; node.setAttribute('role', 'treeitem');
      const session = sessions.get(source.id);
      const heading = document.createElement('div'); heading.className = 'db-source-title'; heading.tabIndex = 0; heading.setAttribute('aria-selected', String(selected === source.id));
      const twisty = document.createElement('span'); twisty.className = 'twisty'; twisty.textContent = '▸';
      const label = document.createElement('strong'); label.textContent = source.name || defaultName(source);
      const detail = document.createElement('small'); detail.textContent = session?.readOnly ? tr('somente leitura') : driverInfo(source.driver).file ? '' : source.host;
      const state = document.createElement('span'); state.className = 'db-state'; state.dataset.connected = String(!!session); state.title = session ? tr('Conectado') + (session.version ? ' · ' + session.version : '') : tr('Desconectado');
      const console = document.createElement('button'); console.type = 'button'; console.className = 'db-console'; console.textContent = tr('Console'); console.title = tr('Abrir console de ') + label.textContent;
      console.onclick = event => { event.stopPropagation(); void openConsole(source); };
      heading.append(twisty, badge(source.driver), label, detail, state, console);
      const children = document.createElement('div'); children.className = 'db-children';
      node.append(heading, children); list.append(node);
      if (session && open.has(source.id)) { node.classList.add('expanded'); schemaNodes(session, children); }
      heading.onclick = event => { select(source.id); if ((event.target as HTMLElement).classList.contains('twisty') || event.detail === 2) void toggle(source.id); };
      heading.onkeydown = event => { if (event.key === 'Enter' || event.key === 'ArrowRight' && !node.classList.contains('expanded') || event.key === 'ArrowLeft' && node.classList.contains('expanded')) { event.preventDefault(); select(source.id); void toggle(source.id); } };
      if (session && !session.schemas.length) heading.title = tr('Nenhum schema visível');
    }
    toolbar();
  }
  async function toggle(id: string) {
    const node = el('db-sources').querySelector<HTMLElement>(`.db-source[data-id="${CSS.escape(id)}"]`); if (!node) return;
    if (node.classList.contains('expanded')) { node.classList.remove('expanded'); return; }
    const session = await connectSource(id); if (!session) return;
    const current = el('db-sources').querySelector<HTMLElement>(`.db-source[data-id="${CSS.escape(id)}"]`)!;
    current.classList.add('expanded'); schemaNodes(session, current.querySelector('.db-children')!);
  }
  function askPassword(source: DataSource): Promise<{ password: string; save: DataSource['savePassword'] } | undefined> {
    const input = passwordDialog.querySelector<HTMLInputElement>('[name="password"]')!; const save = passwordDialog.querySelector<HTMLSelectElement>('[name="savePassword"]')!;
    el('db-password-title').textContent = msg`Conectar a ${source.name}`; input.value = ''; save.value = source.savePassword;
    passwordDialog.showModal(); input.focus();
    return new Promise(resolve => {
      el('db-password-cancel').onclick = () => passwordDialog.close('cancel');
      passwordDialog.addEventListener('close', () => { const ok = passwordDialog.returnValue === 'ok'; const result = ok ? { password: input.value, save: save.value as DataSource['savePassword'] } : undefined; input.value = ''; passwordDialog.returnValue = ''; resolve(result); }, { once: true });
    });
  }
  async function connectSource(id: string, typed?: string): Promise<DatabaseSession | undefined> {
    const existing = sessions.get(id); if (existing) return existing;
    const source = sources.find(s => s.id === id); if (!source) return;
    const problem = validateSource(source); if (problem) { message(tr(problem)); return; }
    let password = typed ?? ''; let save = source.savePassword;
    if (typed === undefined && source.auth === 'password' && !driverInfo(source.driver).file && !(await api.databasePasswordStored(id))) {
      const answer = await askPassword(source); if (!answer) return; password = answer.password; save = answer.save;
    }
    const version = epoch; message(msg`Conectando a ${source.name}…`);
    try {
      const session = await api.databaseConnect({ ...toInput(source, password), savePassword: save });
      if (version !== epoch) { await api.databaseDisconnect(session.id); return; }
      sessions.set(id, session); renderTree(); select(id);
      message(session.driver === 'redis' ? tr('Conectado. Expanda um banco para listar chaves.') : tr('Conectado. Expanda um schema para explorar tabelas e views.'));
      return session;
    } catch (error) { if (version === epoch) message(String(error)); }
  }
  async function disconnect(id: string) {
    const session = sessions.get(id); if (!session) return;
    sessions.delete(id); await api.databaseDisconnect(session.id); hooks.disconnected(session.id);
    if (selection?.session.id === session.id) { request++; selection = undefined; panel.hidden = true; }
    renderTree(); message(tr('Conexão encerrada.'));
  }
  async function openConsole(source: DataSource) { select(source.id); const session = await connectSource(source.id); if (session) hooks.openConsole(session); }

  // Diálogo: rascunhos editados até OK/Aplicar
  let drafts: DataSource[] = []; let current: DataSource | undefined; const typed = new Map<string, string>(); const named = new Set<string>(); const known = new Map<string, string[]>();
  const tabs = form.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  function showTab(name: string) { tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name))); form.querySelectorAll<HTMLElement>('.ds-panel').forEach(p => { p.hidden = p.dataset.panel !== name; }); }
  tabs.forEach(t => { t.onclick = () => showTab(t.dataset.tab!); });
  function status(text: string, kind: 'ok' | 'error' | '' = '') { const s = el('db-connection-result'); s.textContent = text; s.dataset.kind = kind; }
  function list() {
    const ul = el('ds-list'); ul.replaceChildren();
    for (const source of drafts) {
      const li = document.createElement('li'); li.setAttribute('role', 'option'); li.tabIndex = 0; li.dataset.id = source.id; li.setAttribute('aria-selected', String(source.id === current?.id));
      const name = document.createElement('span'); name.textContent = source.name || defaultName(source); li.append(badge(source.driver), name);
      li.onclick = () => edit(source.id); li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit(source.id); } }; ul.append(li);
    }
    el<HTMLButtonElement>('db-test').disabled= !current;
    el<HTMLButtonElement>('ds-remove').disabled = el<HTMLButtonElement>('ds-duplicate').disabled = !current;
    el('ds-none').hidden = !!current; el('ds-editor').hidden = !current;
  }
  function schemaList() {
    const box = el('ds-schemas'); box.replaceChildren(); if (!current) return;
    const names = [...new Set([...(known.get(current.id) ?? []), ...current.schemas])];
    field('allSchemas').checked = !current.schemas.length;
    if (!names.length) { const p = document.createElement('p'); p.className = 'ds-hint'; p.textContent = tr('Teste a conexão ou use Carregar schemas para listar.'); box.append(p); }
    for (const name of names) {
      const label = document.createElement('label'); label.className = 'check'; const box2 = document.createElement('input'); box2.type = 'checkbox'; box2.value = name;
      box2.checked = !current.schemas.length || current.schemas.includes(name); box2.disabled = !current.schemas.length;
      box2.onchange = () => { if (!current) return; current.schemas = [...box.querySelectorAll<HTMLInputElement>('input:checked')].map(i => i.value); };
      label.append(box2, ' ' + name); box.append(label);
    }
  }
  function fill() {
    if (!current) { list(); return; }
    const s = current; const info = driverInfo(s.driver);
    el('ds-driver-symbol').replaceChildren(badge(s.driver));el('ds-driver-title').textContent=info.name;el('ds-import-note').textContent=imported.get(s.id)??'';el('ds-import-note').hidden=!imported.has(s.id);
    field('name').value = s.name; field('comment').value = s.comment; field<HTMLSelectElement>('driver').value = s.driver;
    field('host').value = s.host; field('port').value = String(s.port); field('file').value = s.file; field<HTMLSelectElement>('auth').value = s.auth;
    field('user').value = s.user; field('password').value = typed.get(s.id) ?? ''; field<HTMLSelectElement>('savePassword').value = s.savePassword; field('database').value = s.database;
    field('readOnly').checked = s.readOnly; field<HTMLTextAreaElement>('startup').value = s.startup;
    field('sshEnabled').checked = s.ssh.enabled; field('sshHost').value = s.ssh.host; field('sshPort').value = String(s.ssh.port); field('sshUser').value = s.ssh.user; field('sshKey').value = s.ssh.key;
    field<HTMLSelectElement>('sslMode').value = s.ssl.mode; field('sslCa').value = s.ssl.ca; field<HTMLSelectElement>('connectType').value = s.connectType ?? 'service';
    void api.databasePasswordStored(s.id).then(stored => { if (current === s) field('password').placeholder = stored ? tr('Guardada até reiniciar') : info.file ? '' : tr('Vazia'); }).catch(() => {});
    visibility(); schemaList(); list();
  }
  function visibility() {
    if (!current) return; const info = driverInfo(current.driver); const auth = current.auth === 'password';
    const show = (selector: string, visible: boolean) => form.querySelectorAll<HTMLElement>(selector).forEach(n => { n.hidden = !visible; });
    show('.host-row', !info.file); show('.file-row', info.file); show('.connect-row', current.driver === 'oracle'); show('.auth-row', !info.file); show('.user-row', !info.file && auth); show('.password-row', !info.file && auth); show('.database-row', !info.file);
    el('ds-database-label').textContent = current.driver === 'redis' ? tr('Índice do banco:') : current.driver === 'oracle' ? (current.connectType === 'sid' ? tr('SID:') : tr('Service name:')) : tr('Banco de dados:');
    field('readOnly').disabled = !info.readOnly; el('ds-readonly-hint').textContent = info.readOnly ? tr('Bloqueia escrita na sessão (transação somente leitura).') : msg`${info.name}: somente leitura ainda não é garantido.`;
    field<HTMLTextAreaElement>('startup').disabled = !info.startup;
    form.querySelector<HTMLFieldSetElement>('.ssh-fields')!.disabled = !info.ssh; form.querySelector<HTMLFieldSetElement>('.ssl-fields')!.disabled = !info.ssl;
    form.querySelectorAll<HTMLInputElement>('.ssh-fields .grid-row input, .ssh-fields > label input').forEach(i => { i.disabled = !current!.ssh.enabled; });
    show('.ca-row', info.caFile);
    el('ds-hint').textContent = info.file ? tr('Arquivo local; abre somente arquivos existentes.') : current.driver === 'redis' ? tr('Usuário (ACL) é opcional; use Sem autenticação para Redis sem senha. Em TLS, Verificar CA também confere o nome do host.') : current.driver === 'oracle' ? tr('Driver Rust nativo (protocolo thin): não requer Oracle Instant Client. Blocos PL/SQL no console terminam com / em linha própria.') : '';
    if (document.activeElement !== field('url')) field('url').value = buildUrl(current);
  }
  function read() {
    if (!current) return; const s = current; const before = s.driver;
    s.driver = field<HTMLSelectElement>('driver').value as DatabaseDriver;
    if (s.driver !== before) { const from = driverInfo(before); const to = driverInfo(s.driver); if (!s.port || s.port === from.port) s.port = to.port; if (!s.user || s.user === from.user) s.user = to.user; if (s.database === from.database) s.database = to.database; if (to.file || s.driver === 'redis') s.auth = 'none'; else if (from.file || before === 'redis') s.auth = 'password'; if (!to.ssl) s.ssl.mode = 'disable'; }
    s.comment = field('comment').value; s.host = field('host').value; s.port = Number(field('port').value); s.file = field('file').value;
    s.auth = s.driver === before ? field<HTMLSelectElement>('auth').value as DataSource['auth'] : s.auth; s.user = field('user').value; s.database = field('database').value;
    if (s.driver === 'oracle' && before === 'oracle') s.connectType = field<HTMLSelectElement>('connectType').value as 'service' | 'sid'; else if (s.driver === 'oracle') s.connectType ??= 'service'; else delete s.connectType;
    s.savePassword = field<HTMLSelectElement>('savePassword').value as DataSource['savePassword']; s.readOnly = field('readOnly').checked; s.startup = field<HTMLTextAreaElement>('startup').value;
    s.ssh = { enabled: field('sshEnabled').checked, host: field('sshHost').value, port: Number(field('sshPort').value) || 22, user: field('sshUser').value, key: field('sshKey').value };
    s.ssl = { mode: field<HTMLSelectElement>('sslMode').value as DataSource['ssl']['mode'], ca: field('sslCa').value };
    if (field('password').value) typed.set(s.id, field('password').value); else typed.delete(s.id);
    if (named.has(s.id)) s.name = field('name').value; else { s.name = defaultName(s); field('name').value = s.name; }
    if (s.driver !== before) fill(); else { visibility(); const item = el('ds-list').querySelector(`[data-id="${CSS.escape(s.id)}"] span:last-child`); if (item) item.textContent = s.name || defaultName(s); }
  }
  form.addEventListener('input', event => { const target = event.target as HTMLElement & { name?: string }; if (target.name === 'url' || target.name === 'allSchemas' || target.closest('#ds-schemas')) return; if (target.name === 'name') named.add(current!.id); read(); status(''); });
  form.addEventListener('change', event => { const target = event.target as HTMLElement & { name?: string }; if (['driver', 'auth', 'sshEnabled', 'sslMode', 'readOnly', 'savePassword', 'connectType'].includes(target.name ?? '')) read(); });
  field('url').addEventListener('change', () => {
    if (!current) return; const parsed = parseUrl(field('url').value);
    if (!parsed) { status(tr('URL não reconhecida. Formatos: postgresql://, mysql://, mariadb://, sqlserver://, oracle:thin:@//, sqlite:, redis://'), 'error'); return; }
    const driver = parsed.driver ?? current.driver; if (driver !== current.driver) { field<HTMLSelectElement>('driver').value = driver; read(); }
    Object.assign(current, parsed, parsed.ssl ? { ssl: { ...current.ssl, ...parsed.ssl } } : {}); if (!named.has(current.id)) current.name = defaultName(current); fill(); status('');
  });
  field('allSchemas').onchange = () => { if (!current) return; current.schemas = field('allSchemas').checked ? [] : [...(known.get(current.id) ?? [])]; schemaList(); };
  el('ds-reset-name').onclick = () => { if (!current) return; named.delete(current.id); current.name = defaultName(current); fill(); };
  form.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(button => { button.onclick = async () => { const kind = button.dataset.pick as 'sqlite' | 'cert' | 'key'; const path = await api.databasePickFile(kind).catch(error => { status(String(error), 'error'); return null; }); if (!path) return; field(kind === 'sqlite' ? 'file' : kind === 'key' ? 'sshKey' : 'sslCa').value = path; read(); }; });
  function edit(id: string) { current = drafts.find(s => s.id === id); status(''); fill(); field('name').focus(); }
  function add(driver: DatabaseDriver) {
    const source = newSource(driver, uid()); drafts.push(source); el('ds-driver-menu').hidden = true; edit(source.id); showTab('general');
    if (driverInfo(driver).file) field('file').focus(); else field('host').focus();
  }
  el('ds-new').onclick = () => { const menu = el('ds-driver-menu'); menu.hidden = !menu.hidden; if (!menu.hidden) menu.querySelector<HTMLButtonElement>('button')!.focus(); };
  menuList.querySelectorAll<HTMLButtonElement>('[data-driver]').forEach(button => { button.onclick = () => add(button.dataset.driver as DatabaseDriver); });
  el('ds-driver-menu').addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); el('ds-driver-menu').hidden = true; el('ds-new').focus(); } });
  el('ds-remove').onclick = () => { if (!current) return; const index = drafts.indexOf(current); drafts.splice(index, 1); current = drafts[Math.min(index, drafts.length - 1)]; fill(); };
  el('ds-duplicate').onclick = () => { if (!current) return; const copy: DataSource = structuredClone(current); copy.id = uid(); copy.name = `${current.name || defaultName(current)} ${tr('(cópia)')}`; named.add(copy.id); drafts.push(copy); edit(copy.id); };
  async function test() {
    if (!current) return; read(); const source = current; const problem = validateSource(source); if (problem) { status(tr(problem), 'error'); return; }
    const version = epoch; status(tr('Conectando…')); el<HTMLButtonElement>('db-test').disabled = true;
    try {
      const info = await api.database(toInput(source, typed.get(source.id) ?? ''));
      if (version !== epoch) return; known.set(source.id, info.schemas); if (current === source) schemaList();
      status(msg`✓ Conectado · ${info.version.split('\n')[0].slice(0, 120)}`, 'ok'); message(tr('Conexão testada com sucesso.'));
    } catch (error) { if (version === epoch) status(String(error), 'error'); }
    finally { el<HTMLButtonElement>('db-test').disabled = false; }
  }
  el('db-test').onclick = () => void test();
  el('ds-load-schemas').onclick = () => void test();
  async function apply(): Promise<boolean> {
    if (current) read();
    const removed = sources.filter(s => !drafts.some(d => d.id === s.id));
    const changed = drafts.filter(d => { const old = sources.find(s => s.id === d.id); return old && JSON.stringify(old) !== JSON.stringify(d); });
    try { sources = (await api.databaseSaveSources(drafts.map(d => ({ ...d, name: d.name.trim() || defaultName(d) })))).map(normalizeSource); }
    catch (error) { status(String(error), 'error'); return false; }
    for (const s of removed) { await disconnect(s.id); await api.databaseForgetPassword(s.id).catch(() => {}); }
    for (const s of changed) if (sessions.has(s.id)) { await disconnect(s.id); message(msg`${s.name}: reconecte para aplicar as alterações.`); }
    drafts = structuredClone(sources); current = current && drafts.find(s => s.id === current!.id); renderTree(); fill(); return true;
  }
  el('db-apply').onclick = () => void apply();
  form.onsubmit = async event => {
    event.preventDefault(); const id = current?.id; const password = id ? typed.get(id) : undefined;
    if (id) { const problem = validateSource(current!); if (problem) { status(tr(problem), 'error'); return; } }
    el<HTMLButtonElement>('db-connect').disabled = true;
    try { if (!(await apply())) return; dialog.close(); if (id) { select(id); const session = await connectSource(id, password); if (session) await toggleOpen(id); } }
    finally { el<HTMLButtonElement>('db-connect').disabled = false; }
  };
  async function toggleOpen(id: string) { const node = el('db-sources').querySelector<HTMLElement>(`.db-source[data-id="${CSS.escape(id)}"]`); if (node && !node.classList.contains('expanded')) await toggle(id); }
  const closeDialog = () => dialog.close();
  el('db-dialog-close').onclick = closeDialog; el('db-cancel').onclick = closeDialog;
  dialog.addEventListener('close', () => { importRequest++;imported.clear();el('ds-import-picker').hidden=true;el('ds-import-status').textContent='';typed.clear(); field('password').value = ''; el('ds-driver-menu').hidden = true; });
  function showDialog(options: { id?: string; add?: boolean } = {}) {
    drafts = structuredClone(sources); named.clear(); for (const s of drafts) if (s.name && s.name !== defaultName(s)) named.add(s.id);
    current = drafts.find(s => s.id === (options.id ?? selected)) ?? drafts[0]; status(''); showTab('general'); fill(); dialog.showModal();
    if (options.add || !drafts.length) { el('ds-driver-menu').hidden = false; el('ds-driver-menu').querySelector<HTMLButtonElement>('button')!.focus(); } else field('name').focus();
  }

  el('db-empty-import').onclick=()=>{showDialog();void chooseEnv();};
  el('db-add').onclick = () => showDialog({ add: true });
  el('db-empty-add').onclick = () => showDialog({ add: true });
  el('db-properties').onclick = () => { if (selected) showDialog({ id: selected }); };
  el('db-disconnect').onclick = () => { if (selected) void disconnect(selected); };
  el('db-refresh').onclick = async () => { if (!selected || !sessions.has(selected)) return; const id = selected; await disconnect(id); if (await connectSource(id)) await toggleOpen(id); };
  el('db-console-open').onclick = () => { const source = sources.find(s => s.id === selected); if (source) void openConsole(source); };
  el('data-rows').onclick = () => { mode = 'rows'; render(); }; el('data-columns').onclick = () => { mode = 'columns'; render(); };
  el('data-close').onclick = () => { request++; panel.hidden = true; };
  el('data-prev').onclick = () => { if (selection && page) { selection.offset = Math.max(0, page.offset - 50); selection.row = undefined; void load(); } };
  el('data-next').onclick = () => { if (selection && page?.hasMore) { selection.offset = page.offset + 50; selection.row = undefined; void load(); } };
  el('data-refresh').onclick = () => { void load(); };
  async function reload() { const version = epoch; try { const list = (await api.databaseSources()).map(normalizeSource); if (version === epoch) { sources = list; renderTree(); } } catch (error) { if (version === epoch) message(String(error)); } }
  void reload();
  return { reset() { epoch++; request++; selection = undefined; page = undefined; panel.hidden = true; if (editDialog.open) editDialog.close('cancel'); sessions.clear(); sources = []; selected = undefined; el('db-sources').replaceChildren(); typed.clear(); field('password').value = ''; message(''); dialog.close(); passwordDialog.close('cancel'); toolbar(); void reload(); } };
}
