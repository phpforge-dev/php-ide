import { t as tr, msg, html } from './i18n';
import * as monaco from 'monaco-editor';
import type { AgentChange, AgentEvent, AgentInfo, IdeApi } from '../shared/contracts';

type Hooks = {
 /** Arquivo ativo (somente arquivos reais) e seleção, para o contexto da IDE. */
 context(): { path: string; text: string; selection?: string } | undefined;
 /** Recarrega buffers abertos sem alterações após gravar mudanças do agente. */
 reload(paths: string[]): Promise<void>;
 status(message: string): void;
 language(path: string): string | undefined;
};
const statusLabel: Record<string, string> = { pending: 'pendente', in_progress: 'em andamento', completed: tr('concluído'), failed: 'falhou' };

/** Painel do agente: sessão ACP/Codex, transcrição, permissões e alterações pendentes com revisão. */
export function mountAgent(api: IdeApi, root: HTMLElement, hooks: Hooks) {
 root.innerHTML = html`<div class="agent-head"><label class="agent-field">Agente<select id="agent-select"></select></label><button id="agent-start">Iniciar</button><label class="agent-field" id="agent-mode-label" hidden>Modo<select id="agent-mode"></select></label><button id="agent-new" title="Nova conversa" disabled>Nova conversa</button></div>
<p id="agent-detail" class="agent-detail"></p>
<div class="agent-welcome"><span class="agent-emblem">✧</span><h2>Vamos construir?</h2><p>Conecte um agente para entender o projeto, explorar código e propor alterações.</p><div class="agent-examples"><button type="button" data-prompt="Explique a arquitetura deste projeto">Explorar o projeto ↗</button><button type="button" data-prompt="Revise o arquivo ativo e sugira melhorias">Revisar código ↗</button></div><small>Você revisa as alterações antes de gravá-las.</small></div>
<div id="agent-transcript" role="log" aria-live="polite" aria-label="Conversa com o agente"></div>
<section id="agent-changes" hidden><div class="agent-changes-head"><strong>Alterações pendentes (<span id="agent-change-count">0</span>)</strong><button id="agent-keep-all">Manter tudo</button><button id="agent-discard-all">Descartar tudo</button></div><ul id="agent-change-list"></ul></section>
<div class="agent-input"><textarea id="agent-prompt" placeholder="Descreva a tarefa (Enter envia, Shift+Enter quebra linha)" disabled></textarea>
<div class="agent-actions"><label><input type="checkbox" id="agent-context"> Contexto da IDE</label><button id="agent-cancel" disabled>Interromper</button><button id="agent-send" class="primary" disabled>Enviar</button></div></div>`;
 const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
 const transcript = $('agent-transcript');
 let agents: AgentInfo[] = []; let started = false; let running = false;
 let message: HTMLElement | undefined; let thought: HTMLElement | undefined;
 const tools = new Map<string, HTMLElement>();
 let changes: AgentChange[] = [];

 const block = (cls: string, text = '') => { const el = document.createElement('div'); el.className = `agent-block ${cls}`; el.textContent = text; transcript.append(el); transcript.scrollTop = transcript.scrollHeight; return el; };
 function busy(value: boolean) {
  running = value; $<HTMLButtonElement>('agent-send').disabled = value || !started; $<HTMLButtonElement>('agent-cancel').disabled = !value;
  $<HTMLTextAreaElement>('agent-prompt').disabled = !started;
 }
 async function load() {
  agents = await api.agents();
  const select = $<HTMLSelectElement>('agent-select');
  select.replaceChildren(...agents.map(a => new Option(a.available ? a.name : msg`${a.name} (indisponível)`, a.id)));
  const first = agents.find(a => a.available); if (first) select.value = first.id;
  detail();
 }
 function detail() { const a = agents.find(a => a.id === $<HTMLSelectElement>('agent-select').value); $('agent-detail').textContent = a?.detail ?? ''; $<HTMLButtonElement>('agent-start').disabled = !a?.available; }
 $<HTMLSelectElement>('agent-select').onchange = () => { started = false; busy(false); detail(); };
 async function start() {
  const id = $<HTMLSelectElement>('agent-select').value; $('agent-detail').textContent = tr('Iniciando agente…');
  $<HTMLButtonElement>('agent-start').disabled = true;
  try { await api.agentStart(id); } catch (error) { detail(); $('agent-detail').textContent = String((error as Error).message ?? error); }
  finally { $<HTMLButtonElement>('agent-start').disabled = false; }
 }
 $('agent-start').onclick = () => void start();
 $('agent-new').onclick = async () => {
  if (changes.length && !confirm(tr('Descartar as alterações pendentes e iniciar nova conversa?'))) return;
  transcript.replaceChildren(); root.querySelector<HTMLElement>('.agent-welcome')!.hidden = false; tools.clear(); message = thought = undefined;
  try { await api.agentReset(); } catch (error) { hooks.status(String(error)); }
 };
 $<HTMLSelectElement>('agent-mode').onchange = event => void api.agentMode((event.target as HTMLSelectElement).value).catch(error => hooks.status(String(error)));
 async function send() {
  const prompt = $<HTMLTextAreaElement>('agent-prompt'); const text = prompt.value.trim();
  if (!text || running || !started) return;
  const context = $<HTMLInputElement>('agent-context').checked ? hooks.context() : undefined;
  root.querySelector<HTMLElement>('.agent-welcome')!.hidden = true;
  block('agent-user', text); if (context) block('agent-note', `Contexto: ${context.path}${context.selection ? tr(' (com seleção)') : ''}`);
  message = thought = undefined; prompt.value = ''; busy(true);
  try { await api.agentPrompt(text, context); } catch (error) { block('agent-error', String((error as Error).message ?? error)); busy(false); }
 }
 root.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach(button => { button.onclick = () => { const prompt = $<HTMLTextAreaElement>('agent-prompt'); if (!started) { $('agent-detail').textContent = tr('Selecione um agente disponível e clique em Iniciar.'); return; } prompt.value = button.dataset.prompt!; prompt.focus(); }; });
 $('agent-send').onclick = () => void send();
 $('agent-prompt').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); } });
 $('agent-cancel').onclick = () => void api.agentCancel().catch(error => hooks.status(String(error)));

 function diff(change: AgentChange) {
  const dialog = document.createElement('dialog'); dialog.className = 'agent-diff';
  dialog.innerHTML = html('<header><strong></strong><span>Antes · Depois do agente</span><button class="close">Fechar</button></header><div class="agent-diff-editor"></div>');
  dialog.querySelector('strong')!.textContent = change.path;
  document.body.append(dialog); dialog.showModal();
  const language = hooks.language(change.path);
  const original = monaco.editor.createModel(change.before ?? '', language); const modified = monaco.editor.createModel(change.after, language);
  const editor = monaco.editor.createDiffEditor(dialog.querySelector<HTMLElement>('.agent-diff-editor')!, { readOnly: true, automaticLayout: true, renderSideBySide: true, minimap: { enabled: false } });
  editor.setModel({ original, modified });
  const close = () => { editor.dispose(); original.dispose(); modified.dispose(); dialog.close(); dialog.remove(); };
  dialog.querySelector<HTMLButtonElement>('.close')!.onclick = close; dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
 }
 async function keep(paths?: string[]) {
  const target = paths ?? changes.map(c => c.path);
  try { await api.agentKeep(paths); await hooks.reload(target); hooks.status(msg`${target.length} arquivo(s) gravado(s) pelo agente.`); }
  catch (error) { hooks.status(String((error as Error).message ?? error)); block('agent-error', String((error as Error).message ?? error)); }
 }
 $('agent-keep-all').onclick = () => void keep();
 $('agent-discard-all').onclick = () => void api.agentDiscard();
 function renderChanges() {
  $('agent-changes').hidden = !changes.length; $('agent-change-count').textContent = String(changes.length);
  $('agent-change-list').replaceChildren(...changes.map(change => {
   const item = document.createElement('li'); item.dataset.path = change.path;
   const before = change.before === null ? [] : change.before.split('\n'); const after = change.after.split('\n');
   const name = document.createElement('button'); name.className = 'agent-change-file'; name.textContent = `${change.before === null ? tr('A') : tr('M')}  ${change.path}`; name.title = `Ver diff (${before.length} → ${after.length} linhas)`; name.onclick = () => diff(change);
   const keepOne = document.createElement('button'); keepOne.textContent = tr('Manter'); keepOne.onclick = () => void keep([change.path]);
   const discardOne = document.createElement('button'); discardOne.textContent = tr('Descartar'); discardOne.onclick = () => void api.agentDiscard([change.path]);
   item.append(name, keepOne, discardOne); return item;
  }));
 }

 function handle(event: AgentEvent) {
  switch (event.type) {
   case 'session': {
    started = true; busy(false); $<HTMLButtonElement>('agent-new').disabled = false;
    const name = agents.find(a => a.id === event.agent)?.name ?? event.agent;
    $('agent-detail').textContent = `${name} conectado${event.protocol ? ` · ACP v${event.protocol}` : ''}`;
    const mode = $<HTMLSelectElement>('agent-mode'); mode.replaceChildren(...event.modes.map(m => new Option(m.name, m.id, false, m.id === event.mode)));
    $('agent-mode-label').hidden = event.modes.length < 2;
    break;
   }
   case 'message': thought = undefined; (message ??= block('agent-message')).textContent += event.text; transcript.scrollTop = transcript.scrollHeight; break;
   case 'thought': {
    if (!thought) { const details = document.createElement('details'); details.className = 'agent-block agent-thought'; details.innerHTML = html('<summary>Raciocínio</summary><div></div>'); transcript.append(details); thought = details.querySelector('div')!; }
    thought.textContent += event.text; break;
   }
   case 'tool': {
    message = undefined;
    let row = tools.get(event.id);
    if (!row) { row = block('agent-tool'); row.dataset.id = event.id; tools.set(event.id, row); }
    if (event.title) row.dataset.title = event.title; if (event.kind) row.dataset.kind = event.kind; if (event.status) row.dataset.status = event.status;
    row.textContent = `${row.dataset.title ?? tr('Ferramenta')} · ${statusLabel[row.dataset.status ?? 'pending'] ?? row.dataset.status}`;
    break;
   }
   case 'plan': {
    message = undefined;
    // Atualizações seguidas do plano substituem o bloco anterior em vez de repeti-lo.
    const last = transcript.lastElementChild as HTMLElement | null;
    const plan = last?.classList.contains('agent-plan') ? last : block('agent-plan');
    plan.replaceChildren(...event.entries.map(e => { const li = document.createElement('div'); li.dataset.status = e.status; li.textContent = `${e.status === 'completed' ? '✓' : e.status === tr('in_progress') ? '▸' : '○'} ${e.content}`; return li; }));
    break;
   }
   case 'mode': $<HTMLSelectElement>('agent-mode').value = event.current; break;
   case 'permission': {
    message = undefined;
    const box = block('agent-permission'); const title = document.createElement('p'); title.textContent = `Permitir: ${event.title}?`; box.replaceChildren(title);
    for (const option of event.options) {
     const button = document.createElement('button'); button.textContent = option.name; button.dataset.kind = option.kind;
     button.onclick = () => { box.querySelectorAll('button').forEach(b => b.disabled = true); title.textContent = `${event.title} — ${option.name}`; void api.agentPermission(event.id, option.id).catch(error => hooks.status(String(error))); };
     box.append(button);
    }
    break;
   }
   case 'changes': changes = event.changes; renderChanges(); break;
   case 'done':
    message = thought = undefined; busy(false);
    if (event.error) block('agent-error', event.error);
    else if (event.stopReason === 'cancelled') block('agent-note', 'Interrompido.');
    hooks.status(event.error ? tr('Falha no agente') : tr('Resposta concluída'));
    break;
  }
 }
 void load().catch(error => { $('agent-detail').textContent = String(error); });
 return { handle, reset() { transcript.replaceChildren(); root.querySelector<HTMLElement>('.agent-welcome')!.hidden = false; tools.clear(); changes = []; renderChanges(); started = false; busy(false); void load(); } };
}
