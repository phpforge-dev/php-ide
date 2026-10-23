// Refatorações no editor (recorte 19): Rename Symbol com prévia exata, transação em vários arquivos
// e desfazer; quick fixes (Alt+Enter) com autoimport e supressão; inspeções como marcadores;
// Extract Method/Variable e Inline Variable. Atalhos seguem a documentação pública do PhpStorm;
// diálogos, textos e comportamento são próprios. Classes usam o motor próprio (refactor-php.ts);
// membros e variáveis usam o servidor de linguagem (prepareRename/rename/codeAction).
import * as monaco from 'monaco-editor';
import { t as tr, msg } from './i18n';
import type { IdeApi } from '../shared/contracts';
import { keymap } from './keymap';
import { offsetOf, position } from '../shared/language/php-source';
import { applyEdits, change, classAt, classIndex, extractMethod, extractVariable, importFixes, inlineVariable, inspect, inspectionId, isClassName, isIdentifier, moveClass, suppressEdit, suppressed, model as phpModel, type ClassIndex, type Edit, type FileChange, type FileText, type Plan, type Problem } from './refactor-php';
import './refactor.css';

export type RefactorHooks = {
 status(text: string): void;
 /** Caminho no projeto do modelo (undefined para buffers virtuais e diffs). */
 pathOf(model: monaco.editor.ITextModel): string | undefined;
 /** Buffer aberto do arquivo, com estado de alterações não salvas. */
 buffer(path: string): { model: monaco.editor.ITextModel; dirty: boolean } | undefined;
 /** Buffer limpo cujo arquivo foi regravado pela refatoração: atualiza texto salvo e etag. */
 saved(path: string, text: string, etag: string): void;
 /** Renomeia/move um arquivo pela árvore do projeto (abas e histórico acompanham). */
 relocateFile(path: string, target: { name?: string; directory?: string }): Promise<string>;
};
export type Transaction = { label: string; files: { path: string; before: string; after: string; disk: boolean; model?: monaco.editor.ITextModel; version?: number }[]; moved?: { from: string; to: string }; time: number };
type Lsp = { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string };
type Api = IdeApi & { languageApply(input: { label: string; changes: { path: string; etag: string; text: string }[] }): Promise<{ etags: Record<string, string> }> };
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const keyLabel = (value: string) => mac ? value.replace(/Ctrl\+Alt\+/g, '⌥⌘').replace(/Ctrl\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : value;
const php = (model: monaco.editor.ITextModel) => model.getLanguageId() === 'php';

/** Diferença mínima (prefixo/sufixo comuns) para aplicar `to` sobre `from` como uma edição. */
function minimal(from: string, to: string): Edit {
 let a = 0; while (a < from.length && a < to.length && from[a] === to[a]) a++;
 let b = 0; while (b < from.length - a && b < to.length - a && from[from.length - 1 - b] === to[to.length - 1 - b]) b++;
 return { start: a, end: from.length - b, text: to.slice(a, to.length - b) };
}
function editModel(model: monaco.editor.ITextModel, edits: Edit[]) {
 model.pushStackElement();
 model.pushEditOperations([], edits.map(e => { const s = model.getPositionAt(e.start); const t = model.getPositionAt(e.end); return { range: new monaco.Range(s.lineNumber, s.column, t.lineNumber, t.column), text: e.text, forceMoveMarkers: true }; }), () => null);
 model.pushStackElement();
}

/** Diálogo modal com campos e botões; Enter confirma, Esc cancela sem efeito. */
type Field = { name: string; label: string; value?: string; type?: 'text' | 'checkbox'; checked?: boolean; select?: [number, number]; hint?: string };
function ask(title: string, fields: Field[], options: { note?: string; ok?: string; preview?: boolean; live?: (values: Record<string, string | boolean>) => { error?: string; info?: string } } = {}): Promise<{ action: 'ok' | 'preview'; values: Record<string, string | boolean> } | undefined> {
 return new Promise(resolve => {
  const d = document.createElement('dialog'); d.className = 'project-dialog refactor-dialog';
  const form = document.createElement('form'); form.method = 'dialog';
  const h = document.createElement('h2'); h.textContent = title; form.append(h);
  const inputs: HTMLInputElement[] = [];
  for (const f of fields) {
   const l = document.createElement('label'); const input = document.createElement('input'); input.name = f.name; input.spellcheck = false;
   if (f.type === 'checkbox') { input.type = 'checkbox'; input.checked = !!f.checked; l.className = 'refactor-check'; l.append(input, document.createTextNode(f.label)); }
   else { input.value = f.value ?? ''; input.required = true; l.append(document.createTextNode(f.label), input); }
   if (f.hint) { const s = document.createElement('small'); s.textContent = f.hint; l.append(s); }
   inputs.push(input); form.append(l);
  }
  const info = document.createElement('p'); info.className = 'project-dialog-note refactor-live'; form.append(info);
  if (options.note) { const p = document.createElement('p'); p.className = 'project-dialog-note'; p.textContent = options.note; form.append(p); }
  const error = document.createElement('p'); error.className = 'project-dialog-error'; error.setAttribute('role', 'alert'); form.append(error);
  const footer = document.createElement('footer'); const buttons: HTMLButtonElement[] = [];
  const button = (value: string, label: string, primary = false) => { const b = document.createElement('button'); b.value = value; b.textContent = label; if (primary) b.className = 'primary'; if (value === 'cancel') b.formNoValidate = true; footer.append(b); buttons.push(b); return b; };
  button('cancel', tr('Cancelar')); if (options.preview) button('preview', tr('Visualizar')); const ok = button('ok', options.ok ?? tr('Refatorar'), true);
  form.append(footer); d.append(form); document.body.append(d);
  const values = () => Object.fromEntries(inputs.map(i => [i.name, i.type === 'checkbox' ? i.checked : i.value.trim()]));
  const update = () => { const r = options.live?.(values()); error.textContent = r?.error ?? ''; info.textContent = r?.info ?? ''; buttons.filter(b => b.value !== 'cancel').forEach(b => b.disabled = !!r?.error); };
  inputs.forEach(i => i.addEventListener('input', update)); update();
  d.showModal(); const first = inputs.find(i => i.type !== 'checkbox'); first?.focus(); const f = fields.find(f => f.name === first?.name); if (first && f?.select) first.setSelectionRange(...f.select);
  d.addEventListener('close', () => { const action = d.returnValue; const result = action === 'ok' || action === 'preview' ? { action, values: values() } as const : undefined; d.remove(); resolve(result); });
 });
}

/** Prévia exata: cada ocorrência pode ser excluída; diff por arquivo; conflitos bloqueiam. */
function preview(plan: Plan, language: (path: string) => string = () => 'php'): Promise<Plan | undefined> {
 return new Promise(resolve => {
  const d = document.createElement('dialog'); d.className = 'local-history refactor-preview';
  d.innerHTML = '<header><strong></strong><span></span><button class="close" type="button">×</button></header><div class="local-history-body"><div class="local-history-list refactor-occurrences" role="tree"></div><div class="local-history-view"><div class="local-history-toolbar"><span></span></div><div class="local-history-diff"></div></div></div><div class="refactor-messages"></div><footer class="refactor-footer"><button type="button" class="cancel"></button><button type="button" class="primary apply"></button></footer>';
  d.querySelector('strong')!.textContent = msg`Prévia: ${plan.title}`;
  d.querySelector<HTMLButtonElement>('.close')!.setAttribute('aria-label', tr('Cancelar refatoração'));
  d.querySelector<HTMLButtonElement>('.cancel')!.textContent = tr('Cancelar'); const apply = d.querySelector<HTMLButtonElement>('.apply')!; apply.textContent = tr('Refatorar');
  const enabled = plan.changes.map(c => c.edits.map(() => true));
  const list = d.querySelector<HTMLElement>('.refactor-occurrences')!; const host = d.querySelector<HTMLElement>('.local-history-diff')!; const info = d.querySelector<HTMLElement>('.local-history-toolbar span')!;
  const messages = d.querySelector<HTMLElement>('.refactor-messages')!;
  for (const c of plan.conflicts) { const p = document.createElement('p'); p.className = 'refactor-conflict'; p.textContent = c; messages.append(p); }
  for (const w of plan.warnings) { const p = document.createElement('p'); p.className = 'refactor-warning'; p.textContent = w; messages.append(p); }
  let diff: monaco.editor.IStandaloneDiffEditor | undefined; let models: monaco.editor.ITextModel[] = []; let shown = -1;
  const current = (i: number) => { const c = plan.changes[i]; const edits = c.edits.filter((_, k) => enabled[i][k]); return change(c.path, c.before, edits); };
  const count = () => { const n = enabled.flat().filter(Boolean).length; d.querySelector('header span')!.textContent = msg`${n} ocorrência(s) em ${plan.changes.filter((_, i) => enabled[i].some(Boolean)).length} arquivo(s)`; apply.disabled = !!plan.conflicts.length || n === 0; };
  const show = (i: number, edit?: number) => {
   shown = i; const c = current(i); models.forEach(m => m.dispose());
   models = [monaco.editor.createModel(c.before, language(c.path)), monaco.editor.createModel(c.after, language(c.path))];
   diff ??= monaco.editor.createDiffEditor(host, { readOnly: true, automaticLayout: true, renderSideBySide: true, minimap: { enabled: false }, originalEditable: false });
   diff.setModel({ original: models[0], modified: models[1] }); info.textContent = c.path;
   if (edit !== undefined) { const line = position(c.before, plan.changes[i].edits[edit].start).line + 1; setTimeout(() => diff?.getOriginalEditor().revealLineInCenter(line), 30); }
   list.querySelectorAll('[aria-selected]').forEach(n => n.setAttribute('aria-selected', String((n as HTMLElement).dataset.file === String(i))));
  };
  plan.changes.forEach((c, i) => {
   const group = document.createElement('div'); group.className = 'refactor-file';
   const head = document.createElement('label'); const all = document.createElement('input'); all.type = 'checkbox'; all.checked = true; head.append(all, document.createTextNode(` ${c.path} (${c.edits.length})`)); head.dataset.file = String(i); head.setAttribute('aria-selected', 'false');
   head.onclick = e => { if (e.target !== all) show(i); };
   group.append(head);
   const boxes: HTMLInputElement[] = [];
   c.edits.forEach((e, k) => {
    const row = document.createElement('label'); row.className = 'refactor-occurrence'; const box = document.createElement('input'); box.type = 'checkbox'; box.checked = true; boxes.push(box);
    const p = position(c.before, e.start); const ls = c.before.lastIndexOf('\n', e.start - 1) + 1; const le = c.before.indexOf('\n', e.end); const line = c.before.slice(ls, le < 0 ? c.before.length : le);
    const code = document.createElement('code'); const left = line.slice(0, e.start - ls).trimStart(); const old = c.before.slice(e.start, Math.min(e.end, le < 0 ? c.before.length : le));
    const del = document.createElement('del'); del.textContent = old; const ins = document.createElement('ins'); ins.textContent = e.text.split('\n').filter(Boolean)[0] ?? ''; code.append(left, del, ins, line.slice(e.end - ls));
    const n = document.createElement('small'); n.textContent = String(p.line + 1); row.append(box, n, code);
    box.onchange = () => { enabled[i][k] = box.checked; all.checked = boxes.every(b => b.checked); all.indeterminate = !all.checked && boxes.some(b => b.checked); count(); show(i, k); };
    row.onclick = ev => { if (ev.target !== box) show(i, k); };
    group.append(row);
   });
   all.onchange = () => { boxes.forEach((b, k) => { b.checked = all.checked; enabled[i][k] = all.checked; }); count(); show(i); };
   list.append(group);
  });
  const close = (result: Plan | undefined) => { diff?.setModel(null); diff?.dispose(); models.forEach(m => m.dispose()); d.close(); d.remove(); resolve(result); };
  d.querySelector<HTMLButtonElement>('.close')!.onclick = () => close(undefined); d.querySelector<HTMLButtonElement>('.cancel')!.onclick = () => close(undefined);
  d.addEventListener('cancel', e => { e.preventDefault(); close(undefined); });
  apply.onclick = () => close({ ...plan, changes: plan.changes.map((_, i) => current(i)).filter(c => c.edits.length) });
  d.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !apply.disabled) { e.preventDefault(); apply.click(); } });
  document.body.append(d); d.showModal(); count(); if (plan.changes.length) show(0); apply.focus();
  void shown;
 });
}

/** Ações do provider (quick fixes e refatorações) para um intervalo; usado também pelo smoke nativo. */
export let codeActions: (model: monaco.editor.ITextModel, range: monaco.Range) => Promise<readonly monaco.languages.CodeAction[]> = async () => [];
export function mountRefactorings(rawApi: IdeApi, editor: monaco.editor.IStandaloneCodeEditor, hooks: RefactorHooks) {
 const api = rawApi as Api;
 const run = (fn: () => Promise<unknown>) => { void fn().catch(error => hooks.status(String(error?.message ?? error))); };
 const history: Transaction[] = [];
 let root = ''; const rootPath = async () => root ||= (await api.workspace()).root.replace(/[\\/]$/, '');
 const toPath = async (uri: string) => { const r = await rootPath(); const p = decodeURIComponent(new URL(uri).pathname); const base = r.replaceAll('\\', '/'); if (!p.startsWith(base + '/')) throw Error(msg`Edição fora do projeto: ${p}`); return p.slice(base.length + 1); };
 const textOf = async (path: string) => hooks.buffer(path)?.model.getValue() ?? (await api.read(path)).text;

 // ── Arquivos do projeto e índice de classes (buffers abertos têm precedência sobre o disco) ──
 let files: Promise<FileText[]> | undefined; let index: Promise<ClassIndex> | undefined;
 const invalidate = () => { files = undefined; index = undefined; };
 window.addEventListener('ide-project-files-changed', invalidate); window.addEventListener('ide-workspace-file-changed', invalidate);
 const projectFiles = () => files ??= (async () => {
  hooks.status(tr('Analisando arquivos PHP do projeto…'));
  const paths = (await api.listFiles('', false)).filter(p => p.endsWith('.php') && !p.endsWith('.blade.php'));
  const out: FileText[] = []; let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (next < paths.length) { const path = paths[next++]; try { out.push({ path, text: (await api.read(path)).text }); } catch { /* binário, grande ou ilegível: fora do recorte */ } } }));
  return out;
 })().catch(error => { files = undefined; throw error; });
 const current = async () => (await projectFiles()).map(f => { const b = hooks.buffer(f.path); return b ? { path: f.path, text: b.model.getValue() } : f; });
 const classes = () => index ??= current().then(classIndex).catch(error => { index = undefined; throw error; });

 // ── Servidor de linguagem ─────────────────────────────────────────────────────────────────
 const documents = (except: string) => [...new Set(monaco.editor.getModels())].filter(m => php(m) && hooks.pathOf(m) && hooks.pathOf(m) !== except).map(m => ({ path: hooks.pathOf(m)!, text: m.getValue(), version: m.getVersionId() }));
 const lsp = (model: monaco.editor.ITextModel, method: string, at: monaco.IPosition, extra: Record<string, unknown> = {}) => { const path = hooks.pathOf(model)!; return api.language({ method, path, text: model.getValue(), version: model.getVersionId(), position: { line: at.lineNumber - 1, character: at.column - 1 }, documents: documents(path), ...extra } as any) as Promise<any>; };
 /** WorkspaceEdit do servidor → plano com texto anterior/posterior por arquivo. */
 async function fromWorkspace(edits: any[], title: string): Promise<Plan> {
  const byUri = new Map<string, Lsp[]>();
  for (const edit of edits) {
   for (const [uri, list] of Object.entries(edit?.changes ?? {})) byUri.set(uri, [...byUri.get(uri) ?? [], ...list as Lsp[]]);
   for (const dc of edit?.documentChanges ?? []) { if (dc.kind) throw Error(msg`O servidor pediu ${dc.kind} de arquivo; essa operação ainda não é suportada aqui.`); byUri.set(dc.textDocument.uri, [...byUri.get(dc.textDocument.uri) ?? [], ...dc.edits]); }
  }
  const changes: FileChange[] = [];
  for (const [uri, list] of byUri) { const path = await toPath(uri); const before = await textOf(path); changes.push(change(path, before, list.map(e => ({ start: offsetOf(before, e.range.start), end: offsetOf(before, e.range.end), text: e.newText })))); }
  return { title, changes: changes.filter(c => c.before !== c.after), warnings: [], conflicts: [] };
 }

 // ── Transação, desfazer e aviso ───────────────────────────────────────────────────────────
 /** Disco primeiro (tudo ou nada, com hash); depois buffers abertos com alterações não salvas. */
 async function commit(plan: Plan, moved?: { from: string; to: string }): Promise<Transaction> {
  const changes = plan.changes.filter(c => c.before !== c.after);
  if (!changes.length) throw Error(tr('Nenhuma alteração a aplicar.'));
  const disk: { path: string; etag: string; text: string }[] = [];
  // Só o arquivo do editor: edita o buffer, como uma digitação; o Ctrl+Z do editor desfaz e o usuário salva.
  const local = changes.length === 1 && !moved && !!hooks.buffer(changes[0].path) && hooks.buffer(changes[0].path)!.model === editor.getModel();
  for (const c of changes) {
   const b = hooks.buffer(c.path);
   if (b && b.model.getValue() !== c.before) throw Error(msg`${c.path} mudou desde a prévia; nada foi alterado. Refaça a refatoração.`);
   if (!local && (!b || !b.dirty)) { const f = await api.read(c.path); if (f.text !== c.before) throw Error(msg`${c.path} mudou no disco; nada foi alterado. Refaça a refatoração.`); disk.push({ path: c.path, etag: f.etag, text: c.after }); }
  }
  const written = disk.length ? await api.languageApply({ label: plan.title, changes: disk }) : { etags: {} as Record<string, string> };
  const tx: Transaction = { label: plan.title, files: [], time: Date.now() };
  for (const c of changes) {
   const b = hooks.buffer(c.path); const onDisk = disk.some(d => d.path === c.path);
   if (b) { editModel(b.model, c.edits); if (onDisk) hooks.saved(c.path, c.after, written.etags[c.path]); }
   tx.files.push({ path: c.path, before: c.before, after: c.after, disk: onDisk, model: b?.model, version: b?.model.getAlternativeVersionId() });
  }
  if (moved) { const to = await hooks.relocateFile(moved.from, { name: moved.to.split('/').pop(), directory: moved.to.includes('/') ? moved.to.slice(0, moved.to.lastIndexOf('/')) : '' }); tx.moved = { from: moved.from, to }; }
  history.push(tx); if (history.length > 20) history.shift(); invalidate();
  toast(msg`${plan.title}: ${tx.files.length} arquivo(s) alterado(s)`, tx);
  hooks.status(msg`${plan.title} · ${tx.files.length} arquivo(s) · ${keyLabel('Ctrl+Z')} ou "Desfazer" reverte todos`);
  return tx;
 }
 async function undo(tx = history.at(-1)) {
  if (!tx) { hooks.status(tr('Nenhuma refatoração para desfazer.')); return; }
  const at = (path: string) => tx.moved && path === tx.moved.from ? tx.moved.to : path;
  const disk: { path: string; etag: string; text: string }[] = [];
  for (const f of tx.files) {
   const b = hooks.buffer(at(f.path)); const text = b?.model.getValue() ?? (await api.read(at(f.path))).text;
   if (text !== f.after) throw Error(msg`${at(f.path)} mudou depois da refatoração; desfazer foi cancelado. Use o Histórico local para restaurar.`);
   if (f.disk) disk.push({ path: at(f.path), etag: (await api.read(at(f.path))).etag, text: f.before });
  }
  const written = disk.length ? await api.languageApply({ label: msg`Desfazer: ${tx.label}`, changes: disk }) : { etags: {} as Record<string, string> };
  for (const f of tx.files) { const b = hooks.buffer(at(f.path)); if (!b) continue; editModel(b.model, [minimal(f.after, f.before)]); if (f.disk) hooks.saved(at(f.path), f.before, written.etags[at(f.path)]); }
  if (tx.moved) { const name = tx.moved.from.split('/').pop()!; const dir = tx.moved.from.includes('/') ? tx.moved.from.slice(0, tx.moved.from.lastIndexOf('/')) : ''; await hooks.relocateFile(tx.moved.to, { name, directory: dir }); }
  history.splice(history.indexOf(tx), 1); invalidate(); document.querySelector('.refactor-toast')?.remove();
  hooks.status(msg`Desfeito: ${tx.label} (${tx.files.length} arquivo(s) restaurado(s))`);
 }
 function toast(text: string, tx: Transaction) {
  document.querySelector('.refactor-toast')?.remove();
  const t = document.createElement('div'); t.className = 'refactor-toast'; t.setAttribute('role', 'status');
  const span = document.createElement('span'); span.textContent = text; const b = document.createElement('button'); b.type = 'button'; b.textContent = tr('Desfazer');
  const x = document.createElement('button'); x.type = 'button'; x.className = 'close'; x.textContent = '×'; x.setAttribute('aria-label', tr('Fechar aviso'));
  b.onclick = () => run(() => undo(tx)); x.onclick = () => t.remove(); t.append(span, b, x); document.body.append(t);
  setTimeout(() => t.remove(), 15000);
 }
 /** Aplica com prévia quando pedida ou quando há avisos/conflitos. */
 async function execute(plan: Plan, showPreview: boolean, moved?: { from: string; to: string }) {
  if (!plan.changes.length && !plan.conflicts.length) throw Error(tr('Nenhuma ocorrência encontrada para alterar.'));
  let chosen: Plan | undefined = plan;
  if (showPreview || plan.warnings.length || plan.conflicts.length) chosen = await preview(plan);
  if (!chosen) { hooks.status(msg`${plan.title}: cancelado, nada foi alterado.`); return undefined; }
  return commit(chosen, moved);
 }

 // ── Rename Symbol ─────────────────────────────────────────────────────────────────────────
 /** Renomeia classe/interface/trait/enum pelo motor próprio; `file` renomeia também o arquivo PSR-4. */
 async function renameClass(fqn: string, options: { name?: string; file?: string; fromTree?: boolean; strings?: boolean } = {}) {
  const all = await current(); const idx = classIndex(all); const declared = idx.get(fqn.toLowerCase());
  if (!declared) throw Error(msg`Classe ${fqn} não declarada no projeto (vendor não é renomeado).`);
  const short = declared.fqn.split('\\').pop()!; const filePath = declared.path; const sameFile = filePath.split('/').pop() === `${short}.php`;
  let name = options.name; let strings = !!options.strings; let renameFile = !!options.file || (sameFile && !options.fromTree); let showPreview = false;
  if (name === undefined || options.fromTree) {
   const answer = await ask(msg`Renomear ${declared.fqn}`, [
    { name: 'name', label: tr('Novo nome'), value: name ?? short, select: [0, (name ?? short).length] },
    { name: 'strings', type: 'checkbox', label: tr('Também em comentários e strings (FQN)') },
    ...(sameFile && !options.fromTree ? [{ name: 'file', type: 'checkbox' as const, checked: true, label: msg`Renomear o arquivo ${filePath.split('/').pop()}` }] : []),
   ], { preview: true, live: v => !isClassName(String(v.name)) ? { error: tr('Nome de classe PHP inválido.') } : idx.has((declared.fqn.slice(0, -short.length) + v.name).toLowerCase()) && String(v.name).toLowerCase() !== short.toLowerCase() ? { error: msg`Já existe ${declared.fqn.slice(0, -short.length) + v.name}.` } : {} });
   if (!answer) { hooks.status(tr('Renomear cancelado; nada foi alterado.')); return false; }
   name = String(answer.values.name); strings = !!answer.values.strings; if (!options.fromTree) renameFile = !!answer.values.file; showPreview = answer.action === 'preview';
  }
  if (name === short) return false;
  const plan = moveClass(all, idx, declared.fqn, declared.fqn.slice(0, -short.length) + name, { strings });
  if (renameFile && hooks.buffer(filePath)?.dirty) { renameFile = false; plan.warnings.push(msg`${filePath} tem alterações não salvas; o arquivo não será renomeado (salve e renomeie pela árvore).`); }
  const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : '';
  return !!await execute(plan, showPreview, renameFile && sameFile ? { from: filePath, to: `${dir}${name}.php` } : undefined);
 }
 /** Move a classe declarada em `path` para `directory`, atualizando namespace e referências. */
 async function moveClassFile(path: string, directory: string, namespace: string) {
  const all = await current(); const idx = classIndex(all); const text = all.find(f => f.path === path)?.text ?? await textOf(path);
  const decl = phpModel(text).decls[0]; if (!decl) throw Error(msg`${path} não declara classe.`);
  const to = namespace ? `${namespace}\\${decl.name}` : decl.name;
  const plan = moveClass(all, idx, decl.fqn, to);
  return !!await execute(plan, false, { from: path, to: `${directory ? directory + '/' : ''}${path.split('/').pop()}` });
 }
 async function renameMethod(model: monaco.editor.ITextModel, path: string, at: monaco.Position, family: { name: string; owner: string; ownerName: string; members: { name: string }[] }) {
  const bare = family.name;
  const answer = await ask(msg`Renomear o método '${bare}' e seus usos para:`, [
   { name: 'name', label: tr('Novo nome'), value: bare, select: [0, bare.length] },
   { name: 'comments', type: 'checkbox', label: tr('Buscar em comentários e strings') },
   { name: 'text', type: 'checkbox', label: tr('Buscar ocorrências de texto') },
  ], { preview: true, note: family.members.length > 1 ? msg`Hierarquia: ${family.members.map(m => m.name).join(', ')}` : undefined, live: v => !isIdentifier(String(v.name)) ? { error: tr('Identificador PHP inválido.') } : {} });
  if (!answer) { hooks.status(tr('Renomear cancelado; nada foi alterado.')); return; }
  const name = String(answer.values.name); if (name === bare) return;
  hooks.status(tr('Calculando ocorrências…'));
  const edit = await (api as any).phpMethodRename({ path, text: model.getValue(), version: model.getVersionId(), position: { line: at.lineNumber - 1, character: at.column - 1 }, documents: documents(path) }, name, { comments: !!answer.values.comments, text: !!answer.values.text });
  const plan = await fromWorkspace(edit ? [edit] : [], msg`Renomear método ${bare} para ${name}`);
  if (!plan.changes.length) throw Error(tr('Nenhuma ocorrência encontrada para alterar.'));
  await execute(plan, answer.action === 'preview');
 }
 async function rename() {
  const model = editor.getModel(); const at = editor.getPosition(); if (!model || !at) return;
  const path = hooks.pathOf(model); if (!path || !php(model)) { hooks.status(tr('Rename Symbol está disponível em arquivos PHP do projeto.')); return; }
  const text = model.getValue(); const offset = model.getOffsetAt(at);
  const local = classAt(text, offset);
  if (local) { const idx = await classes(); const known = idx.get(local.fqn.toLowerCase()); if (known) { await renameClass(known.fqn); return; } if (phpModel(text).decls.some(d => d.fqn === local.fqn)) { index = undefined; await renameClass(local.fqn); return; } throw Error(msg`${local.fqn} não está declarada no projeto; não é possível renomear.`); }
  hooks.status(tr('Procurando o símbolo…'));
  // Método com hierarquia (recorte 29): renomeia a família inteira (base, implementações e sobrescritas).
  const family = await (api as any).phpMethodFamily?.({ path, text, version: model.getVersionId(), position: { line: at.lineNumber - 1, character: at.column - 1 } }).catch(() => null);
  if (family) { await renameMethod(model, path, at, family); return; }
  let range: any; try { range = await lsp(model, 'textDocument/prepareRename', at); } catch (error) { throw Error(msg`Rename indisponível: ${String((error as Error)?.message ?? error)}`); }
  range = range?.range ?? range;
  if (!range?.start) { hooks.status(tr('Não é possível renomear o elemento no cursor.')); return; }
  const oldName = text.slice(offsetOf(text, range.start), offsetOf(text, range.end)); const variable = oldName.startsWith('$') || text[offsetOf(text, range.start) - 1] === '$';
  const bare = oldName.replace(/^\$/, '');
  const answer = await ask(variable ? msg`Renomear variável $${bare}` : msg`Renomear ${bare}`, [{ name: 'name', label: tr('Novo nome'), value: bare, select: [0, bare.length] }], { preview: true, live: v => !isIdentifier(String(v.name).replace(/^\$/, '')) ? { error: tr('Identificador PHP inválido.') } : {} });
  if (!answer) { hooks.status(tr('Renomear cancelado; nada foi alterado.')); return; }
  const name = String(answer.values.name).replace(/^\$/, ''); if (name === bare) return;
  hooks.status(tr('Calculando ocorrências…'));
  const edit = await lsp(model, 'textDocument/rename', at, { newName: name });
  const plan = await fromWorkspace(edit ? [edit] : [], variable ? msg`Renomear $${bare} para $${name}` : msg`Renomear ${bare} para ${name}`);
  if (variable && new RegExp(`\\$${name}\\b`).test(text)) plan.warnings.push(msg`$${name} já aparece neste arquivo; confira se não há colisão no mesmo escopo.`);
  await execute(plan, answer.action === 'preview');
 }

 // ── Extract / Inline ──────────────────────────────────────────────────────────────────────
 const selection = () => { const model = editor.getModel(); const s = editor.getSelection(); const path = model && hooks.pathOf(model); if (!model || !s || !path || !php(model)) throw Error(tr('Selecione código PHP de um arquivo do projeto.')); return { model, path, text: model.getValue(), start: model.getOffsetAt(s.getStartPosition()), end: model.getOffsetAt(s.getEndPosition()), empty: s.isEmpty() }; };
 async function extractMethodUi() {
  const s = selection(); if (s.empty) throw Error(tr('Selecione as instruções ou a expressão a extrair (Extract Method).'));
  const first = extractMethod(s.path, s.text, s.start, s.end, 'extracted'); if (first.error && !/Já existe/.test(first.error)) throw Error(first.error);
  const answer = await ask(tr('Extrair método'), [{ name: 'name', label: tr('Nome do método'), value: 'extracted', select: [0, 9] }], { preview: true, live: v => { const r = extractMethod(s.path, s.text, s.start, s.end, String(v.name)); return r.error ? { error: r.error } : { info: msg`Parâmetros: ${r.params!.map(p => '$' + p).join(', ') || tr('nenhum')} · Retorno: ${r.returns!.map(p => '$' + p).join(', ') || tr('nenhum')}` }; } });
  if (!answer) { hooks.status(tr('Extrair método cancelado.')); return; }
  const r = extractMethod(s.path, s.text, s.start, s.end, String(answer.values.name)); if (r.error) throw Error(r.error);
  await execute(r.plan!, answer.action === 'preview');
 }
 async function extractVariableUi() {
  const s = selection(); if (s.empty) throw Error(tr('Selecione a expressão a extrair (Extract Variable).'));
  const expr = s.text.slice(s.start, s.end); const guess = /(?:->|::)?(?:get)?([A-Za-z_]\w*)\s*\([^()]*\)\s*$/.exec(expr)?.[1] ?? /\$(\w+)/.exec(expr)?.[1] ?? 'value';
  const suggested = guess[0].toLowerCase() + guess.slice(1);
  const all = extractVariable(s.path, s.text, s.start, s.end, suggested + 'Extracted', true); if (all.error) throw Error(all.error);
  const answer = await ask(tr('Extrair variável'), [{ name: 'name', label: tr('Nome da variável'), value: '$' + suggested, select: [1, suggested.length + 1] }, ...(all.occurrences! > 1 ? [{ name: 'all', type: 'checkbox' as const, label: msg`Substituir todas as ${all.occurrences} ocorrências`, checked: false }] : [])], { preview: true, live: v => { const r = extractVariable(s.path, s.text, s.start, s.end, String(v.name), !!v.all); return r.error ? { error: r.error } : { info: r.plan!.warnings.join(' ') }; } });
  if (!answer) { hooks.status(tr('Extrair variável cancelado.')); return; }
  const r = extractVariable(s.path, s.text, s.start, s.end, String(answer.values.name), !!answer.values.all); if (r.error) throw Error(r.error);
  await execute({ ...r.plan!, warnings: [] }, answer.action === 'preview');
 }
 async function inlineUi() {
  const s = selection(); const r = inlineVariable(s.path, s.text, s.start); if (r.error) throw Error(r.error);
  const answer = await ask(msg`Incorporar $${r.name}`, [], { ok: tr('Incorporar'), preview: true, note: [msg`${r.uses} uso(s) receberão a expressão e a atribuição será removida.`, ...r.plan!.warnings].join(' ') });
  if (!answer) { hooks.status(tr('Incorporar cancelado.')); return; }
  await execute({ ...r.plan!, warnings: [] }, answer.action === 'preview');
 }

 // ── Inspeções (marcadores) ────────────────────────────────────────────────────────────────
 const owner = 'php-inspections'; const problems = new Map<monaco.editor.ITextModel, (Problem & { lsp?: any })[]>(); const timers = new Map<monaco.editor.ITextModel, number>();
 const severity = (s: Problem['severity']) => s === 'error' ? monaco.MarkerSeverity.Error : s === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info;
 async function diagnose(model: monaco.editor.ITextModel) {
  const path = hooks.pathOf(model); if (!path || !php(model) || model.isDisposed()) return;
  const text = model.getValue(); const version = model.getVersionId(); const input = { path, text, version, position: { line: 0, character: 0 } };
  const list: (Problem & { lsp?: any })[] = inspect(text);
  try { for (const d of (await api.language({ ...input, method: 'textDocument/diagnostic' })) as any[] ?? []) { const start = offsetOf(text, d.range.start); const end = offsetOf(text, d.range.end); list.push({ id: d.code, code: d.code, message: d.message, start, end, severity: d.severity === 'error' ? 'error' : 'warning', source: 'php-ide', fixes: (d.fixes ?? []).filter((f: any) => f.edits?.length && !f.create).map((f: any) => ({ title: f.title, edits: f.edits.map((e: Lsp) => ({ start: offsetOf(text, e.range.start), end: offsetOf(text, e.range.end), text: e.newText })) })) }); } } catch { /* plugins opcionais */ }
  try {
   for (let attempt = 0; attempt < 5 && !model.isDisposed() && model.getVersionId() === version; attempt++) {
    const r: any = await api.language({ ...input, method: 'php/diagnostics' as any });
    if (r?.current || attempt === 4) { for (const d of r?.diagnostics ?? []) { const start = offsetOf(text, d.range.start); const end = offsetOf(text, d.range.end); list.push({ id: inspectionId(d.code), code: d.code, message: d.message, start, end: Math.max(end, start + 1), severity: d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'weak', source: 'phpactor', fixes: [], lsp: d }); } break; }
    await new Promise(r => setTimeout(r, 600));
   }
  } catch { /* servidor indisponível: inspeções próprias continuam */ }
  if (model.isDisposed() || model.getVersionId() !== version) return;
  const visible = list.filter(p => !suppressed(text, p.start, p.id));
  problems.set(model, visible);
  monaco.editor.setModelMarkers(model, owner, visible.map(p => { const s = model.getPositionAt(p.start); const e = model.getPositionAt(Math.max(p.end, p.start + 1)); return { severity: severity(p.severity), message: p.message, code: p.id, source: p.source === 'phpactor' ? 'Phpactor' : 'PHP IDE', startLineNumber: s.lineNumber, startColumn: s.column, endLineNumber: e.lineNumber, endColumn: e.column }; }));
 }
 const schedule = (model: monaco.editor.ITextModel, delay = 700) => { clearTimeout(timers.get(model)); timers.set(model, window.setTimeout(() => { timers.delete(model); void diagnose(model); }, delay)); };
 const watched = new WeakSet<monaco.editor.ITextModel>();
 const watch = (model: monaco.editor.ITextModel | null) => { if (!model || !php(model) || watched.has(model)) { if (model && php(model)) schedule(model, 50); return; } watched.add(model); model.onDidChangeContent(() => schedule(model)); model.onWillDispose(() => { problems.delete(model); clearTimeout(timers.get(model)); }); schedule(model, 50); };
 editor.onDidChangeModel(() => watch(editor.getModel())); watch(editor.getModel());

 // ── Quick fixes e ações (Alt+Enter) ───────────────────────────────────────────────────────
 const invoke = 'php-ide.refactor.invoke';
 monaco.editor.registerCommand(invoke, (_accessor, fn: () => Promise<unknown>) => run(fn));
 const workspaceEdit = (model: monaco.editor.ITextModel, edits: Edit[]): monaco.languages.WorkspaceEdit => ({ edits: edits.map(e => { const s = model.getPositionAt(e.start); const t = model.getPositionAt(e.end); return { resource: model.uri, versionId: model.getVersionId(), textEdit: { range: new monaco.Range(s.lineNumber, s.column, t.lineNumber, t.column), text: e.text } }; }) });
 /** Comando do servidor: edições capturadas viram plano; um só arquivo aberto aplica direto (undo do editor). */
 async function serverCommand(model: monaco.editor.ITextModel, command: { command: string; arguments?: unknown[] }, title: string) {
  const r: any = await lsp(model, 'workspace/executeCommand', { lineNumber: 1, column: 1 }, { command: command.command, arguments: command.arguments ?? [] });
  if (r?.messages?.length) throw Error(r.messages.join(' '));
  const plan = await fromWorkspace(r?.edits ?? [], title);
  if (!plan.changes.length) { hooks.status(msg`${title}: nada a alterar.`); return; }
  const path = hooks.pathOf(model);
  if (plan.changes.length === 1 && plan.changes[0].path === path) { editModel(model, plan.changes[0].edits); hooks.status(msg`${title} · ${keyLabel('Ctrl+Z')} desfaz`); return; }
  await execute(plan, true);
 }
 const provider: monaco.languages.CodeActionProvider = {
  provideCodeActions: async (model, range) => {
   const path = hooks.pathOf(model); if (!path) return { actions: [], dispose() {} };
   const text = model.getValue(); const from = model.getOffsetAt(range.getStartPosition()); const to = model.getOffsetAt(range.getEndPosition());
   const actions: monaco.languages.CodeAction[] = []; const offered = new Set<string>();
   const hits = (problems.get(model) ?? []).filter(p => p.start <= to && from <= p.end);
   for (const p of hits) {
    const marker = { severity: severity(p.severity), message: p.message, code: p.id, startLineNumber: model.getPositionAt(p.start).lineNumber, startColumn: model.getPositionAt(p.start).column, endLineNumber: model.getPositionAt(p.end).lineNumber, endColumn: model.getPositionAt(p.end).column };
    for (const f of p.fixes) actions.push({ title: f.title, kind: 'quickfix', diagnostics: [marker], isPreferred: actions.length === 0, edit: workspaceEdit(model, f.edits) });
    if (p.code === 'worse.unresolved_name') {
     try { for (const f of importFixes(text, p.start, await Promise.race([classes(), new Promise<ClassIndex>((_, no) => setTimeout(() => no(Error('índice lento')), 4000))]))) { offered.add(f.fqn.toLowerCase()); actions.push({ title: f.title, kind: 'quickfix', diagnostics: [marker], isPreferred: actions.length === 0 && !f.alias, edit: workspaceEdit(model, f.edits) }); } } catch { /* índice indisponível */ }
    }
    actions.push({ title: msg`Suprimir ${p.id} nesta instrução`, kind: 'quickfix.suppress', diagnostics: [marker], edit: workspaceEdit(model, [suppressEdit(text, p.start, p.id, 'statement')]) });
    actions.push({ title: msg`Suprimir ${p.id} neste arquivo`, kind: 'quickfix.suppress', diagnostics: [marker], edit: workspaceEdit(model, [suppressEdit(text, p.start, p.id, 'file')]) });
   }
   // Ações do servidor (importar, gerar membro, extrair…): comandos executados só quando escolhidos.
   try {
    // Orçamento de tempo: correções próprias não esperam um servidor lento ou ocupado.
    const server: any[] = await Promise.race([new Promise<any[]>(r => setTimeout(() => r([]), 2500)), lsp(model, 'textDocument/codeAction', range.getStartPosition(), { range: { start: { line: range.startLineNumber - 1, character: range.startColumn - 1 }, end: { line: range.endLineNumber - 1, character: range.endColumn - 1 } }, diagnostics: hits.filter(h => h.lsp).map(h => h.lsp) })]) ?? [];
    for (const a of server) {
     const fqn = /"(.+)"/.exec(a.title ?? '')?.[1]?.toLowerCase(); if (a.kind === 'quickfix.import_class' && fqn && offered.has(fqn)) continue;
     const title = `${a.title} (Phpactor)`;
     if (a.edit) { const plan = await fromWorkspace([a.edit], a.title); if (plan.changes.length === 1 && plan.changes[0].path === path) actions.push({ title, kind: a.kind, edit: workspaceEdit(model, plan.changes[0].edits) }); else actions.push({ title, kind: a.kind, command: { id: invoke, title, arguments: [() => execute(plan, true)] } }); }
     else if (a.command) actions.push({ title, kind: a.kind, command: { id: invoke, title, arguments: [() => serverCommand(model, a.command, a.title)] } });
    }
   } catch { /* servidor indisponível */ }
   if (!range.isEmpty()) {
    actions.push({ title: msg`Extrair método… (${keymap.shortcut('refactor.extractMethod')})`, kind: 'refactor.extract.method', command: { id: invoke, title: '', arguments: [extractMethodUi] } });
    actions.push({ title: msg`Extrair variável… (${keymap.shortcut('refactor.extractVariable')})`, kind: 'refactor.extract.variable', command: { id: invoke, title: '', arguments: [extractVariableUi] } });
   } else if (phpModel(text).items.some(i => i.type === 'var' && i.start <= from && from <= i.end && i.value !== 'this')) actions.push({ title: msg`Incorporar variável (${keymap.shortcut('refactor.inlineVariable')})`, kind: 'refactor.inline', command: { id: invoke, title: '', arguments: [inlineUi] } });
   return { actions, dispose() {} };
  },
 };
 monaco.languages.registerCodeActionProvider('php', provider, { providedCodeActionKinds: ['quickfix', 'refactor'] });
 codeActions = (model, range) => Promise.resolve(provider.provideCodeActions(model, range, { markers: [], trigger: monaco.languages.CodeActionTriggerType.Invoke }, new monaco.CancellationTokenSource().token)).then(r => r?.actions ?? []);

 // ── Atalhos e menus ───────────────────────────────────────────────────────────────────────
 // UI-KEYMAP-001: os atalhos vivem no keymap central (contexto 'php-editor', editáveis na tela Keymap);
 // o Monaco mantém as ações sem keybinding só para o menu de contexto e a paleta, sem disparo duplo.
 const C = monaco.KeyCode; const when = 'editorLangId == php';
 keymap.defineContext('php-editor', el => !!el && editor.getContainerDomNode().contains(el) && editor.getModel()?.getLanguageId() === 'php');
 const action = (id: string, keyId: string, label: string, mac_: string, other: string, fn: () => unknown, menu = true) => {
  editor.addAction({ id, label: tr(label), precondition: when, ...(menu ? { contextMenuGroupId: '1_modification', contextMenuOrder: 1 } : {}), run: () => run(async () => fn()) });
  keymap.registerAction({ id: keyId, label, category: 'Refatoração', aliases: 'refactor php', context: 'php-editor', editorActionId: id, defaults: { mac: mac_, other }, run: () => run(async () => fn()) });
 };
 action('php-ide.renameSymbol', 'refactor.rename', 'Renomear símbolo…', 'Shift+F6', 'Shift+F6', rename);
 action('php-ide.extractMethod', 'refactor.extractMethod', 'Extrair método…', 'Alt+Meta+M', 'Ctrl+Alt+M', extractMethodUi);
 action('php-ide.extractVariable', 'refactor.extractVariable', 'Extrair variável…', 'Alt+Meta+V', 'Ctrl+Alt+V', extractVariableUi);
 action('php-ide.inlineVariable', 'refactor.inlineVariable', 'Incorporar variável', 'Alt+Meta+N', 'Ctrl+Alt+N', inlineUi);
 action('php-ide.undoRefactoring', 'refactor.undo', 'Desfazer última refatoração', '', '', () => undo(), false);
 action('php-ide.refactorThis', 'refactor.this', 'Refatorar isto…', 'Ctrl+T', 'Ctrl+Alt+Shift+T', () => refactorThis(), false);
 action('php-ide.showIntentions', 'editor.showIntentions', 'Mostrar correções e ações', 'Alt+Enter', 'Alt+Enter', () => editor.trigger('keyboard', 'editor.action.quickFix', {}), false);
 action('php-ide.nextProblem', 'editor.nextProblem', 'Próximo problema', 'F2', 'F2', () => editor.trigger('keyboard', 'editor.action.marker.next', {}), false);
 action('php-ide.previousProblem', 'editor.previousProblem', 'Problema anterior', 'Shift+F2', 'Shift+F2', () => editor.trigger('keyboard', 'editor.action.marker.prev', {}), false);
 // Ctrl+Z logo após uma refatoração em vários arquivos desfaz todos de uma vez.
 editor.onKeyDown(e => {
  if (!(mac ? e.metaKey : e.ctrlKey) || e.shiftKey || e.altKey || e.keyCode !== C.KeyZ) return;
  const tx = history.at(-1); const model = editor.getModel(); const f = tx?.files.find(f => f.model === model);
  if (!tx || !f || tx.files.length < 2 && !tx.moved || model!.getAlternativeVersionId() !== f.version) return;
  e.preventDefault(); e.stopPropagation(); run(() => undo(tx));
 });
 function refactorThis() {
  const s = editor.getSelection(); const items: [string, string, () => Promise<unknown>][] = [[tr('Renomear…'), 'refactor.rename', rename]];
  if (s && !s.isEmpty()) items.push([tr('Extrair método…'), 'refactor.extractMethod', extractMethodUi], [tr('Extrair variável…'), 'refactor.extractVariable', extractVariableUi]);
  else items.push([tr('Incorporar variável'), 'refactor.inlineVariable', inlineUi]);
  if (history.length) items.push([msg`Desfazer: ${history.at(-1)!.label}`, '', () => undo()]);
  document.querySelector('.refactor-this')?.remove();
  const menu = document.createElement('div'); menu.className = 'context-menu refactor-this'; menu.setAttribute('role', 'menu');
  const close = () => { menu.remove(); editor.focus(); };
  for (const [label, key, fn] of items) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); const l = document.createElement('span'); l.textContent = label; const k = document.createElement('kbd'); k.textContent = key ? keymap.shortcut(key) : ''; b.append(l, k); b.onclick = () => { close(); run(fn); }; menu.append(b); }
  menu.addEventListener('keydown', e => { const bs = [...menu.querySelectorAll('button')]; const i = bs.indexOf(document.activeElement as HTMLButtonElement); if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); } });
  menu.addEventListener('focusout', e => { if (!menu.contains(e.relatedTarget as Node)) menu.remove(); });
  const p = editor.getScrolledVisiblePosition(editor.getPosition()!); const r = editor.getDomNode()!.getBoundingClientRect();
  menu.style.left = `${r.left + (p?.left ?? 40)}px`; menu.style.top = `${r.top + (p?.top ?? 40) + 20}px`; document.body.append(menu); menu.querySelector('button')?.focus();
 }

 return {
  /** Declaração de classe em um arquivo (para o menu da árvore). */
  async classIn(path: string) { const d = phpModel(await textOf(path)).decls; return d.length === 1 ? { fqn: d[0].fqn, name: d[0].name } : undefined; },
  renameClass, moveClassFile, rename, undo, history,
  applyEdits,
 };
}
export type Refactorings = ReturnType<typeof mountRefactorings>;
