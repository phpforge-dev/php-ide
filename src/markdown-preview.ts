import { t as tr, msg, html } from './i18n';
import * as monaco from 'monaco-editor';
import type { IdeApi } from '../shared/contracts';
import { findHeading, isMarkdownPath, markdownHeadings, renderMarkdown, resolveMarkdownTarget } from '../shared/markdown';

type Mode = 'editor' | 'split' | 'preview';
type Hooks = {
 /** Caminho relativo do documento ativo. */
 path(): string | undefined;
 open(path: string, line?: number): Promise<void>;
 status(text: string): void;
};
const diagramCache = new Map<string, { svg: string } | { error: string }>(); let diagramIds = 0;
let mermaidLoaded: { theme: string; module: Promise<typeof import('mermaid').default> } | undefined;
function loadMermaid(theme: string) {
 if (mermaidLoaded?.theme !== theme) {
  const module = (mermaidLoaded?.module ?? import('mermaid').then(m => m.default)).then(m => {
   // strict: sem HTML/clique nos rótulos; o SVG gerado passa pelo DOMPurify do próprio Mermaid.
   // Rótulos em <text> SVG: medidos e desenhados com a mesma fonte, sem herdar a tipografia da prévia.
   m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme as 'dark' | 'default', fontFamily: 'system-ui, -apple-system, sans-serif', htmlLabels: false, flowchart: { htmlLabels: false } }); return m;
  });
  mermaidLoaded = { theme, module };
  module.catch(() => { mermaidLoaded = undefined; });
 }
 return mermaidLoaded.module;
}
const modes: [Mode, string, string][] = [
 ['editor', 'Somente editor', '<path d="M4 5h16M4 9h16M4 13h16M4 17h10"/>'],
 ['split', tr('Editor e prévia'), '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16M6 8h3M6 11h3M6 14h3"/>'],
 ['preview', tr('Somente prévia'), '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 3 3 3-4 5 6"/>'],
];
const storageKey = 'php-ide-markdown-mode';

/**
 * Prévia Markdown ao lado do editor: renderização ao vivo, rolagem acompanhando o editor,
 * links relativos abrindo no projeto e outline (⌘/Ctrl+Shift+O). Deve ser montada depois
 * do console SQL, que insere a barra dele antes de `#editor`.
 */
export function mountMarkdown(api: IdeApi, editor: monaco.editor.IStandaloneCodeEditor, hooks: Hooks) {
 let mode: Mode = 'split';
 try { const saved = localStorage.getItem(storageKey); if (saved === 'editor' || saved === 'split' || saved === 'preview') mode = saved; } catch { /* preferência opcional */ }
 const host = document.getElementById('editor')!;
 const split = document.createElement('div'); split.className = 'editor-split';
 host.replaceWith(split);
 const preview = document.createElement('article'); preview.id = 'markdown-preview'; preview.className = 'markdown-body'; preview.tabIndex = 0; preview.setAttribute('aria-label', tr('Prévia Markdown')); preview.hidden = true;
 split.append(host, preview);
 // Grupo de três ícones na faixa das abas, junto da navegação de código (como na referência).
 const bar = document.createElement('div'); bar.id = 'markdown-toolbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', tr('Layout Markdown')); bar.hidden = true;
 const buttons = modes.map(([id, label, icon]) => {
  const b = document.createElement('button'); b.dataset.mode = id; b.title = `${label} · ⌘/Ctrl+Shift+V alterna`; b.setAttribute('aria-label', label);
  b.innerHTML = html`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
  b.onclick = () => setMode(id); return b;
 });
 bar.append(...buttons);
 document.getElementById('navigation')!.prepend(bar);
 const isMarkdown = editor.createContextKey<boolean>('markdownDocument', false);
 let timer: ReturnType<typeof setTimeout> | undefined; let checks: ReturnType<typeof setTimeout> | undefined; let rendered = ''; let generation = 0;

 const active = () => { const path = hooks.path(); return path && isMarkdownPath(path) && editor.getModel()?.getLanguageId() === 'markdown' ? path : undefined; };
 function layout() {
  const on = !!active();
  bar.hidden = !on; isMarkdown.set(on);
  split.dataset.mode = on ? mode : 'editor';
  preview.hidden = !on || mode === 'editor';
  host.hidden = on && mode === 'preview';
  buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  editor.layout();
 }
 /** Blocos de código com linguagem conhecida recebem as cores do tema do editor. */
 async function colorizeCode(current: number) {
  const languages = monaco.languages.getLanguages();
  for (const code of preview.querySelectorAll<HTMLElement>('pre[data-lang] > code')) {
   const lang = code.parentElement!.dataset.lang!.toLowerCase(); if (lang === 'mermaid') continue;
   const id = languages.find(l => l.id === lang || l.aliases?.some(a => a.toLowerCase() === lang) || l.extensions?.includes('.' + lang))?.id;
   if (!id) continue;
   const html = await monaco.editor.colorize(code.textContent!.replace(/\n$/, ''), id, { tabSize: 4 });
   if (current !== generation) return;
   // colorize() escapa o texto e devolve só spans com classes de token do tema ativo.
   code.innerHTML = html; code.classList.add('md-colorized');
  }
 }
 function setMode(next: Mode) {
  mode = next; try { localStorage.setItem(storageKey, mode); } catch { /* preferência opcional */ }
  layout(); if (mode !== 'editor') { render(true); syncScroll(); }
  if (mode === 'preview') preview.focus(); else editor.focus();
 }
 function cycle() { setMode(modes[(modes.findIndex(([id]) => id === mode) + 1) % modes.length][0]); }

 function render(force = false) {
  const path = active(); const model = editor.getModel();
  if (!path || !model || (mode === 'editor' && !force)) return;
  const text = model.getValue(); const key = path + '\0' + model.getVersionId();
  if (!force && key === rendered) return;
  rendered = key; const current = ++generation;
  const top = preview.scrollTop;
  preview.innerHTML = renderMarkdown(text);
  preview.scrollTop = top;
  void images(path, current);
  void diagrams(current);
  void colorizeCode(current);
 }
 /** Imagens locais viram data URI; remotas são bloqueadas pela CSP e aparecem como link. */
 async function images(path: string, current: number) {
  for (const img of preview.querySelectorAll<HTMLImageElement>('img[data-src]')) {
   const src = img.dataset.src!; const target = resolveMarkdownTarget(path, src);
   const fallback = (reason: string) => {
    const box = document.createElement('span'); box.className = 'md-image-missing'; box.title = reason;
    box.textContent = `🖼 ${img.alt || src}`; if (!target) { box.dataset.href = src; box.setAttribute('role', 'link'); box.tabIndex = 0; }
    img.replaceWith(box);
   };
   if (!target) { fallback(tr('Imagem remota não carregada pela política de conteúdo da IDE')); continue; }
   try { const uri = await api.readImage(target.path); if (current !== generation) return; img.src = uri; img.removeAttribute('data-src'); }
   catch (error) { if (current !== generation) return; fallback(`${target.path}: ${String((error as Error)?.message ?? error)}`); }
  }
 }
 /** Blocos ```mermaid viram SVG (Mermaid carregado sob demanda, modo `strict`); erro mostra a mensagem e mantém o código. */
 async function diagrams(current: number) {
  const blocks = [...preview.querySelectorAll<HTMLElement>('pre[data-lang="mermaid" i]')];
  if (!blocks.length) return;
  const theme = document.documentElement.dataset.theme === 'light' ? 'default' : 'dark';
  let mermaid: typeof import('mermaid').default;
  try { mermaid = await loadMermaid(theme); } catch (error) { hooks.status(msg`Mermaid indisponível: ${String((error as Error)?.message ?? error)}`); return; }
  for (const pre of blocks) {
   if (current !== generation) return;
   const source = pre.textContent!.replace(/\n$/, ''); const key = theme + '\0' + source;
   const figure = document.createElement('figure'); figure.className = 'md-mermaid'; figure.dataset.line = pre.dataset.line!; figure.setAttribute('role', 'img');
   let result = diagramCache.get(key);
   if (!result) {
    try { result = { svg: (await mermaid.render(`md-mermaid-${++diagramIds}`, source)).svg }; }
    catch (error) { result = { error: String((error as Error)?.message ?? error).split('\n').filter(Boolean).slice(0, 3).join('\n') }; }
    // Mermaid deixa nós temporários no body quando falha.
    document.querySelectorAll('body > [id^="dmd-mermaid-"]').forEach(n => n.remove());
    diagramCache.set(key, result); if (diagramCache.size > 100) diagramCache.delete(diagramCache.keys().next().value!);
   }
   if (current !== generation) return;
   if ('svg' in result) { figure.innerHTML = result.svg; figure.setAttribute('aria-label', tr('Diagrama Mermaid')); }
   else { figure.classList.add('md-mermaid-error'); figure.setAttribute('aria-label', tr('Diagrama Mermaid inválido')); const message = document.createElement('p'); message.textContent = msg`Diagrama Mermaid inválido: ${result.error}`; figure.append(message, pre.cloneNode(true)); }
   pre.replaceWith(figure);
  }
 }
 /** Problemas de referência do plugin viram marcadores no editor. */
 async function diagnose() {
  const path = active(); const model = editor.getModel(); if (!path || !model) return;
  const version = model.getVersionId();
  let list: any[];
  try { list = await api.language({ method: 'textDocument/diagnostic', path, text: model.getValue(), version, position: { line: 0, character: 0 } }) as any[]; } catch { return; }
  if (model.isDisposed() || model.getVersionId() !== version) return;
  monaco.editor.setModelMarkers(model, 'markdown', (list ?? []).map(d => ({ severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning, message: d.message, code: d.code, source: 'Markdown',
   startLineNumber: d.range.start.line + 1, startColumn: d.range.start.character + 1, endLineNumber: d.range.end.line + 1, endColumn: d.range.end.character + 1 })));
 }
 /** Rolagem do editor → prévia: alinha o bloco da primeira linha visível ao topo. */
 function syncScroll() {
  if (preview.hidden || host.hidden) return;
  const line = (editor.getVisibleRanges()[0]?.startLineNumber ?? 1) - 1;
  let target: HTMLElement | undefined; let next: HTMLElement | undefined;
  for (const el of preview.querySelectorAll<HTMLElement>('[data-line]')) { const at = Number(el.dataset.line); if (at <= line) target = el; else { next = el; break; } }
  if (!target) { preview.scrollTop = 0; return; }
  const base = target.offsetTop - preview.offsetTop; const from = Number(target.dataset.line);
  const span = next ? Number(next.dataset.line) - from : 1; const height = next ? next.offsetTop - target.offsetTop : target.offsetHeight;
  preview.scrollTop = base + (span > 0 ? (line - from) / span * height : 0) - 8;
 }
 function reveal(line: number) {
  if (mode === 'preview') { const el = [...preview.querySelectorAll<HTMLElement>('[data-line]')].find(e => Number(e.dataset.line) >= line); el?.scrollIntoView({ block: 'start' }); }
  const position = { lineNumber: line + 1, column: 1 };
  editor.setPosition(position); editor.revealLineNearTop(line + 1);
  if (mode !== 'preview') editor.focus();
 }
 async function follow(href: string) {
  const path = active(); if (!path) return;
  if (/^(https?|mailto):/i.test(href)) {
   try { await navigator.clipboard.writeText(href); hooks.status(`Link externo copiado: ${href}`); } catch { hooks.status(`Link externo: ${href}`); }
   return;
  }
  const target = resolveMarkdownTarget(path, href);
  if (!target) { hooks.status(msg`Link fora do projeto: ${href}`); return; }
  let line: number | undefined;
  const lines = /^L(\d+)/.exec(target.fragment);
  if (lines) line = Number(lines[1]) - 1;
  if (target.path === path) {
   if (target.fragment && line === undefined) line = findHeading(markdownHeadings(editor.getModel()!.getValue()), target.fragment)?.line;
   if (line === undefined) { hooks.status(msg`Âncora não encontrada: #${target.fragment}`); return; }
   reveal(line); return;
  }
  try {
   if (target.fragment && line === undefined && isMarkdownPath(target.path)) line = findHeading(markdownHeadings((await api.read(target.path)).text), target.fragment)?.line;
   await hooks.open(target.path, line);
  } catch (error) { hooks.status(msg`Não foi possível abrir ${target.path}: ${String((error as Error)?.message ?? error)}`); }
 }
 preview.addEventListener('click', event => {
  const el = (event.target as HTMLElement).closest<HTMLElement>('a[href], .md-image-missing[data-href]');
  if (!el) return;
  event.preventDefault();
  void follow(el.getAttribute('href') ?? el.dataset.href!);
 });
 preview.addEventListener('keydown', event => { const el = event.target as HTMLElement; if (event.key === 'Enter' && el.matches('.md-image-missing[data-href]')) void follow(el.dataset.href!); });
 // Duplo clique em um bloco leva o cursor do editor à linha correspondente.
 preview.addEventListener('dblclick', event => {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-line]'); if (!el) return;
  if (mode === 'preview') setMode('split');
  reveal(Number(el.dataset.line));
 });
 document.addEventListener('keydown', event => {
  if (!active() || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.code !== 'KeyV') return;
  event.preventDefault(); event.stopPropagation(); cycle();
 }, true);

 editor.onDidChangeModel(() => { rendered = ''; layout(); render(); void diagnose(); });
 // Tema alterado em Aparência: diagramas são refeitos com as cores certas.
 new MutationObserver(() => { if (active()) render(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
 editor.onDidChangeModelContent(() => { if (!active()) return; clearTimeout(timer); timer = setTimeout(() => { render(); syncScroll(); }, 120); clearTimeout(checks); checks = setTimeout(() => void diagnose(), 400); });
 editor.onDidScrollChange(() => { if (active()) syncScroll(); });

 monaco.languages.registerDocumentSymbolProvider('markdown', { displayName: 'Markdown', provideDocumentSymbols: model => {
  const roots: monaco.languages.DocumentSymbol[] = []; const stack: { level: number; symbol: monaco.languages.DocumentSymbol }[] = [];
  const headings = markdownHeadings(model.getValue()); const last = model.getLineCount();
  headings.forEach((h, k) => {
   const end = (headings.slice(k + 1).find(n => n.level <= h.level)?.line ?? last) ;
   const lineRange = { startLineNumber: h.line + 1, startColumn: 1, endLineNumber: h.line + 1, endColumn: model.getLineMaxColumn(h.line + 1) };
   const symbol: monaco.languages.DocumentSymbol = { name: h.text, detail: `#${h.slug}`, kind: monaco.languages.SymbolKind.String, tags: [], range: { ...lineRange, endLineNumber: Math.max(h.line + 1, end), endColumn: model.getLineMaxColumn(Math.max(h.line + 1, end)) }, selectionRange: lineRange, children: [] };
   while (stack.length && stack.at(-1)!.level >= h.level) stack.pop();
   (stack.at(-1)?.symbol.children ?? roots).push(symbol); stack.push({ level: h.level, symbol });
  });
  return roots;
 } });
 layout();
 return { refresh: () => { rendered = ''; layout(); render(); }, mode: () => mode, setMode };
}
