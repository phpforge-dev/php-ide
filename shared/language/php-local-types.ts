// Tipos locais mínimos de variáveis PHP, para complementar o servidor de linguagem onde ele não
// infere: união `cond ? new X() : null` e função genérica identidade (`@template T`, `@param T $v`,
// `@return T`). Sem fluxo: vale a última atribuição `$v = …;` antes do ponto. Não é um verificador
// de tipos; não cobre bounds, `class-string<T>`, coleções nem templates de classe (recorte 29).
import { analyze, codeOnly, type FileContext } from './php-source';
import { qualify } from './php-hierarchy';

export type FunctionDoc = { name: string; fqn: string; params: string[]; templates: string[]; paramTypes: Record<string, string>; returnType?: string };
/** Um tipo resolvido: FQN de classe ou palavra-chave (`null`, `int`…). */
export type LocalType = { name: string; fqn?: string };

/** Funções de topo com o docblock imediatamente anterior. */
export function functionDocs(text: string, context: FileContext = analyze(text)): FunctionDoc[] {
 const code = codeOnly(text); const out: FunctionDoc[] = [];
 const re = /\bfunction\s+&?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
 for (let m = re.exec(code); m; m = re.exec(code)) {
  if (/(->|::)\s*$/.test(code.slice(0, m.index))) continue;
  const params = [...m[2].matchAll(/\$([A-Za-z_]\w*)/g)].map(p => p[1]);
  const before = text.slice(0, m.index); const doc = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*$/.exec(before)?.[1] ?? '';
  const templates = [...doc.matchAll(/@(?:phpstan-|psalm-)?template\s+([A-Za-z_]\w*)/g)].map(t => t[1]);
  const paramTypes: Record<string, string> = {}; for (const p of doc.matchAll(/@(?:phpstan-|psalm-)?param\s+(\S+)\s+\$([A-Za-z_]\w*)/g)) paramTypes[p[2]] = p[1];
  const returnType = /@(?:phpstan-|psalm-)?return\s+(\S+)/.exec(doc)?.[1];
  const ns = context.namespaces.filter(n => n.offset < m!.index).at(-1)?.name ?? '';
  out.push({ name: m[1], fqn: ns ? `${ns}\\${m[1]}` : m[1], params, templates, paramTypes, ...(returnType ? { returnType } : {}) });
 }
 return out;
}

/** Divide no nível 0 de parênteses/colchetes. */
function splitTop(expr: string, separator: string): string[] {
 const out: string[] = []; let depth = 0, start = 0;
 for (let i = 0; i < expr.length; i++) { const c = expr[i]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; else if (depth === 0 && c === separator) { out.push(expr.slice(start, i)); start = i + 1; } }
 out.push(expr.slice(start)); return out;
}
/** `a ? b : c` no nível 0 (ignora `?->`, `??` e `::`). */
function ternary(expr: string): [string, string, string] | undefined {
 let depth = 0, q = -1;
 for (let i = 0; i < expr.length; i++) {
  const c = expr[i]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
  else if (depth === 0 && c === '?' && expr[i + 1] !== '-' && expr[i + 1] !== '?' && expr[i - 1] !== '?' && q < 0) q = i;
  else if (depth === 0 && c === ':' && q >= 0 && expr[i + 1] !== ':' && expr[i - 1] !== ':') return [expr.slice(0, q), expr.slice(q + 1, i), expr.slice(i + 1)];
 }
 return undefined;
}
const unique = (types: LocalType[]) => types.filter((t, i) => types.findIndex(u => (u.fqn ?? u.name).toLowerCase() === (t.fqn ?? t.name).toLowerCase()) === i);

/** Tipos de uma expressão simples no ponto `offset` do arquivo. */
export function expressionTypes(expr: string, at: number, text: string, context: FileContext, functions: FunctionDoc[], depth = 0): LocalType[] | undefined {
 expr = expr.trim(); if (!expr || depth > 4) return undefined;
 while (/^\(.*\)$/s.test(expr) && splitTop(expr.slice(1, -1), ')').length === 1) expr = expr.slice(1, -1).trim();
 const tern = ternary(expr);
 if (tern) { const a = expressionTypes(tern[1], at, text, context, functions, depth + 1); const b = expressionTypes(tern[2], at, text, context, functions, depth + 1); return a && b ? unique([...a, ...b]) : undefined; }
 if (/^null$/i.test(expr)) return [{ name: 'null' }];
 const created = /^new\s+(\\?[A-Za-z_][\w\\]*)\s*(\(.*\))?$/s.exec(expr);
 if (created && !/^(static|self|parent|class)$/i.test(created[1])) { const fqn = qualify(created[1], context, at); return [{ name: fqn.split('\\').pop()!, fqn }]; }
 const variable = /^\$([A-Za-z_]\w*)$/.exec(expr);
 if (variable) return variableTypes(text, at, variable[1], functions, context, depth + 1);
 const call = /^(\\?[A-Za-z_][\w\\]*)\s*\((.*)\)$/s.exec(expr);
 if (call) {
  const short = call[1].replace(/^\\/, '').split('\\').pop()!.toLowerCase();
  const fn = functions.find(f => f.name.toLowerCase() === short); if (!fn?.returnType) return undefined;
  const ret = fn.returnType.replace(/^\?/, '');
  if (fn.templates.includes(ret)) {
   const index = fn.params.findIndex(p => fn.paramTypes[p] === ret); if (index < 0) return undefined;
   const arg = splitTop(call[2], ',')[index]; if (arg === undefined) return undefined;
   const found = expressionTypes(arg, at, text, context, functions, depth + 1);
   return found && fn.returnType.startsWith('?') ? unique([...found, { name: 'null' }]) : found;
  }
 }
 return undefined;
}

/** Última atribuição `$name = expr;` antes de `offset` (inclusive na mesma instrução). */
export function variableTypes(text: string, offset: number, name: string, functions: FunctionDoc[] = functionDocs(text), context: FileContext = analyze(text), depth = 0): LocalType[] | undefined {
 const code = codeOnly(text); const re = new RegExp(`\\$${name}\\s*=(?![=>])`, 'g'); let last: RegExpExecArray | undefined;
 for (let m = re.exec(code); m && m.index <= offset; m = re.exec(code)) last = m;
 if (!last) return undefined;
 const start = last.index + last[0].length; let end = start, d = 0;
 for (; end < code.length; end++) { const c = code[end]; if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) { if (d === 0) break; d--; } else if (c === ';' && d === 0) break; }
 return expressionTypes(text.slice(start, end), start, text, context, functions, depth);
}

export const typeLabel = (types: LocalType[]) => types.map(t => t.name).join('|');

/** Chamadas `$var->name(` no arquivo, com o offset do nome do método. */
export function memberCalls(text: string, method: string): { variable: string; offset: number }[] {
 const code = codeOnly(text); const out: { variable: string; offset: number }[] = [];
 const re = new RegExp(`\\$([A-Za-z_]\\w*)\\s*\\??->\\s*(${method})\\s*\\(`, 'gi');
 for (let m = re.exec(code); m; m = re.exec(code)) out.push({ variable: m[1], offset: m.index + m[0].lastIndexOf(m[2]) });
 return out;
}
