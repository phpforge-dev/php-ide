// Validação comparativa C01–C06 (recorte 29): executa os roteiros do plano de compatibilidade
// na janela Tauri real, com os mesmos gestos de teclado da referência, e devolve observações
// estruturadas. Não compara nada aqui: o relatório confronta com o oracle documentado.
import * as monaco from 'monaco-editor';
import { invoke } from '@tauri-apps/api/core';

type Pos = { path: string; line: number; column: number } | null;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const raw = (method: string, args: unknown[] = []) => invoke<any>('ide', { method, args });

export async function compareP0(repetitions = 3) {
 const api = window.ide;
 const root = (await api.workspace()).root.replace(/\/$/, '');
 const ed = monaco.editor.getEditors().find(e => e.getDomNode()?.closest('#editor'))!;
 const wait = async (test: () => boolean, ms = 15000) => { const end = Date.now() + ms; while (!test()) { if (Date.now() > end) return false; await sleep(40); } return true; };
 const rel = (uri: monaco.Uri) => uri.path.startsWith(root + '/') ? uri.path.slice(root.length + 1) : uri.path;
 const pos = (): Pos => { const m = ed.getModel(); const p = ed.getSelection(); return m && p ? { path: rel(m.uri), line: p.startLineNumber, column: p.startColumn } : null; };
 const status = () => document.getElementById('status')?.textContent ?? '';
 const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
 async function shot(name: string) {
  await sleep(350);
  await raw('nativeSmokeProgress', [`shot:${name}:${window.screenX}:${window.screenY}:${window.outerWidth}:${window.outerHeight}`]);
  await sleep(1300);
 }
 /** Tecla como o usuário: keydown no elemento focado (keymap em captura, depois Monaco). */
 function key(k: string, code: string, mods: { meta?: boolean; alt?: boolean; shift?: boolean; ctrl?: boolean } = {}) {
  const target = (document.activeElement ?? document.body) as HTMLElement;
  const init = { key: k, code, metaKey: !!mods.meta, altKey: !!mods.alt, shiftKey: !!mods.shift, ctrlKey: !!mods.ctrl, bubbles: true, cancelable: true };
  // O Monaco resolve atalhos por keyCode legado; eventos sintéticos o trazem zerado.
  const keyCode = /^F\d+$/.test(code) ? 111 + Number(code.slice(1)) : /^Key[A-Z]$/.test(code) ? code.charCodeAt(3) : ({ Escape: 27, Enter: 13, BracketLeft: 219, ArrowLeft: 37 } as Record<string, number>)[code] ?? 0;
  for (const type of ['keydown', 'keyup']) { const e = new KeyboardEvent(type, init); Object.defineProperty(e, 'keyCode', { get: () => keyCode }); Object.defineProperty(e, 'which', { get: () => keyCode }); target.dispatchEvent(e); }
 }
 async function openFile(path: string) {
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i++) { const dir = parts.slice(0, i).join('/'); const d = document.querySelector<HTMLDetailsElement>(`#tree details[data-path="${dir}"]`); if (d && !d.open) d.open = true; await wait(() => !!document.querySelector(`#tree button[data-path="${path}"]`), 5000); }
  document.querySelector<HTMLButtonElement>(`#tree button[data-path="${path}"]`)!.click();
  await wait(() => ed.getModel()?.uri.path.endsWith('/' + path) === true);
  await sleep(150);
 }
 function at(line: number, column: number) { ed.focus(); ed.setPosition({ lineNumber: line, column }); ed.revealLineInCenter(line); }
 function closeAll() {
  document.querySelector('.implementations-popup')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.querySelector<HTMLButtonElement>('.usages-popup header button')?.click();
  ed.trigger('compare', 'closeReferenceSearch', {}); ed.trigger('compare', 'hideSuggestWidget', {}); ed.trigger('compare', 'editor.action.hideHover', {});
  document.querySelectorAll('.compare-transient').forEach(n => n.remove());
 }
 /** Espera o fim de uma navegação: modelo/cursor mudou, popup apareceu ou tempo esgotou. */
 async function settle(before: Pos, ms = 15000) {
  const start = Date.now();
  await wait(() => { const p = pos(); return JSON.stringify(p) !== JSON.stringify(before) || !!document.querySelector('.usages-popup .usage-result, .usages-popup .usages-results:not(:empty), .peekview-widget, .refactor-dialog, .implementations-popup'); }, ms);
  await sleep(500);
  return Date.now() - start;
 }
 const usagesPopup = () => { const p = document.querySelector('.usages-popup'); return p ? { title: text(p.querySelector('header strong')), count: text(p.querySelector('.usages-count')), rows: [...p.querySelectorAll('.usage-result')].map(r => text(r.querySelector('.usage-path')) + ' | ' + text(r.querySelector('code'))), footer: text(p.querySelector('footer')) } : null; };
 const peek = () => { const p = document.querySelector('.peekview-widget'); return p ? { title: text(p.querySelector('.peekview-title')), rows: [...p.querySelectorAll('.monaco-list-row')].map(r => r.getAttribute('aria-label') ?? text(r)) } : null; };
 const dialogs = () => [...document.querySelectorAll('dialog[open]')].map(d => ({ class: d.className, title: text(d.querySelector('h2, header strong')), text: text(d).slice(0, 600), checkboxes: [...d.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].map(i => ({ label: text(i.closest('label')), checked: i.checked })), buttons: [...d.querySelectorAll('button')].map(b => text(b)).filter(Boolean) }));
 const hints = () => [...document.querySelectorAll('.monaco-editor .message-widget, .navigation-hint, .compare-hint, .monaco-editor-overlaymessage')].map(n => text(n)).filter(Boolean);
 const suggestions = () => [...document.querySelectorAll('.suggest-widget.visible .monaco-list-row')].map(r => ({ label: text(r.querySelector('.label-name')), detail: text(r.querySelector('.signature-label')), type: [text(r.querySelector('.qualifier-label')), text(r.querySelector('.details-label'))].filter(Boolean).join(' '), aria: r.getAttribute('aria-label') ?? '' }));
 const suggestFooter = () => text(document.querySelector('.suggest-widget.visible .suggest-status-bar')) || null;
 function replaceLine(line: number, content: string) { const m = ed.getModel()!; m.pushEditOperations([], [{ range: new monaco.Range(line, 1, line, m.getLineMaxColumn(line)), text: content }], () => null); m.pushStackElement(); }

 const out: any = { profile: { ui: 'php-ide (Tauri 2, Monaco, Phpactor)', platform: navigator.platform, userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], keymap: 'padrão macOS do keymap próprio', repetitions }, cases: {} as Record<string, any[]> };
 let last = Date.now();
 /** Também envia cada registro pelo arquivo de progresso: um tempo esgotado ainda deixa dados parciais. */
 const record = async (id: string, value: any) => { value.ms = Date.now() - last; (out.cases[id] ??= []).push(value); await raw('nativeSmokeProgress', ['data:' + JSON.stringify({ id, value })]); await sleep(400); last = Date.now(); };

 await openFile('probe.php');
 const original = ed.getModel()!.getValue();
 // Índices (hierarquia, Phpactor) aquecidos antes da primeira medição, como a referência após indexar.
 await api.language({ method: 'textDocument/references', path: 'probe.php', text: original, version: 1, position: { line: 7, character: 9 } }).catch(() => null);

 for (let rep = 1; rep <= repetitions; rep++) {
  // ── C01: completion de membros ────────────────────────────────────────────
  {
   await openFile('probe.php'); ed.getModel()!.setValue(original);
   const line = original.split('\n')[7]; const rest = line.slice(line.indexOf(';'));
   replaceLine(8, '$user-' + rest); at(8, 7);
   ed.trigger('keyboard', 'type', { text: '>' });
   await wait(() => suggestions().length > 0 && !document.querySelector('.suggest-widget.visible .monaco-list-row .loading'), 30000); await sleep(400);
   const auto: any = { candidates: suggestions(), footer: suggestFooter() };
   // Diagnóstico: popup vazio → mesma consulta direta ao serviço de linguagem.
   if (!auto.candidates.length) { const m = ed.getModel()!; const t0 = Date.now(); auto.direct = await api.language({ method: 'textDocument/completion', path: 'probe.php', text: m.getValue(), version: m.getVersionId(), position: { line: 7, character: 7 } }).then((r: any) => ({ items: (r?.items ?? r ?? []).map((i: any) => i.label), ms: Date.now() - t0 }), (e: unknown) => ({ error: String(e) })); auto.status = status(); }
   if (rep === 1) await shot('C01-auto');
   ed.trigger('keyboard', 'acceptSelectedSuggestion', {}); await sleep(300);
   const accepted = { line: ed.getModel()!.getLineContent(8), cursor: pos() };
   ed.trigger('keyboard', 'undo', {}); await sleep(150);
   const undo1 = ed.getModel()!.getLineContent(8);
   replaceLine(8, '$user->' + rest); at(8, 8);
   ed.trigger('keyboard', 'editor.action.triggerSuggest', {});
   await wait(() => suggestions().length > 0, 30000); await sleep(400);
   const basic = { candidates: suggestions(), footer: suggestFooter() };
   if (rep === 1) await shot('C01-basic');
   key('Escape', 'Escape'); await sleep(200);
   const afterEsc = ed.getModel()!.getLineContent(8);
   await record('C01', { rep, auto, accepted, undo: undo1, basic, afterEscape: afterEsc, expectedAcceptedColumn: ('$user->label()' + rest).indexOf(';') + 1 });
   ed.getModel()!.setValue(original);
  }
  // ── C02: ⌘B (declaração ou usos) e ⌘[ ─────────────────────────────────────
  {
   const nav: any[] = [];
   for (const [label, line, column] of [['label', 8, 9], ['id', 9, 9], ['Person em new', 7, 15], ['alias Person', 5, 22]] as const) {
    await openFile('probe.php'); closeAll(); at(line, column); const before = pos(); const statusBefore = status();
    key('b', 'KeyB', { meta: true }); const ms = await settle(before);
    const after = pos(); const popup = usagesPopup(); const hint = hints(); const st = status() !== statusBefore ? status() : '';
    if (rep === 1) await shot('C02-' + label.replace(/\W+/g, '-'));
    closeAll(); let back: Pos = null;
    if (JSON.stringify(after) !== JSON.stringify(before)) { key('ArrowLeft', 'ArrowLeft', { alt: true }); await wait(() => JSON.stringify(pos()) !== JSON.stringify(after), 5000); await sleep(200); back = pos(); }
    nav.push({ symbol: label, from: before, to: after, popup, hints: hint, status: st, back, ms });
   }
   await record('C02', { rep, navigation: nav });
  }
  // ── C03: ⌥F7 em User::label; pergunta do método base, depois Método atual e Método base ──
  {
   const runs: any[] = [];
   for (const choice of ['current', 'base'] as const) {
    await openFile('src/User.php'); closeAll(); at(9, 22); const before = pos();
    key('F7', 'F7', { alt: true });
    await wait(() => !!usagesPopup()?.rows.length || !!document.querySelector('dialog[open]'), 30000); await sleep(300);
    const asked = dialogs();
    if (rep === 1 && choice === 'current') await shot('C03-question');
    const button = [...document.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find(b => b.value === choice);
    button?.click();
    await wait(() => !!usagesPopup()?.rows.length, 30000); await sleep(500);
    const popup = usagesPopup();
    if (rep === 1) await shot('C03-' + choice);
    closeAll(); runs.push({ choice, from: before, dialogs: asked, popup, status: status() });
   }
   await record('C03', { rep, runs });
  }
  // ── C04: ⌘⌥B ──────────────────────────────────────────────────────────────
  {
   const impl: any[] = [];
   for (const [label, path, line, column] of [['Named::label', 'src/Named.php', 7, 22], ['$value->label()', 'probe.php', 18, 22], ['Admin::label', 'src/Admin.php', 7, 22], ['$admin->label()', 'probe.php', 11, 10]] as const) {
    await openFile(path); closeAll(); at(line, column); const before = pos();
    key('b', 'KeyB', { meta: true, alt: true }); await settle(before, 20000);
    const result = { symbol: label, from: before, to: pos(), peek: peek(), popup: usagesPopup(), chooser: [...document.querySelectorAll('.implementations-popup')].map(p => ({ title: text(p.querySelector('header strong')), rows: [...p.querySelectorAll('.usage-result')].map(r => text(r)) })), status: status() };
    if (rep === 1) await shot('C04-' + label.replace(/\W+/g, '-'));
    closeAll(); impl.push(result);
   }
   await record('C04', { rep, implementations: impl });
  }
  // ── C05: tipos (template, instanceof, união) ──────────────────────────────
  {
   await openFile('probe.php'); ed.getModel()!.setValue(original);
   const complete = async (line: number, variable: string) => {
    const content = ed.getModel()!.getLineContent(line); const indent = content.slice(0, content.indexOf(variable));
    replaceLine(line, indent + variable + '->;'); at(line, indent.length + variable.length + 3);
    ed.trigger('keyboard', 'editor.action.triggerSuggest', {}); await wait(() => suggestions().length > 0, 30000); await sleep(400);
    const list = suggestions(); key('Escape', 'Escape'); await sleep(100); ed.getModel()!.setValue(original); return list;
   };
   const inferred = await complete(32, '$inferred');
   const narrowed = await complete(35, '$nullable');
   at(33, 3); ed.trigger('keyboard', 'editor.action.showHover', {});
   await wait(() => !!text(document.querySelector('.monaco-hover:not(.hidden) .hover-contents')), 15000); await sleep(400);
   const hover = [...document.querySelectorAll('.monaco-hover:not(.hidden) .hover-contents')].map(n => text(n)).filter(Boolean);
   if (rep === 1) await shot('C05-hover');
   closeAll(); await record('C05', { rep, inferred, narrowed, hover });
  }
  // ── C06: ⇧F6 em User::label, prévia e cancelar ────────────────────────────
  {
   await openFile('src/User.php'); closeAll(); at(9, 22);
   const disk = await Promise.all(['probe.php', 'src/User.php', 'src/Named.php', 'src/Admin.php', 'src/Unrelated.php'].map(async p => [p, (await api.read(p)).text] as const));
   key('F6', 'F6', { shift: true });
   await wait(() => !!document.querySelector('dialog.refactor-dialog[open]'), 30000); await sleep(300);
   const dialog = dialogs();
   if (rep === 1) await shot('C06-dialog');
   const d = document.querySelector<HTMLDialogElement>('dialog.refactor-dialog[open]');
   let preview: any = null;
   if (d) {
    const input = d.querySelector<HTMLInputElement>('input[name=name]')!; input.value = 'displayName'; input.dispatchEvent(new Event('input', { bubbles: true }));
    d.querySelector<HTMLButtonElement>('button[value=preview]')?.click();
    await wait(() => !!document.querySelector('dialog.refactor-preview[open]'), 30000); await sleep(600);
    const p = document.querySelector('dialog.refactor-preview[open]');
    preview = p ? { title: text(p.querySelector('header strong')), summary: text(p.querySelector('header span')), groups: [...p.querySelectorAll('.refactor-file')].map(g => ({ file: text(g.querySelector('label')), rows: [...g.querySelectorAll('.refactor-occurrence')].map(r => text(r)) })), messages: text(p.querySelector('.refactor-messages')), buttons: [...p.querySelectorAll('footer button')].map(b => text(b)) } : { status: status(), dialogs: dialogs() };
    if (rep === 1) await shot('C06-preview');
    document.querySelector<HTMLButtonElement>('dialog.refactor-preview[open] .cancel')?.click(); await sleep(300);
   }
   const unchanged = (await Promise.all(disk.map(async ([p, t]) => (await api.read(p)).text === t))).every(Boolean);
   await record('C06', { rep, dialog, preview, diskUnchanged: unchanged, status: status() });
   closeAll();
  }
 }
 await openFile('probe.php'); ed.getModel()!.setValue(original);
 return out;
}
