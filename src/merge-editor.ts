import { t as tr, msg, html } from './i18n';
import * as monaco from 'monaco-editor';
import type { GitChange, GitConflict, IdeApi } from '../shared/contracts';
import { merge3, simpleMerge, summary } from '../shared/merge';

type Hooks = { hasUnsaved(): boolean; busy(): boolean; setBusy(value: boolean): void; changed(): Promise<void>; feedback(message: string): void };
type Side = 'left' | 'right';
// optional: o outro lado de um conflito já resolvido continua disponível para acrescentar.
type Status = 'pending' | 'optional' | 'applied' | 'ignored';
const languageFor = (path: string) => path.endsWith('.blade.php') ? 'blade' : path.endsWith('.php') ? 'php' : undefined;
const conflicted = (c: GitChange) => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(c.index + c.worktree);
const sideState = (code: string) => code === 'D' ? tr('Excluído') : code === 'A' ? 'Adicionado' : 'Modificado';

/** Pergunta modal com dois botões; resolve true no botão principal. */
function ask(parent: HTMLElement, message: string, stay: string, proceed: string) {
 return new Promise<boolean>(resolve => {
  const confirm = document.createElement('dialog'); confirm.className = 'merge-confirm';
  confirm.innerHTML = html('<p></p><div><button class="stay"></button> <button class="proceed"></button></div>');
  confirm.querySelector('p')!.textContent = message;
  confirm.querySelector('.stay')!.textContent = stay; confirm.querySelector('.proceed')!.textContent = proceed;
  const done = (value: boolean) => { confirm.close(); confirm.remove(); resolve(value); };
  confirm.querySelector<HTMLButtonElement>('.stay')!.onclick = () => done(false);
  confirm.querySelector<HTMLButtonElement>('.proceed')!.onclick = () => done(true);
  confirm.addEventListener('cancel', event => { event.preventDefault(); done(false); });
  parent.append(confirm); confirm.showModal(); confirm.querySelector<HTMLButtonElement>('.stay')!.focus();
 });
}

export function mergeTools(api: IdeApi, hooks: Hooks) {
 let list: HTMLDialogElement | undefined;

 async function merge(path: string): Promise<boolean> {
  const conflict = await api.gitConflict(path);
  return new Promise(resolve => show(conflict, resolve));
 }

 function show(conflict: GitConflict, finished: (resolved: boolean) => void) {
  const m = merge3(conflict.base, conflict.ours, conflict.theirs);
  const status = m.chunks.map(c => ({ left: (c.kind === 'right' ? 'applied' : 'pending') as Status, right: (c.kind === 'left' ? 'applied' : 'pending') as Status }));
  const window = document.createElement('dialog'); window.className = 'merge-window';
  window.innerHTML = html`<header><h2>Mesclar revisões</h2><span class="merge-path"></span></header>
<div class="merge-toolbar" role="toolbar" aria-label="Ações de merge">
 <button data-act="prev" title="Diferença anterior (⇧F7)">↑</button><button data-act="next" title="Próxima diferença (F7)">↓</button>
 <span class="merge-label">Aplicar sem conflito:</span><button data-act="apply-left" title="Aplicar alterações não conflitantes da esquerda">Esquerda</button><button data-act="apply-all" title="Aplicar todas as alterações não conflitantes">Todas</button><button data-act="apply-right" title="Aplicar alterações não conflitantes da direita">Direita</button>
 <button data-act="simple" title="Resolver conflitos em que os dois lados alteram trechos diferentes">Resolver conflitos simples</button>
 <span class="merge-summary" role="status" aria-live="polite"></span>
</div>
<div class="merge-panes"><section><h3 class="merge-left-title"></h3><div class="merge-pane merge-left"></div></section><section><h3>Resultado</h3><div class="merge-pane merge-result"></div></section><section><h3 class="merge-right-title"></h3><div class="merge-pane merge-right"></div></section></div>
<p class="error" role="alert"></p>
<footer><button data-act="accept-left"></button><button data-act="accept-right"></button><span class="merge-spacer"></span><button data-act="cancel">Cancelar</button><button data-act="apply" class="primary">Aplicar</button></footer>`;
  const q = <T extends HTMLElement>(s: string) => window.querySelector<T>(s)!;
  q('.merge-path').textContent = conflict.path;
  const rebase = conflict.operation === 'rebase';
  q('.merge-left-title').textContent = msg`Alterações de ${conflict.oursLabel}${rebase ? tr(' (base do rebase)') : ''}`;
  q('.merge-right-title').textContent = msg`Alterações de ${conflict.theirsLabel}`;
  q('[data-act="accept-left"]').textContent = `Aceitar esquerda (${conflict.oursLabel})`;
  q('[data-act="accept-right"]').textContent = `Aceitar direita (${conflict.theirsLabel})`;
  document.body.append(window);
  const language = languageFor(conflict.path);
  const options: monaco.editor.IStandaloneEditorConstructionOptions = { automaticLayout: true, minimap: { enabled: false }, glyphMargin: true, scrollBeyondLastLine: false, fontSize: 13, lineNumbersMinChars: 3 };
  const models = [monaco.editor.createModel(conflict.ours, language), monaco.editor.createModel(conflict.base, language), monaco.editor.createModel(conflict.theirs, language)];
  const left = monaco.editor.create(q('.merge-left'), { ...options, model: models[0], readOnly: true });
  const result = monaco.editor.create(q('.merge-result'), { ...options, model: models[1] });
  const right = monaco.editor.create(q('.merge-right'), { ...options, model: models[2], readOnly: true });
  const model = models[1];

  // Faixa de cada chunk no resultado acompanha edições manuais por decoração rastreada.
  const rangeOf = (target: monaco.editor.ITextModel, [s, e]: [number, number]) => {
   const count = target.getLineCount(); const at = (line: number) => line < count ? new monaco.Position(line + 1, 1) : new monaco.Position(count, target.getLineMaxColumn(count));
   const a = at(s); const b = at(e); return new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column);
  };
  const stick = monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
  let tracked = model.deltaDecorations([], m.chunks.map(c => ({ range: rangeOf(model, c.base), options: { stickiness: stick } })));
  const tracking = (i: number) => model.getDecorationRange(tracked[i]) ?? rangeOf(model, m.chunks[i].base);
  const retrack = (i: number, range: monaco.IRange) => { tracked[i] = model.deltaDecorations([tracked[i]], [{ range, options: { stickiness: stick } }])[0]; };
  // Linhas [início, fim) 0-based de uma faixa rastreada; vazia representa inserção antes de `início`.
  const span = (r: monaco.Range): [number, number] => [r.startLineNumber - 1, r.isEmpty() ? r.startLineNumber - 1 : r.endColumn === 1 ? r.endLineNumber - 1 : r.endLineNumber];
  const resolved = (i: number) => status[i].left !== 'pending' && status[i].right !== 'pending';
  const glyph = (i: number, side: Side, arrow: string) => status[i][side] === 'pending' ? `merge-glyph ${arrow}` : status[i][side] === 'optional' ? `merge-glyph merge-glyph-append` : undefined;

  function replace(i: number, text: string, append: boolean) {
   const range = tracking(i);
   const start = model.getOffsetAt(range.getStartPosition()); const old = model.getValueInRange(range);
   const at = append ? monaco.Range.fromPositions(range.getEndPosition()) : range;
   model.pushEditOperations([], [{ range: at, text, forceMoveMarkers: true }], () => null);
   const end = model.getPositionAt(start + (append ? old.length : 0) + text.length);
   retrack(i, monaco.Range.fromPositions(model.getPositionAt(start), end));
  }
  function apply(i: number, side: Side) {
   const c = m.chunks[i]; if (status[i][side] !== 'pending' && status[i][side] !== 'optional') return;
   const text = (side === 'left' ? m.left.slice(...c.left) : m.right.slice(...c.right)).join('');
   const other: Side = side === 'left' ? 'right' : 'left';
   // Em conflito, aplicar o segundo lado acrescenta após o primeiro.
   replace(i, text, c.kind === 'conflict' && status[i][other] === 'applied');
   status[i][side] = 'applied';
   if (c.kind === 'both') status[i][other] = 'applied';
   else if (c.kind === 'conflict' && status[i][other] === 'pending') status[i][other] = 'optional';
   render();
  }
  function ignore(i: number) { for (const side of ['left', 'right'] as const) if (status[i][side] === 'pending' || status[i][side] === 'optional') status[i][side] = 'ignored'; render(); }
  function applyNonConflicting(which: Side | 'all') {
   m.chunks.forEach((c, i) => {
    if (c.kind === 'conflict' || resolved(i)) return;
    if (c.kind === 'both' || c.kind === which || which === 'all') apply(i, c.kind === 'right' ? 'right' : 'left');
   });
  }
  function resolveSimple() {
   let count = 0;
   m.chunks.forEach((c, i) => {
    if (c.kind !== 'conflict' || status[i].left !== 'pending' || status[i].right !== 'pending') return;
    const merged = simpleMerge(m.base.slice(...c.base).join(''), m.left.slice(...c.left).join(''), m.right.slice(...c.right).join(''));
    if (merged === null) return;
    replace(i, merged, false); status[i] = { left: 'applied', right: 'applied' }; count++;
   });
   render();
   q('.error').textContent = count ? '' : tr('Nenhum conflito simples: os dois lados alteram os mesmos caracteres.');
  }

  const decorations = { left: left.createDecorationsCollection(), result: result.createDecorationsCollection(), right: right.createDecorationsCollection() };
  const kindClass = (i: number) => resolved(i) ? 'done' : m.chunks[i].kind;
  function lineDecoration(target: monaco.editor.ITextModel, [s, e]: [number, number], cls: string, glyph?: string, hover?: string): monaco.editor.IModelDeltaDecoration {
   const empty = e <= s; const line = Math.min(s + 1, target.getLineCount());
   return { range: new monaco.Range(line, 1, empty ? line : Math.min(e, target.getLineCount()), 1), options: { isWholeLine: true, className: `merge-chunk merge-${cls}${empty ? ' merge-insert' : ''}`, ...(glyph ? { glyphMarginClassName: glyph, glyphMarginHoverMessage: { value: hover ?? '' } } : {}) } };
  }
  function render() {
   decorations.left.set(m.chunks.map((c, i) => lineDecoration(models[0], c.left, kindClass(i), c.kind !== 'right' ? glyph(i, 'left', 'merge-glyph-apply-left') : undefined, status[i].left === 'optional' ? 'Acrescentar ao resultado (+)' : 'Aplicar no resultado (»)')));
   decorations.right.set(m.chunks.map((c, i) => lineDecoration(models[2], c.right, kindClass(i), c.kind !== 'left' && c.kind !== 'both' ? glyph(i, 'right', 'merge-glyph-apply-right') : undefined, status[i].right === 'optional' ? 'Acrescentar ao resultado (+)' : 'Aplicar no resultado («)')));
   decorations.result.set(m.chunks.map((_chunk, i) => lineDecoration(model, span(tracking(i)), kindClass(i), status[i].left === 'pending' || status[i].right === 'pending' || status[i].left === 'optional' || status[i].right === 'optional' ? 'merge-glyph merge-glyph-ignore' : undefined, tr('Ignorar alteração (×)'))));
   const pendingChanges = m.chunks.filter((c, i) => c.kind !== 'conflict' && !resolved(i)).length;
   const pendingConflicts = m.chunks.filter((c, i) => c.kind === 'conflict' && !resolved(i)).length;
   q('.merge-summary').textContent = summary(pendingChanges, pendingConflicts);
   for (const act of ['apply-left', 'apply-all', 'apply-right']) q<HTMLButtonElement>(`[data-act="${act}"]`).disabled = !pendingChanges;
   q<HTMLButtonElement>('[data-act="simple"]').disabled = !pendingConflicts;
  }
  // Clique na margem de glifos aciona o chunk da linha.
  const chunkAt = (editor: monaco.editor.IStandaloneCodeEditor, line: number) => m.chunks.findIndex((c, i) => {
   const [s, e] = editor === result ? span(tracking(i)) : editor === left ? c.left : c.right;
   return line - 1 >= s && line - 1 <= Math.max(s, e - 1);
  });
  for (const [editor, action] of [[left, (i: number) => apply(i, 'left')], [right, (i: number) => apply(i, 'right')], [result, ignore]] as const)
   editor.onMouseDown(event => {
    if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !event.target.position) return;
    const i = chunkAt(editor, event.target.position.lineNumber); if (i >= 0) action(i);
   });

  // Rolagem sincronizada: linha do topo do resultado projetada nos lados pelos chunks.
  let syncing = false;
  const project = (line: number, side: Side) => {
   let mapped = line;
   for (let i = 0; i < m.chunks.length; i++) {
    const [rs, re] = span(tracking(i)); const c = m.chunks[i]; const s = side === 'left' ? c.left : c.right;
    if (rs + 1 > line) break;
    mapped = line > re ? s[1] + (line - re) : s[0] + 1 + Math.min(line - 1 - rs, s[1] - s[0]);
   }
   return mapped;
  };
  result.onDidScrollChange(() => {
   if (syncing) return; syncing = true;
   const top = result.getVisibleRanges()[0]?.startLineNumber ?? 1;
   left.setScrollTop(left.getTopForLineNumber(project(top, 'left'))); right.setScrollTop(right.getTopForLineNumber(project(top, 'right')));
   syncing = false;
  });

  function go(step: 1 | -1) {
   const line = result.getPosition()?.lineNumber ?? 0;
   const starts = m.chunks.map((_, i) => tracking(i).startLineNumber);
   const order = starts.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]);
   const target = step > 0 ? order.find(([s]) => s > line) : [...order].reverse().find(([s]) => s < line);
   if (!target) return;
   result.setPosition({ lineNumber: target[0], column: 1 }); result.revealLineInCenter(target[0]); result.focus();
   const c = m.chunks[target[1]];
   left.revealLineInCenter(c.left[0] + 1); right.revealLineInCenter(c.right[0] + 1);
  }

  let closing = false;
  const close = (done: boolean) => { closing = true; window.close(); left.dispose(); result.dispose(); right.dispose(); models.forEach(x => x.dispose()); window.remove(); finished(done); };
  async function save(text: string) {
   if (hooks.busy()) return;
   if (hooks.hasUnsaved()) { q('.error').textContent = tr('Salve os buffers abertos antes de resolver.'); return; }
   hooks.setBusy(true); window.querySelectorAll('button').forEach(b => b.disabled = true);
   try { await api.gitResolve(conflict.path, text, conflict.token); close(true); hooks.feedback(`${conflict.path}: conflito resolvido e preparado.`); }
   catch (error) { q('.error').textContent = String(error); }
   finally { hooks.setBusy(false); if (!closing) { window.querySelectorAll('button').forEach(b => b.disabled = false); render(); } await hooks.changed(); }
  }
  async function cancel() {
   if (model.getValue() !== conflict.base && !await ask(window, tr('Descartar as alterações feitas no resultado?'), 'Continuar merge', 'Descartar')) return;
   close(false);
  }
  const actions: Record<string, () => unknown> = {
   prev: () => go(-1), next: () => go(1), 'apply-left': () => applyNonConflicting('left'), 'apply-all': () => applyNonConflicting('all'), 'apply-right': () => applyNonConflicting('right'),
   simple: resolveSimple, 'accept-left': () => save(conflict.ours), 'accept-right': () => save(conflict.theirs), cancel,
   apply: async () => {
    const conflicts = m.chunks.filter((c, i) => c.kind === 'conflict' && !resolved(i)).length;
    const changes = m.chunks.filter((c, i) => c.kind !== 'conflict' && !resolved(i)).length;
    if (conflicts || changes) {
     const what = [conflicts ? `${conflicts} ${conflicts === 1 ? tr('conflito não processado') : tr('conflitos não processados')}` : '', changes ? `${changes} ${changes === 1 ? tr('alteração não processada') : tr('alterações não processadas')}` : ''].filter(Boolean).join(' e ');
     if (!await ask(window, msg`Há ${what}. Salvar e marcar como resolvido mesmo assim?`, 'Continuar merge', 'Aplicar e marcar resolvido')) return;
    }
    await save(model.getValue());
   },
  };
  window.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.onclick = () => { q('.error').textContent = ''; void actions[b.dataset.act!](); });
  window.addEventListener('keydown', event => { if (event.key === 'F7') { event.preventDefault(); go(event.shiftKey ? -1 : 1); } });
  window.addEventListener('cancel', event => { event.preventDefault(); if (!hooks.busy()) void cancel(); });
  window.showModal(); render(); go(1);
 }

 /** Lista "Conflitos": aceitar um lado inteiro ou abrir o merge; fecha quando não restam conflitos. */
 async function conflicts() {
  if (hooks.busy() || list) return;
  const dialog = list = document.createElement('dialog'); dialog.className = 'merge-list';
  dialog.innerHTML = html('<h2>Conflitos</h2><p class="merge-context"></p><table><thead><tr><th>Nome</th><th class="ours"></th><th class="theirs"></th></tr></thead><tbody></tbody></table><p class="error" role="alert"></p><div><button data-act="ours">Aceitar a minha</button> <button data-act="theirs">Aceitar a deles</button> <button data-act="merge" class="primary">Mesclar…</button> <button data-act="close">Fechar</button></div>');
  const q = <T extends HTMLElement>(s: string) => dialog.querySelector<T>(s)!;
  let selected: string | undefined;
  const finish = () => { dialog.close(); dialog.remove(); list = undefined; };
  async function load() {
   const state = await api.gitStatus(); const files = state.changes.filter(conflicted);
   if (!files.length) { finish(); hooks.feedback(tr('Todos os conflitos foram resolvidos. Conclua com um commit.')); return false; }
   if (!files.some(f => f.path === selected)) selected = files[0].path;
   try {
    const info = await api.gitConflict(files[0].path);
    q('.merge-context').textContent = info.operation === 'merge' ? `Mesclando branch ${info.theirsLabel} em ${info.oursLabel}` : `${info.operation}: ${info.theirsLabel} sobre ${info.oursLabel}`;
    q('.ours').textContent = `Minha (${info.oursLabel})`; q('.theirs').textContent = `Deles (${info.theirsLabel})`;
   } catch { q('.merge-context').textContent = tr('Operação Git em andamento'); q('.ours').textContent = tr('Minha'); q('.theirs').textContent = tr('Deles'); }
   const body = q('tbody'); body.replaceChildren();
   for (const f of files) {
    const row = document.createElement('tr'); row.tabIndex = 0; row.dataset.path = f.path; row.setAttribute('aria-selected', String(f.path === selected));
    for (const text of [f.path, sideState(f.index), sideState(f.worktree)]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
    row.onclick = () => { selected = f.path; body.querySelectorAll('tr').forEach(r => r.setAttribute('aria-selected', String(r === row))); };
    row.ondblclick = () => void act('merge');
    body.append(row);
   }
   return true;
  }
  async function act(kind: string) {
   q('.error').textContent = '';
   if (kind === 'close') { finish(); return; }
   if (!selected || hooks.busy()) return;
   try {
    if (kind === 'merge') { dialog.close(); await merge(selected); if (await load()) dialog.showModal(); return; }
    if (hooks.hasUnsaved()) { q('.error').textContent = tr('Salve os buffers abertos antes de resolver.'); return; }
    // Lado inteiro via backend: funciona também para exclusão e arquivos binários.
    const token = (await api.gitStatus()).indexToken;
    hooks.setBusy(true);
    try { await api.gitResolveSide(selected, kind === 'ours' ? 'ours' : 'theirs', token); } finally { hooks.setBusy(false); }
    await hooks.changed(); await load();
   } catch (error) { if (!dialog.open && list) dialog.showModal(); q('.error').textContent = String(error); }
  }
  dialog.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.onclick = () => void act(b.dataset.act!));
  dialog.addEventListener('cancel', () => finish());
  document.body.append(dialog);
  if (await load()) dialog.showModal();
 }

 return { merge, conflicts };
}
