import { CompletionKind, type CodeSite, type IdePlugin, type PluginCompletion, type PluginDiagnostic, type PluginLocation, type ProjectFiles } from './api';
import { findHeading, isMarkdownPath, markdownHeadings, markdownReferences, markdownLinkAt, resolveMarkdownTarget } from '../../markdown';

const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const point = (line: number, character = 0) => ({ line, character });

/**
 * Links em documentos Markdown: ⌘/Ctrl+clique ou F12 em `[texto](destino)` abre o arquivo
 * do projeto (e o título de `#âncora`, ou a linha de `#L10`); completion sugere caminhos
 * relativos após `](` e âncoras após `#`. URLs externas não são tratadas aqui.
 */
export class MarkdownPlugin implements IdePlugin {
 readonly id = 'markdown';
 readonly name = 'Markdown';
 readonly hidden = true;
 async detect() { return {}; }
 documents(path: string) { return isMarkdownPath(path); }

 private async anchor(path: string, fragment: string, text: string | null): Promise<{ line: number; character: number; length: number }> {
  const lines = /^L(\d+)(?:-L?\d+)?$/.exec(fragment);
  if (lines) return { line: Math.max(0, Number(lines[1]) - 1), character: 0, length: 0 };
  if (!fragment || text === null || !isMarkdownPath(path)) return { line: 0, character: 0, length: 0 };
  const heading = findHeading(markdownHeadings(text), fragment);
  if (!heading) return { line: 0, character: 0, length: 0 };
  const source = (text.split(/\r?\n/)[heading.line] ?? '').replace(/[ \t]+#*[ \t]*$/, '');
  const character = /^ {0,3}#{1,6}[ \t]*/.exec(source)?.[0].length ?? 0;
  return { line: heading.line, character, length: Math.max(0, source.length - character) };
 }

 async defineCode(site: CodeSite, files: ProjectFiles): Promise<PluginLocation[] | null> {
  if (!isMarkdownPath(site.path)) return null;
  const link = markdownLinkAt(site.text, site.offset);
  if (!link) return [];
  const target = resolveMarkdownTarget(site.path, link.target);
  if (!target) return [];
  const own = target.path === site.path;
  if (!own && !(await files.exists(target.path))) return [];
  const text = own ? site.text : isMarkdownPath(target.path) && target.fragment ? await files.read(target.path) : null;
  const at = await this.anchor(target.path, target.fragment, text);
  // Sem âncora o destino abre onde o usuário estava, como nos links de arquivo em strings.
  return [{ uri: files.uri(target.path), range: { start: point(at.line, at.character), end: point(at.line, at.character + at.length) }, ...(!target.fragment && !own ? { preserveView: true } : {}) }];
 }

 async completeCode(site: CodeSite, files: ProjectFiles) {
  if (!isMarkdownPath(site.path)) return null;
  const before = site.text.slice(site.text.lastIndexOf('\n', site.offset - 1) + 1, site.offset);
  const m = /\]\(<?([^)\s>]*)$/.exec(before);
  if (!m) return { from: site.offset, items: [] };
  const typed = m[1]; const from = site.offset - typed.length; const hash = typed.indexOf('#');
  if (hash >= 0) {
   const target = resolveMarkdownTarget(site.path, typed.slice(0, hash));
   if (!target || !isMarkdownPath(target.path)) return { from, items: [] };
   const text = target.path === site.path ? site.text : await files.read(target.path);
   const items = text === null ? [] : markdownHeadings(text).map(h => ({ label: `${typed.slice(0, hash)}#${h.slug}`, kind: CompletionKind.Reference, detail: `${'#'.repeat(h.level)} ${h.text}` }));
   return { from, items };
  }
  const prefix = typed.slice(0, typed.lastIndexOf('/') + 1);
  const probe = resolveMarkdownTarget(site.path, prefix + '_');
  if (!probe) return { from, items: [] };
  const dir = parent(probe.path);
  const paths = await files.list(dir, () => true).catch(() => [] as string[]);
  const items: PluginCompletion[] = paths.map(p => dir ? p.slice(dir.length + 1) : p).filter(p => !p.startsWith('.') && !p.includes('/.') && prefix + p !== site.path)
   .sort((a, b) => Number(isMarkdownPath(b)) - Number(isMarkdownPath(a)) || a.split('/').length - b.split('/').length || a.localeCompare(b)).slice(0, 300)
   .map(p => ({ label: prefix + p, kind: CompletionKind.File, detail: dir ? `${dir}/${p}` : p }));
  if (!typed) items.push(...markdownHeadings(site.text).map(h => ({ label: `#${h.slug}`, kind: CompletionKind.Reference, detail: `${'#'.repeat(h.level)} ${h.text}` })));
  return { from, items };
 }
 /**
  * Referências não resolvidas: arquivo relativo inexistente, `#âncora` sem título correspondente
  * (no próprio documento ou em outro Markdown) e `[texto][rótulo]` sem definição.
  */
 async diagnose(path: string, text: string, files: ProjectFiles): Promise<PluginDiagnostic[]> {
  if (!isMarkdownPath(path)) return [];
  const { references, labels } = markdownReferences(text); const out: PluginDiagnostic[] = [];
  const exists = new Map<string, Promise<boolean>>(); const headings = new Map<string, Promise<ReturnType<typeof markdownHeadings> | null>>();
  headings.set(path, Promise.resolve(markdownHeadings(text)));
  const problem = (r: { line: number; start: number; end: number }, message: string, code: string, from = r.start) =>
   out.push({ range: { start: point(r.line, from), end: point(r.line, r.end) }, message, code, severity: 'warning' });
  for (const r of references) {
   if (r.kind === 'label') { if (!labels.has(r.label)) problem(r, `Rótulo de link não definido: [${r.label}]`, 'unresolved-label'); continue; }
   const target = resolveMarkdownTarget(path, r.target);
   if (!target) { if (!/^[A-Za-z][A-Za-z0-9+.-]*:|^\/\//.test(r.target)) problem(r, `Link aponta para fora do projeto: ${r.target}`, 'unresolved-file'); continue; }
   if (target.path !== path) {
    if (!exists.has(target.path)) exists.set(target.path, files.exists(target.path));
    if (!(await exists.get(target.path))) { problem(r, `Arquivo não encontrado: ${target.path}`, 'unresolved-file'); continue; }
   }
   if (!target.fragment || /^L\d+/.test(target.fragment) || !isMarkdownPath(target.path)) continue;
   if (!headings.has(target.path)) headings.set(target.path, files.read(target.path).then(t => t === null ? null : markdownHeadings(t)));
   const list = await headings.get(target.path);
   if (list && !findHeading(list, target.fragment)) problem(r, `Título não encontrado: #${target.fragment}${target.path === path ? '' : ` em ${target.path}`}`, 'unresolved-header', r.start + r.target.indexOf('#'));
  }
  return out;
 }
}
