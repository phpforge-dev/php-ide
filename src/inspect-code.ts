import * as monaco from 'monaco-editor';
// UI-PROBLEMS-001, round 2 — "Inspect Code" for Problems › Project Errors. The reference runs the inspection
// profile over the project and lists what it finds (public help, "Problems tool window" / "Run inspections";
// capture 51 offers "Inspect Code…" under "No errors found by the IDE."). Here the IDE asks the same diagnostic
// sources an open editor uses: the language channel (`textDocument/diagnostic`, which covers the plugins' document
// diagnostics, and the PHP server's `php/diagnostics`) and Monaco's own workers (JSON, TypeScript/JavaScript, CSS,
// HTML) on a temporary model that is disposed afterwards. Open files keep their live markers. Inspections that a
// plugin computes only for the active editor (PHP literal/type inspections) are not run on closed files.

export type Diagnostic = { range: { start: { line: number; character: number }; end: { line: number; character: number } }; message: string; severity?: string | number; code?: unknown; source?: string };
export type InspectionProblem = { path: string; uri: string; line: number; column: number; endLine: number; endColumn: number; message: string; severity: monaco.MarkerSeverity; source?: string; code?: string };
export type InspectHooks = {
 files(): Promise<string[]>;
 read(path: string): Promise<{ uri: string; text: string }>;
 /** Monaco language id used when the file is opened (undefined: by extension). */
 language(path: string, text: string): string | undefined;
 diagnose(path: string, text: string): Promise<Diagnostic[]>;
 /** The model became a workspace buffer while it was being inspected (must not be disposed). */
 isOpen(model: monaco.editor.ITextModel): boolean;
};
export type InspectOptions = { signal?: AbortSignal; progress?(done: number, total: number, path: string): void; limit?: number };

const SKIPPED_DIRECTORIES = /(?:^|\/)(?:vendor|node_modules|\.git|\.idea|var\/cache|storage\/framework)\//;
const INSPECTABLE = /\.(?:php|phtml|inc|js|mjs|cjs|jsx|ts|mts|cts|tsx|vue|json|ya?ml|twig|html?|css|scss|less|md|markdown|sh|bash|env|xml|neon)$|(?:^|\/)(?:Dockerfile|\.env(?:\.[\w.-]+)?|compose\.ya?ml|docker-compose\.ya?ml)$/i;
const WORKER_LANGUAGES = new Set(['json', 'javascript', 'typescript', 'css', 'scss', 'less', 'html']);
const MAX_SIZE = 512 * 1024;

export const isInspectable = (path: string) => INSPECTABLE.test(path) && !SKIPPED_DIRECTORIES.test(path) && !/\.min\.(?:js|css)$/.test(path);
export function markerSeverity(value: string | number | undefined): monaco.MarkerSeverity {
 const S = monaco.MarkerSeverity;
 if (value === 'error' || value === 1) return S.Error;
 if (value === 'info' || value === 'information' || value === 3) return S.Info;
 if (value === 'hint' || value === 4) return S.Hint;
 return S.Warning;
}
const languageByExtension = (path: string) => {
 const name = path.split('/').pop()!.toLowerCase();
 return monaco.languages.getLanguages().find(l => l.filenames?.some(f => f.toLowerCase() === name) || l.extensions?.some(e => name.endsWith(e.toLowerCase())))?.id ?? 'plaintext';
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Markers settle when no change arrived for `quiet` ms (or `max` ms passed). */
async function settled(model: monaco.editor.ITextModel, quiet = 350, max = 2500) {
 let last = Date.now(); const started = last;
 const listener = monaco.editor.onDidChangeMarkers(uris => { if (uris.some(uri => uri.toString() === model.uri.toString())) last = Date.now(); });
 try { while (Date.now() - last < quiet && Date.now() - started < max) await sleep(60); } finally { listener.dispose(); }
}

/** Inspects every inspectable project file; resolves with the problems of all severities, by file and line. */
export async function inspectProject(hooks: InspectHooks, options: InspectOptions = {}): Promise<InspectionProblem[]> {
 const paths = (await hooks.files()).filter(isInspectable).sort().slice(0, options.limit ?? 2000);
 const found: InspectionProblem[] = [];
 let done = 0; let next = 0;
 const push = (path: string, uri: string, list: InspectionProblem[]) => { const seen = new Set<string>(); for (const p of list) { const key = `${p.line}:${p.column}:${p.message}`; if (!seen.has(key)) { seen.add(key); found.push({ ...p, path, uri }); } } };
 const fromMarker = (m: monaco.editor.IMarker): InspectionProblem => ({ path: '', uri: '', line: m.startLineNumber, column: m.startColumn, endLine: m.endLineNumber, endColumn: m.endColumn, message: m.message, severity: m.severity, source: m.source, code: typeof m.code === 'object' ? m.code.value : m.code });
 async function inspect(path: string) {
  const file = await hooks.read(path);
  if (file.text.length > MAX_SIZE || file.text.includes('\0')) return;
  const uri = monaco.Uri.parse(file.uri);
  const live = monaco.editor.getModel(uri);
  if (live) { push(path, file.uri, monaco.editor.getModelMarkers({ resource: uri }).map(fromMarker)); return; }
  const language = hooks.language(path, file.text) ?? languageByExtension(path);
  const model = monaco.editor.createModel(file.text, language, uri);
  try {
   const [diagnostics] = await Promise.all([hooks.diagnose(path, file.text).catch(() => [] as Diagnostic[]), WORKER_LANGUAGES.has(language) ? settled(model) : Promise.resolve()]);
   const list = model.isDisposed() ? [] : monaco.editor.getModelMarkers({ resource: uri }).map(fromMarker);
   for (const d of diagnostics) list.push({ path: '', uri: '', line: d.range.start.line + 1, column: d.range.start.character + 1, endLine: d.range.end.line + 1, endColumn: d.range.end.character + 1, message: d.message, severity: markerSeverity(d.severity), source: d.source, code: d.code === undefined ? undefined : String(typeof d.code === 'object' && d.code ? (d.code as { value?: unknown }).value : d.code) });
   push(path, file.uri, list);
  } finally { if (!model.isDisposed() && !hooks.isOpen(model)) model.dispose(); }
 }
 const worker = async () => {
  while (next < paths.length) {
   if (options.signal?.aborted) return;
   const path = paths[next++];
   try { await inspect(path); } catch { /* unreadable file: skipped */ }
   options.progress?.(++done, paths.length, path);
  }
 };
 options.progress?.(0, paths.length, '');
 await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));
 return found.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column);
}
