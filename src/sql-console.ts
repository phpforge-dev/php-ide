import { t as tr, msg, html } from './i18n';
import * as monaco from 'monaco-editor';
import type { DatabaseSession, IdeApi, SqlResult } from '../shared/contracts';
import { driverInfo } from '../shared/datasource';
import { sqlComplete, statementAt, type SqlItem, type SqlModel } from '../shared/sql';

type Hooks = {
 virtual(path: string, text: string, language: string, kind: 'console', uri: monaco.Uri): monaco.editor.ITextModel;
 open(path: string): Promise<void>;
 status(message: string): void;
};
const kinds: Record<SqlItem['kind'], monaco.languages.CompletionItemKind> = {
 column: monaco.languages.CompletionItemKind.Field, table: monaco.languages.CompletionItemKind.Struct, view: monaco.languages.CompletionItemKind.Struct,
 schema: monaco.languages.CompletionItemKind.Module, keyword: monaco.languages.CompletionItemKind.Keyword, columns: monaco.languages.CompletionItemKind.Snippet,
};

/** Console SQL como aba do editor (Executar ⌘/Ctrl+Enter, auto-commit) e resultados no painel inferior. */
export function sqlConsole(api: IdeApi, editor: monaco.editor.IStandaloneCodeEditor, hooks: Hooks) {
 const consoles = new Map<string, DatabaseSession>();
 const models = new Map<string, Promise<SqlModel>>();
 const toolbar = document.createElement('div'); toolbar.id = 'sql-toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', tr('Console SQL')); toolbar.hidden = true;
 toolbar.innerHTML = html('<button id="sql-execute" title="Executar comando sob o cursor ou seleção (⌘/Ctrl+Enter)">▶ Executar</button><span class="sql-tx" title="Cada comando é confirmado automaticamente">Tx: Auto</span><button id="sql-cancel" disabled>Cancelar</button><label>Schema <select id="sql-schema"></select></label><span id="sql-source"></span>');
 const results = document.createElement('section'); results.id = 'sql-results'; results.hidden = true;
 results.innerHTML = html('<div class="data-toolbar"><strong id="sql-results-title">Resultados</strong><span id="sql-tabs" role="tablist"></span><span id="sql-summary" role="status"></span><button id="sql-results-close" aria-label="Fechar resultados">×</button></div><div id="sql-grid" tabindex="0" aria-label="Resultado da consulta"></div>');
 const code = document.querySelector('.code')!;
 code.insertBefore(toolbar, document.getElementById('editor')); code.append(results);
 const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
 const isConsole = editor.createContextKey<boolean>('sqlConsole', false);
 let running: string | undefined;

 const current = () => { const model = editor.getModel(); return model ? consoles.get(model.uri.toString()) : undefined; };
 const modelOf = (session: DatabaseSession) => {
  let model = models.get(session.id);
  if (!model) { model = api.databaseModel(session.id); models.set(session.id, model); model.catch(() => models.delete(session.id)); }
  return model;
 };
 async function refreshToolbar() {
  const session = current(); toolbar.hidden = !session; isConsole.set(!!session);
  if (!session) return;
  $('sql-source').textContent = session.label;
  const select = $<HTMLSelectElement>('sql-schema');
  try {
   const model = await modelOf(session);
   if (current() !== session) return;
   select.replaceChildren(...model.schemas.map(s => new Option(s.name, s.name, false, s.name === model.defaultSchema)));
  } catch (error) { hooks.status(String(error)); }
 }
 editor.onDidChangeModel(() => void refreshToolbar());

 function render(list: SqlResult[], selected = list.length - 1) {
  results.hidden = false;
  const tabs = $('sql-tabs'); tabs.replaceChildren();
  list.forEach((r, i) => {
   const tab = document.createElement('button'); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(i === selected));
   tab.textContent = r.kind === 'error' ? msg`Erro ${i + 1}` : `Resultado ${i + 1}`; tab.title = r.statement; tab.onclick = () => render(list, i); tabs.append(tab);
  });
  const r = list[selected];
  $('sql-summary').textContent = r.kind === 'rows' ? `${r.rows!.length}${r.truncated ? '+' : ''} ${r.rows!.length === 1 ? tr('linha') : tr('linhas')} · ${r.ms} ms` : r.kind === 'update' ? `${r.affected} ${r.affected === 1 ? tr('linha afetada') : tr('linhas afetadas')} · ${r.ms} ms` : `${r.ms} ms`;
  const grid = $('sql-grid'); grid.replaceChildren();
  if (r.kind === 'error') { const p = document.createElement('pre'); p.className = 'sql-error'; p.textContent = r.error!; grid.append(p); return; }
  if (r.kind === 'update') { const p = document.createElement('p'); p.textContent = `${r.statement.split('\n')[0].slice(0, 120)} — ${r.affected} linha(s).`; grid.append(p); return; }
  const table = document.createElement('table'); const head = table.createTHead().insertRow();
  const corner = document.createElement('th'); corner.className = 'sql-row-number'; head.append(corner);
  for (const name of r.columns!) { const th = document.createElement('th'); th.textContent = name; head.append(th); }
  const body = table.createTBody();
  r.rows!.forEach((values, n) => {
   const row = body.insertRow(); const number = row.insertCell(); number.className = 'sql-row-number'; number.textContent = String(n + 1);
   for (const value of values) { const c = row.insertCell(); c.textContent = value === null ? '<null>' : value; if (value === null) c.className = 'null-value'; }
  });
  grid.append(table);
  if (r.truncated) { const note = document.createElement('p'); note.textContent = tr('Exibindo as primeiras 500 linhas.'); grid.append(note); }
 }

 async function execute() {
  const session = current(); const model = editor.getModel(); if (!session || !model || running) return;
  const selection = editor.getSelection();
  const sql = selection && !selection.isEmpty() ? model.getValueInRange(selection) : statementAt(model.getValue(), model.getOffsetAt(editor.getPosition()!), session.driver === 'oracle' ? 'oracle' : undefined)?.text ?? '';
  if (!sql.trim()) { hooks.status(tr('Nada para executar no cursor.')); return; }
  running = session.id; $<HTMLButtonElement>('sql-execute').disabled = true; $<HTMLButtonElement>('sql-cancel').disabled = false;
  $('sql-results-title').textContent = `${session.label} · executando…`; results.hidden = false;
  try {
   const list = await api.databaseExecute(session.id, sql);
   if (list.some(r => r.kind !== 'error' && /^\s*(CREATE|ALTER|DROP|RENAME|TRUNCATE|COMMENT)\b/i.test(r.statement))) { models.delete(session.id); void refreshToolbar(); }
   $('sql-results-title').textContent = session.label; render(list);
   hooks.status(list.at(-1)?.kind === 'error' ? tr('Falha ao executar SQL') : `${list.length} comando(s) executado(s)`);
  } catch (error) { $('sql-results-title').textContent = session.label; render([{ statement: sql, ms: 0, kind: 'error', error: String(error) }]); }
  finally { running = undefined; $<HTMLButtonElement>('sql-execute').disabled = false; $<HTMLButtonElement>('sql-cancel').disabled = true; }
 }
 $('sql-execute').onclick = () => void execute();
 $('sql-cancel').onclick = () => { const session = current(); if (session) void api.databaseCancel(session.id).then(() => hooks.status(tr('Cancelamento solicitado.'))); };
 $('sql-results-close').onclick = () => { results.hidden = true; };
 editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void execute(), 'sqlConsole');

 monaco.languages.registerCompletionItemProvider(['pgsql', 'mysql', 'sql'], {
  triggerCharacters: ['.', ' '],
  async provideCompletionItems(model, position) {
   const session = consoles.get(model.uri.toString()); if (!session) return { suggestions: [] };
   const schema = await modelOf(session);
   const chosen = $<HTMLSelectElement>('sql-schema').value || schema.defaultSchema;
   const result = sqlComplete({ ...schema, defaultSchema: chosen }, model.getValue(), model.getOffsetAt(position));
   const start = model.getPositionAt(result.from);
   const range = new monaco.Range(start.lineNumber, start.column, position.lineNumber, position.column);
   return { suggestions: result.items.map((i, n) => ({ label: { label: i.label, detail: i.detail, description: i.description }, kind: kinds[i.kind], insertText: i.label, range, sortText: String(n).padStart(5, '0'), filterText: i.label })) };
  },
 });

 return {
  async open(session: DatabaseSession) {
   const path = `consoles/${session.label}/console`;
   const uri = monaco.Uri.from({ scheme: 'php-ide-console', path: `/${session.id}/console.sql` });
   const model = hooks.virtual(path, '', driverInfo(session.driver).language, 'console', uri);
   consoles.set(model.uri.toString(), session);
   await hooks.open(path); editor.focus(); void refreshToolbar();
  },
  forget(sessionId: string) { models.delete(sessionId); for (const [uri, s] of consoles) if (s.id === sessionId) consoles.delete(uri); void refreshToolbar(); },
  reset() { consoles.clear(); models.clear(); results.hidden = true; toolbar.hidden = true; },
 };
}
