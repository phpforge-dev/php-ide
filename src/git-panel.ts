import { t as tr, msg, html } from './i18n';
import { mountGitAccount } from './git-account';
import * as monaco from 'monaco-editor';
import { gitLogView } from './git-log-view';
import { fileIcon } from './file-icons';
import { gitTools } from './git-tools';
import type { GitDiff, GitState, IdeApi } from '../shared/contracts';

export function mountGit(api: IdeApi, hasUnsaved: () => boolean, reloadWorkspace: () => Promise<void>) {
  const sidebar = document.querySelector('main > aside')!;
  const tools = document.createElement('div');
  tools.className = 'switch';
  tools.innerHTML = html('<button id="show-project">Projeto</button><button id="show-commit">Commit</button><button id="show-git">Git</button>');
  sidebar.prepend(tools);
  const panel = document.createElement('section');
  panel.id = 'git-panel'; panel.hidden = true;
  panel.innerHTML = html`<div class="git-heading"><strong id="git-branch">Git</strong><button id="git-refresh" title="Atualizar alterações">↻</button></div>
    <button id="git-tools">Branches e operações…</button><button id="git-account">Conta deste repositório…</button><input id="git-file-filter" type="search" placeholder="Buscar arquivos alterados…" aria-label="Buscar arquivos alterados…">
    <div class="switch"><button id="git-changes-tab">Alterações</button><button id="git-log-tab">Histórico</button></div>
    <div id="git-feedback" role="status" aria-live="polite"></div>
    <div id="git-changes"></div>
    <div id="git-commit-form"><label>Mensagem do commit<textarea id="git-message" placeholder="Descreva a mudança"></textarea></label><button id="git-review-commit" disabled>Revisar commit…</button></div>
    `;
  sidebar.append(panel);
  const review = document.createElement('section');
  review.id = 'git-review'; review.hidden = true;
  review.innerHTML = html('<div class="git-diff-toolbar"><strong id="git-file"></strong><button id="git-hunks">Selecionar trechos…</button><button id="git-stage">Preparar arquivo</button><button id="git-close-diff">Voltar ao editor</button></div><div id="git-sides"></div><div id="git-diff"></div>');
  document.querySelector('.code')!.append(review);
  const dialog = document.createElement('dialog');
  dialog.innerHTML = html('<h2>Conferir commit local</h2><p>Será gravada a versão preparada de todos os arquivos abaixo. Mudanças somente no disco ficam de fora.</p><ul id="git-commit-files"></ul><pre id="git-commit-message"></pre><p id="git-commit-error" role="alert"></p><button id="git-cancel-commit">Voltar à revisão</button> <button id="git-confirm-commit">Criar commit local</button>');
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const diff = monaco.editor.createDiffEditor(el('git-diff'), { automaticLayout: true, readOnly: true, originalEditable: false, renderSideBySide: true, renderSideBySideInlineBreakpoint: 600, minimap: { enabled: false }, scrollBeyondLastLine: false });
  let models: monaco.editor.ITextModel[] = [];
  let state: GitState | undefined;
  let selected: { value: GitDiff; staged: boolean } | undefined;
  let busy = false;
  let loading = false;
  let generation = 0;
  let selectionRequest = 0;
  
  let lastState = '';
  const feedback = (message: string) => { el('git-feedback').textContent = message; };
  const conflictStatus = (code: string) => ['DD','AU','UD','UA','DU','AA','UU'].includes(code);
  const staged = () => state?.changes.filter(c => c.index !== ' ' && c.index !== '?' && !conflictStatus(c.index + c.worktree)) ?? [];
  const operations = gitTools(api, { hasUnsaved, busy: () => busy, setBusy(value) { busy = value; el<HTMLButtonElement>('open').disabled = value; commitEnabled(); if (!value) {void refresh(true);history.refresh();} }, async changed() { closeDiff(); try { await reloadWorkspace(); } catch(error) { feedback(String(error)); } }, feedback });
  const account=mountGitAccount(api,()=>busy,value=>{busy=value;el<HTMLButtonElement>('open').disabled=value;commitEnabled();});
  el('git-account').onclick=()=>{void account.open();};
  el('git-tools').onclick = () => { void operations.branches(); };
  document.addEventListener('ide-git-branches',()=>{void operations.branches();});
  function commitEnabled() { el<HTMLButtonElement>('git-review-commit').disabled = busy || !!state?.changes.some(c => conflictStatus(c.index + c.worktree)) || (!staged().length && !state?.mergeHead) || !el<HTMLTextAreaElement>('git-message').value.trim(); }
  function closeDiff() {
    selectionRequest++; selected = undefined; diff.setModel(null); models.forEach(m => m.dispose()); models = [];
    review.hidden = true;
    for (const id of ['tabs', 'breadcrumbs', 'navigation', 'editor']) el(id).hidden = false;
  }
  async function showDiff(path: string, prepared: boolean, revision?: string) {
    const request = ++selectionRequest;
    feedback(tr('Carregando comparação…'));
    el<HTMLButtonElement>('git-stage').disabled = true;
    try {
      const value = revision ? await api.gitHistoryDiff(revision, path) : await api.gitDiff(path, prepared);
      if (request !== selectionRequest) return;
      diff.setModel(null); models.forEach(m => m.dispose());
      const language = path.endsWith('.php') ? 'php' : undefined;
      models = [monaco.editor.createModel(value.before, language), monaco.editor.createModel(value.after, language)];
      diff.setModel({ original: models[0], modified: models[1] });
      selected = revision ? undefined : { value, staged: prepared };
      el('git-stage').hidden = !!revision; el('git-hunks').hidden = !!revision;
      for (const row of panel.querySelectorAll<HTMLButtonElement>('.git-file-row')) row.classList.toggle('selected', row.dataset.path === path && row.dataset.staged === String(prepared));
      el('git-file').textContent = path;
      el('git-sides').textContent = `${value.beforeLabel}   →   ${value.afterLabel}`;
      el('git-stage').textContent = prepared ? tr('Retirar do commit') : tr('Preparar arquivo inteiro');
      el<HTMLButtonElement>('git-stage').disabled = busy;
      for (const id of ['tabs', 'breadcrumbs', 'navigation', 'editor']) el(id).hidden = true;
      review.hidden = false; diff.layout();
      feedback(revision ? tr('Comparação histórica somente leitura; merges são comparados com o primeiro pai.') : hasUnsaved() ? tr('Há buffers não salvos. O Git compara somente o conteúdo do disco.') : tr('Revise o diff antes de preparar ou retirar o arquivo.'));
    } catch (error) { if (request === selectionRequest) { closeDiff(); feedback(String(error)); } }
  }
  function render() {
    const list = el('git-changes'); list.replaceChildren();
    const groups = [
      ['Conflitos · clique para resolver', false, state!.changes.filter(c => conflictStatus(c.index + c.worktree))],
      ['Preparados para commit', true, staged()],
      [tr('Alterações no disco'), false, state!.changes.filter(c => c.worktree !== ' ' && c.index !== '?' && !conflictStatus(c.index + c.worktree))],
      [tr('Não rastreados'), false, state!.changes.filter(c => c.index === '?')],
    ] as const;
    for (const [label, prepared, changes] of groups) {
      if(!changes.length)continue;const group=document.createElement('details');group.open=true;const heading=document.createElement('summary');heading.textContent=`${tr(label)} (${changes.length})`;group.append(heading);list.append(group);
      if (label.startsWith('Conflitos') && changes.length) {
        // Mesmas ações da notificação do PhpStorm durante um merge com conflitos.
        const actions = document.createElement('div'); actions.className = 'git-conflict-actions';
        const all = document.createElement('button'); all.textContent = tr('Resolver conflitos…'); all.onclick = () => void operations.conflicts();
        actions.append(all);
        // Abortar conforme a operação em andamento (merge, rebase, cherry-pick ou revert).
        const current = state!.operation ?? (state!.mergeHead ? 'merge' : null);
        const abortKind = ({ merge: 'merge-abort', rebase: 'rebase-abort', 'cherry-pick': 'cherry-pick-abort', revert: 'revert-abort' } as const)[current as 'merge'];
        if (abortKind) { const abort = document.createElement('button'); abort.textContent = tr({ 'merge-abort': 'Abortar merge', 'rebase-abort': 'Abortar rebase', 'cherry-pick-abort': 'Abortar cherry-pick', 'revert-abort': 'Abortar revert' }[abortKind]); abort.onclick = () => void operations.open(abortKind); actions.append(abort); }
        list.append(actions);
      }
      for (const change of changes.filter(c=>c.path.toLowerCase().includes(el<HTMLInputElement>('git-file-filter').value.toLowerCase()))) {
        const button = document.createElement('button');
        button.className = 'git-file-row'; button.dataset.path = change.path; button.dataset.staged = String(prepared);
        button.textContent = change.path; button.prepend(fileIcon(change.path));const badge=document.createElement('small');badge.className='git-change-status';badge.textContent=prepared?change.index:change.worktree;button.append(badge);
        button.title = change.originalPath ? `${change.originalPath} → ${change.path}` : change.path;
        button.onclick = () => { void (conflictStatus(change.index + change.worktree) ? operations.resolve(change.path) : showDiff(change.path, prepared)); }; group.append(button);
      }
    }
    if (!state!.changes.length) { const p = document.createElement('p'); p.textContent = state!.mergeHead ? tr('Conteúdo sem alterações. Conclua o merge com um commit.') : tr('Nenhuma alteração. Diretório de trabalho limpo.'); list.append(p); }
    commitEnabled();
  }
  async function refresh(force = false) {
    if (loading || busy) return;
    loading = true; const version = generation;
    try {
      const result = await api.gitStatus();
      if (version !== generation) return;
      state = result; el('git-branch').textContent = `⑂ ${state.branch}${state.mergeHead ? tr(' · merge em andamento') : ''}`;
      const serialized = JSON.stringify(state);
      if (force || serialized !== lastState) { lastState = serialized; render(); }
      if (force) feedback(hasUnsaved() ? tr('Há buffers não salvos. Git usa o conteúdo do disco.') : tr('Atualizado. Clique em um arquivo para revisar.'));
    } catch (error) {
      if (version !== generation) return;
      state = undefined; lastState = ''; el('git-branch').textContent = tr('Git indisponível'); el('git-changes').replaceChildren(); commitEnabled(); closeDiff(); feedback(String(error));
    } finally { loading = false; }
  }
  const history = gitLogView(api,{diff(path,revision){void showDiff(path,false,revision);},branches(){void operations.branches();},operation(kind,hash){void operations.open(kind,hash);},commit(){el('show-commit').click();}});
  el('show-commit').onclick = () => { panel.hidden=false;el('tree').hidden=true;sidebar.querySelector('h3')!.hidden=true;document.querySelector('main')!.classList.add('git-open');void refresh(true); };
  el('show-project').onclick = () => { panel.hidden=true;el('tree').hidden=false;sidebar.querySelector('h3')!.hidden=false;document.querySelector('main')!.classList.remove('git-open');closeDiff(); };
  el('git-refresh').onclick=()=>{void refresh(true);history.refresh();};
  el('git-changes-tab').onclick=()=>{void refresh(true);};el('git-log-tab').onclick=()=>{void history.open();};
  el('git-close-diff').onclick = closeDiff;
  el('git-hunks').onclick = async () => {
    if (!selected || busy) return;
    const current = selected;
    try {
      const data = await api.gitHunks(current.value.path, current.staged);
      if (selected !== current) return;
      const modal = document.createElement('dialog'); modal.className = 'git-hunk-dialog';
      const heading = document.createElement('h2'); heading.textContent = tr('Selecionar trechos · ') + current.value.path; modal.append(heading);
      const error = document.createElement('p'); error.setAttribute('role','alert'); modal.append(error);
      for(const hunk of data.hunks) {
        const pre = document.createElement('pre'); pre.textContent = hunk.patch;
        const button = document.createElement('button'); button.textContent = `${current.staged ? tr('Retirar') : tr('Preparar')} trecho ${hunk.id + 1}`;
        button.onclick = async () => {
          if(busy) return; busy = true; el<HTMLButtonElement>('open').disabled = true; modal.querySelectorAll('button').forEach(b=>b.disabled=true);
          try { await api.gitApplyHunk(current.value.path, current.staged, data.token, hunk.id); modal.close(); closeDiff(); feedback(tr('Trecho aplicado ao index. O arquivo no disco foi preservado.')); }
          catch(e) { error.textContent=String(e); }
          finally { busy=false; el<HTMLButtonElement>('open').disabled=false; modal.querySelectorAll('button').forEach(b=>b.disabled=false); await refresh(); }
        };
        modal.append(pre,button);
      }
      const cancel = document.createElement('button'); cancel.textContent=tr('Fechar trechos'); cancel.onclick=()=>modal.close(); modal.append(cancel);
      modal.addEventListener('cancel',e=>{if(busy)e.preventDefault();}); modal.onclose=()=>modal.remove(); document.body.append(modal); modal.showModal();
    } catch(error) { feedback(String(error)); }
  };
  el('git-file-filter').oninput=()=>{if(state)render();};
  el('git-message').oninput = commitEnabled;
  el('git-stage').onclick = async () => {
    if (!selected || busy) return;
    const current = selected; busy = true; el<HTMLButtonElement>('git-stage').disabled = true; commitEnabled();
    el<HTMLButtonElement>('open').disabled = true;
    let message: string;
    try { await api.gitStage(current.value.path, current.staged, current.value.token); message = current.staged ? tr('Arquivo retirado do commit; conteúdo no disco preservado.') : tr('Arquivo preparado para commit.'); closeDiff(); }
    catch (error) { message = String(error); }
    finally { busy = false; el<HTMLButtonElement>('open').disabled = false; }
    await refresh(); feedback(message!); if (selected) el<HTMLButtonElement>('git-stage').disabled = false;
  };
  el('git-review-commit').onclick = () => {
    if (!state || busy) return;
    const files = staged(); if (!files.length && !state.mergeHead) return;
    el('git-commit-files').replaceChildren(...files.map(file => { const li = document.createElement('li'); li.textContent = `${file.index} ${file.path}`; return li; }));
    if(state.mergeHead) { const li = document.createElement('li'); li.textContent = tr('Finalizar merge com ') + state.mergeHead.slice(0,8); el('git-commit-files').append(li); }
    el('git-commit-message').textContent = el<HTMLTextAreaElement>('git-message').value;
    el('git-commit-error').textContent = ''; dialog.dataset.token = state.indexToken; dialog.showModal();
  };
  el('git-cancel-commit').onclick = () => dialog.close();
  el('git-confirm-commit').onclick = async () => {
    if (busy) return;
    busy = true; el<HTMLButtonElement>('git-confirm-commit').disabled = true;
    el<HTMLButtonElement>('open').disabled = true;
    el<HTMLButtonElement>('git-cancel-commit').disabled = true;
    try {
      const hash = await api.gitCommit(el('git-commit-message').textContent!, dialog.dataset.token!);
      dialog.close(); el<HTMLTextAreaElement>('git-message').value = ''; closeDiff(); feedback(msg`Commit criado: ${hash.slice(0, 8)}. Nenhum push foi realizado.`);
    } catch (error) { el('git-commit-error').textContent = String(error); }
    finally { busy = false; el<HTMLButtonElement>('open').disabled = false; el<HTMLButtonElement>('git-confirm-commit').disabled = false; el<HTMLButtonElement>('git-cancel-commit').disabled = false; await refresh(); history.refresh(); }
  };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  // Poll only while visible; keep a reviewed diff stable until explicitly reopened.
  window.setInterval(() => { if (!panel.hidden && !dialog.open && document.hasFocus()) void refresh(); }, 3000);
  window.addEventListener('focus', () => { if (!panel.hidden) void refresh(); });
  return { reset() { account.close(); operations.close(); generation++; selectionRequest++; state = undefined; lastState = ''; dialog.close(); closeDiff(); el<HTMLTextAreaElement>('git-message').value = ''; history.reset(); el('git-changes').replaceChildren(); if (!panel.hidden) void refresh(true); } };
}
