import { t as tr, msg, html } from './i18n';
import type { GitOperation, GitTools, IdeApi } from '../shared/contracts';
import { gitBranches } from './git-branches';
import { mergeTools } from './merge-editor';

type Hooks = { hasUnsaved(): boolean; busy(): boolean; setBusy(value: boolean): void; changed(): Promise<void>; feedback(message: string): void };
const labels: Partial<Record<GitOperation['kind'], string>> = {
  'create-branch': tr('Criar e trocar para branch'), switch: 'Trocar de branch', 'delete-branch': tr('Excluir branch já integrada'),
  merge: 'Integrar branch (merge)', rebase: 'Reaplicar commits sobre branch (rebase)', 'cherry-pick': 'Aplicar commit (cherry-pick)', revert: tr('Reverter commit com novo commit'),
  fetch: tr('Buscar atualizações (fetch)'), pull: tr('Atualizar branch (somente fast-forward)'), push: tr('Enviar branch para upstream (push)'),
  stash: tr('Guardar alterações, incluindo arquivos novos'), 'stash-apply': tr('Aplicar stash sem excluir cópia'),
  'merge-abort': 'Abortar merge', 'cherry-pick-abort': tr('Abortar cherry-pick'), 'revert-abort': tr('Abortar revert'), 'rebase-abort': 'Abortar rebase', 'rebase-continue': 'Continuar rebase',
};

export function gitTools(api: IdeApi, hooks: Hooks) {
  const dialog = document.createElement('dialog'); dialog.id = 'git-operations';
  dialog.innerHTML = html('<h2>Branches e operações</h2><p id="git-operation-context"></p><div id="git-branch-list"></div><form><label>Operação<select id="git-operation-kind"></select></label><label id="git-target-label">Destino<select id="git-operation-target"></select><input id="git-operation-text"></label><p id="git-operation-note"></p><pre id="git-operation-result" role="status"></pre><button type="button" id="git-operation-close">Fechar</button> <button type="submit" id="git-operation-run">Executar operação</button></form>');
  document.body.append(dialog);
  const find = <T extends HTMLElement>(id: string) => dialog.querySelector<T>('#' + id)!;
  const kind = find<HTMLSelectElement>('git-operation-kind');
  const select = find<HTMLSelectElement>('git-operation-target');
  const text = find<HTMLInputElement>('git-operation-text');
  const run = find<HTMLButtonElement>('git-operation-run');
  const close = find<HTMLButtonElement>('git-operation-close');
  const output = find<HTMLElement>('git-operation-result');
  for (const [value, label] of Object.entries(labels)) { const option = new Option(label, value); kind.add(option); }
  let tools: GitTools; let head: string | null = null;
  let epoch = 0;
  async function loadContext() {
    tools = await api.gitTools(); const state = await api.gitStatus(); head = state.head;
    find('git-operation-context').textContent = `Branch atual: ${state.branch} · ${head?.slice(0, 8) ?? tr('sem commits')}`;
    const list = find('git-branch-list'); list.replaceChildren();
    for (const branch of tools.branches) { const row = document.createElement('div'); row.textContent = `${branch.current ? '● ' : ''}${branch.name}${branch.remote ? tr(' (remota)') : ''}${branch.upstream ? ' → ' + branch.upstream : ''} ${branch.tracking}`; list.append(row); }
  }
  function configure() {
    const action = kind.value as GitOperation['kind'];
    select.replaceChildren(); text.value = '';
    const branch = ['switch', 'delete-branch', 'merge', 'rebase'].includes(action);
    const options = branch ? tools.branches.filter(b => !b.remote && !b.current).map(b => [b.name, b.name])
      : action === 'fetch' ? tools.remotes.map(r => [r, r])
      : action === 'stash-apply' ? tools.stashes.map(s => [s.ref, `${s.ref} · ${s.subject}`]) : [];
    options.forEach(([value, label]) => select.add(new Option(label, value)));
    select.hidden = !branch && !['fetch', 'stash-apply'].includes(action);
    text.hidden = !['create-branch', 'stash', 'cherry-pick', 'revert'].includes(action);
    find('git-target-label').hidden = select.hidden && text.hidden;
    text.placeholder = action === 'stash' ? tr('Descrição opcional do stash') : action === 'create-branch' ? tr('feature/minha-mudanca') : tr('Hash completo do commit');
    run.disabled = !select.hidden && !options.length;
    find('git-operation-note').textContent = ['push', 'pull'].includes(action)
      ? tr('Usa o upstream configurado da branch atual. Push envia commits; pull aceita apenas avanço direto. Nenhum force push.')
      : action.endsWith('-abort') ? tr('Interrompe a operação Git em andamento e restaura seu estado anterior. Ajustes feitos durante a resolução podem ser perdidos.')
      : ['rebase', 'cherry-pick', 'revert', 'merge'].includes(action) ? tr('Pode criar ou reescrever commits locais e produzir conflitos. O resultado será mostrado; conflitos ficam disponíveis na lista de alterações.')
      : tr('A operação será executada somente ao clicar abaixo. Alterações não salvas impedem operações que modificam o projeto.');
  }
  kind.onchange = configure;
  close.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (hooks.busy()) event.preventDefault(); });
  dialog.querySelector('form')!.onsubmit = async event => {
    event.preventDefault(); if (hooks.busy()) return;
    if (hooks.hasUnsaved()) { output.textContent = tr('Salve os buffers antes de executar a operação.'); return; }
    hooks.setBusy(true); run.disabled = true; close.disabled = true; kind.disabled = true; select.disabled = true; text.disabled = true;
    output.textContent = tr('Executando…');
    try {
      const result = await api.gitOperation({ kind: kind.value as GitOperation['kind'], target: text.hidden ? select.value : text.value, expectedHead: head });
      output.textContent = result;
    } catch (error) { output.textContent = String(error); }
    finally {
      // Git can modify files before returning a conflict, so reconcile on both success and failure.
      await hooks.changed(); hooks.setBusy(false); close.disabled = false; kind.disabled = false; select.disabled = false; text.disabled = false;
      try { await loadContext(); configure(); }
      catch (error) { output.textContent += '\n' + String(error); }
    }
  };
  async function open(action?: GitOperation['kind'], target = '') {
    if (hooks.busy()) return;
    const version = epoch;
    try {
      await loadContext(); if (version !== epoch) return;
      kind.value = action ?? 'switch'; configure(); if (target) text.value = target; output.textContent = ''; dialog.showModal();
    } catch (error) { hooks.feedback(String(error)); }
  }

  const branches = gitBranches(api, hooks, () => { void open(); });
  const merging = mergeTools(api, hooks);
  async function resolve(path: string) {
    if (hooks.busy()) return;
    try { await merging.merge(path); } catch (error) { hooks.feedback(String(error)); }
  }
  return { open, branches: branches.open, resolve, conflicts: () => merging.conflicts(), close: () => { epoch++; dialog.close(); branches.close(); } };
}
