import { t as tr, msg, html } from './i18n';
import type { IdeApi, TestRunOutput } from '../shared/contracts';
import { discoverTests, locate, parseJunit, summarize, type TestCase, type TestResult } from '../shared/language/php-tests';
import type { TestRunRequest } from '../shared/language/plugins/php-tests';

type Host = { open(path: string, line: number): Promise<void>; status(text: string): void };
const icons = { passed: '✓', failed: '✗', error: '!', skipped: '○' } as const;
const labels = { passed: 'passou', failed: 'falhou', error: tr('erro'), skipped: 'ignorado' } as const;
/** Painel Run de testes: executa um pedido do CodeLens, mostra resultados, saída bruta, rerun e interrupção. */
export function mountTests(api: IdeApi, host: Host) {
 const panel = document.createElement('section'); panel.id = 'test-panel'; panel.hidden = true;
 panel.innerHTML = html('<div class="test-toolbar"><strong>Testes</strong><span id="test-title"></span><button id="test-rerun" disabled title="Executar novamente">↻ Executar novamente</button><button id="test-stop" disabled>■ Interromper</button><label><input type="checkbox" id="test-failures"> Só falhas</label><button id="test-view-output" aria-pressed="false">Saída</button><button id="test-hide" aria-label="Ocultar testes">−</button></div><p id="test-summary" role="status" aria-live="polite">Use ▶ acima de um teste para executá-lo.</p><div class="test-layout"><div id="test-list" role="list"></div><div id="test-detail"><pre id="test-message"></pre><pre id="test-output" hidden></pre></div></div>');
 document.querySelector('.code')!.append(panel);
 const button = document.createElement('button'); button.id = 'show-tests'; button.title = tr('Testes'); // atalho: keymap central (tool.tests), título atualizado pelo workbench button.setAttribute('aria-label', tr('Testes'));
 button.innerHTML = html('<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 5v14l11-7Z"/></svg>');
 document.querySelector('.left-rail')!.append(button);
 const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
 let last: TestRunRequest | undefined; let running: string | undefined; let results: (TestResult & { at?: number })[] = []; let selected = -1; let epoch = 0;
 const summary = (text: string, state = '') => { el('test-summary').textContent = text; el('test-summary').dataset.state = state; };
 function controls() { el<HTMLButtonElement>('test-rerun').disabled = !last || !!running; el<HTMLButtonElement>('test-stop').disabled = !running; }
 function output(show: boolean) { el('test-output').hidden = !show; el('test-message').hidden = show; el('test-view-output').setAttribute('aria-pressed', String(show)); }
 function detail(index: number) {
  selected = index; const r = results[index];
  el('test-list').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.index) === index)));
  output(false);
  el('test-message').textContent = r ? [r.name, r.message ?? labels[r.status], r.file ? `${r.file}:${r.failureLine ?? r.at ?? 1}` : ''].filter(Boolean).join('\n\n') : '';
 }
 function render() {
  const only = el<HTMLInputElement>('test-failures').checked;
  el('test-list').replaceChildren(...results.map((r, index) => ({ r, index })).filter(({ r }) => !only || r.status === 'failed' || r.status === 'error').map(({ r, index }) => {
   const b = document.createElement('button'); b.type = 'button'; b.dataset.index = String(index); b.dataset.status = r.status; b.setAttribute('role', 'listitem'); b.setAttribute('aria-selected', String(index === selected));
   b.title = r.file ? `${r.file}:${r.failureLine ?? r.at ?? 1} · duplo clique abre a linha` : r.name;
   const icon = document.createElement('span'); icon.className = 'test-icon'; icon.textContent = icons[r.status]; icon.setAttribute('aria-label', labels[r.status]);
   const name = document.createElement('span'); name.textContent = r.name;
   const time = document.createElement('small'); time.textContent = `${Math.round(r.time * 1000)} ms`;
   b.append(icon, name, time);
   b.onclick = () => detail(index); b.ondblclick = () => go(index);
   b.onkeydown = e => { if (e.key === 'Enter') go(index); };
   return b;
  }));
 }
 function go(index: number) {
  const r = results[index]; if (!r?.file) return;
  void host.open(r.file, (r.failureLine ?? r.at ?? 1) - 1).catch(error => summary(msg`Não foi possível abrir ${r.file}: ${String(error)}`, 'error'));
 }
 async function finish(request: TestRunRequest, out: TestRunOutput) {
  el('test-output').textContent = `$ ${out.command}\n\n${out.output.trim() || tr('(sem saída)')}${out.exitCode === null ? '' : `\n\n[Processo encerrado: ${out.exitCode}]`}`;
  const root = (await api.workspace()).root;
  results = out.junit ? parseJunit(out.junit, root) : [];
  // Pest não grava a linha no JUnit: ela vem da descoberta no arquivo do teste.
  const discovered = new Map<string, TestCase[]>();
  for (const r of results) {
   if (!r.file) continue;
   if (!discovered.has(r.file)) discovered.set(r.file, await api.read(r.file).then(f => discoverTests(f.path, f.text)).catch(() => []));
   r.at = locate(r, discovered.get(r.file)!);
  }
  const s = summarize(results); const seconds = (out.durationMs / 1000).toFixed(2);
  render();
  const firstProblem = results.findIndex(r => r.status === 'failed' || r.status === 'error');
  if (out.cancelled) summary(msg`Execução interrompida após ${seconds}s.${results.length ? ` ${results.length} resultado(s) parciais.` : ''}`, 'error');
  else if (out.timedOut) summary(`Tempo limite de 10 minutos atingido; o processo foi encerrado.`, 'error');
  else if (!results.length) { summary(msg`O runner terminou com código ${out.exitCode ?? '—'} sem resultados de teste. Veja a saída.`, 'error'); output(true); return; }
  else {
   const parts = [`${s.passed} passaram`, s.failed && `${s.failed} falharam`, s.errors && msg`${s.errors} com erro`, s.skipped && `${s.skipped} ignorados`].filter(Boolean).join(' · ');
   const exit = out.exitCode !== 0 && !s.failed && !s.errors ? msg` · código de saída ${out.exitCode} (veja a saída)` : '';
   summary(`${request.label}: ${parts} · ${s.total} teste(s) em ${seconds}s${exit}`, s.failed || s.errors ? 'failed' : 'passed');
  }
  host.status(el('test-summary').textContent!);
  detail(firstProblem >= 0 ? firstProblem : 0);
 }
 async function run(request: TestRunRequest) {
  show();
  if (running) { summary(tr('Já há testes em execução. Interrompa-os antes de iniciar outra execução.'), 'error'); return; }
  last = request; const id = crypto.randomUUID(); const token = ++epoch; running = id; results = []; selected = -1; render(); controls();
  el('test-title').textContent = `${request.framework === 'pest' ? tr('Pest') : tr('PHPUnit')} · ${request.label}`;
  el('test-message').textContent = ''; el('test-output').textContent = ''; output(false);
  summary(`Executando ${request.label}…`, 'running');
  try { const out = await api.testRun(id, request.framework, request.path, request.filter); if (token === epoch) await finish(request, out); }
  catch (error) { if (token === epoch) { summary(msg`${String((error as Error)?.message ?? error)} · Corrija e use “Executar novamente”.`, 'error'); host.status(tr('Falha ao executar testes')); } }
  finally { if (token === epoch) { running = undefined; controls(); } }
 }
 function show() { panel.hidden = false; button.setAttribute('aria-pressed', 'true'); }
 function hide() { panel.hidden = true; button.setAttribute('aria-pressed', 'false'); }
 button.onclick = () => panel.hidden ? show() : hide(); el('test-hide').onclick = hide;
 el('test-rerun').onclick = () => { if (last) void run(last); };
 el('test-stop').onclick = () => { if (running) void api.testCancel(running).catch(error => summary(String(error), 'error')); };
 el('test-failures').onchange = render;
 el('test-view-output').onclick = () => output(el('test-output').hidden !== false);
 return {
  run,
  reset() { const id = running; epoch++; running = undefined; last = undefined; results = []; selected = -1; if (id) void api.testCancel(id).catch(() => {}); render(); controls(); el('test-title').textContent = ''; el('test-message').textContent = ''; el('test-output').textContent = ''; summary(tr('Use ▶ acima de um teste para executá-lo.')); hide(); },
 };
}
