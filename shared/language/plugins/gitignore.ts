import { CompletionKind, type CodeSite, type IdePlugin, type PluginCompletion, type ProjectFiles } from './api';

/** `.gitignore`, `.dockerignore`, `.npmignore`… e `.git/info/exclude`: mesma sintaxe de padrões. */
export const isIgnorePath = (path: string) => /(^|\/)\.[\w-]*ignore$/.test(path) || /(^|\/)\.git\/info\/exclude$/.test(path);

// Entradas frequentes que a listagem do projeto não mostra (diretórios omitidos pelo backend ou ainda inexistentes).
const common: [string, string][] = [
 ['vendor/', 'Dependências do Composer'], ['node_modules/', 'Dependências npm'], ['.env', 'Variáveis de ambiente locais'], ['.env.*', 'Variações de .env'],
 ['!.env.example', 'Mantém o exemplo versionado'], ['.idea/', 'Configuração do PhpStorm'], ['.vscode/', 'Configuração do VS Code'], ['.DS_Store', 'Metadados do macOS'],
 ['Thumbs.db', 'Miniaturas do Windows'], ['*.log', 'Logs'], ['*.cache', 'Caches'], ['.phpunit.result.cache', 'Cache do PHPUnit'], ['.phpunit.cache/', 'Cache do PHPUnit 10+'],
 ['.php-cs-fixer.cache', 'Cache do PHP CS Fixer'], ['coverage/', 'Relatórios de cobertura'], ['storage/*.key', 'Chaves do Laravel'], ['public/storage', 'Link simbólico do Laravel'],
 ['public/hot', 'Servidor do Vite'], ['public/build/', 'Build do Vite'], ['dist/', 'Saída de build'], ['build/', 'Saída de build'], ['target/', 'Saída do Cargo'], ['*.swp', 'Temporários do Vim'],
];

/**
 * Padrões de arquivos ignore: sugere caminhos do projeto relativos ao diretório do arquivo,
 * segmento a segmento (diretórios terminam em `/`), preservando `!` e `/` iniciais, e
 * padrões comuns no início da linha. Entradas já presentes no arquivo não são repetidas.
 */
export class GitignorePlugin implements IdePlugin {
 readonly id = 'gitignore';
 readonly name = '.gitignore';
 readonly hidden = true;
 async detect() { return {}; }
 documents(path: string) { return isIgnorePath(path); }

 async completeCode(site: CodeSite, files: ProjectFiles) {
  if (!isIgnorePath(site.path)) return null;
  const start = site.text.lastIndexOf('\n', site.offset - 1) + 1;
  const typed = site.text.slice(start, site.offset);
  if (/^\s*#/.test(typed) || /\s/.test(typed.trim())) return { from: site.offset, items: [] };
  const from = start + typed.length - typed.trimStart().length;
  const lead = /^!?\/?/.exec(typed.trimStart())![0];
  const body = typed.trimStart().slice(lead.length);
  const entry = (line: string) => line.trim().replace(/^!?\/?/, '').replace(/\/$/, '');
  const lines = site.text.split(/\r?\n/);
  const current = site.text.slice(0, start).split('\n').length - 1;
  // A linha em edição não conta como já presente.
  const present = new Set(lines.filter((l, i) => i !== current && !l.trim().startsWith('#')).map(entry).filter(Boolean));
  const taken = (pattern: string) => present.has(pattern.replace(/\/$/, ''));
  const items: PluginCompletion[] = [];
  const base = site.path.includes('/') ? site.path.slice(0, site.path.lastIndexOf('/')).replace(/(^|\/)\.git\/info$/, '') : '';
  const folder = body.slice(0, body.lastIndexOf('/') + 1);
  if (!folder.includes('*') && !folder.includes('..')) {
   const dir = [base, folder.replace(/\/$/, '')].filter(Boolean).join('/');
   const paths = await files.list(dir, () => true).catch(() => [] as string[]);
   const children = new Map<string, boolean>();
   for (const p of paths) {
    const rest = dir ? p.slice(dir.length + 1) : p;
    const slash = rest.indexOf('/');
    const name = slash < 0 ? rest : rest.slice(0, slash);
    if (!name || name === '.git' || (folder + name) === site.path.slice(base ? base.length + 1 : 0)) continue;
    children.set(name, (children.get(name) ?? false) || slash >= 0);
   }
   [...children].sort(([a, ad], [b, bd]) => Number(bd) - Number(ad) || a.localeCompare(b)).slice(0, 300).forEach(([name, isDir]) => {
    const path = folder + name + (isDir ? '/' : '');
    if (taken(path)) return;
    items.push({ label: lead + path, kind: isDir ? CompletionKind.Folder : CompletionKind.File, detail: [dir, name].filter(Boolean).join('/') + (isDir ? '/' : '') });
   });
  }
  if (!folder) {
   const seen = new Set(items.map(i => i.label));
   for (const [pattern, detail] of common) {
    const negated = pattern.startsWith('!');
    if (negated !== lead.startsWith('!') || taken(pattern.replace(/^!/, ''))) continue;
    const label = negated ? pattern : lead + pattern;
    if (!seen.has(label)) items.push({ label, kind: CompletionKind.Value, detail });
   }
  }
  return { from, items };
 }
}
