import { codeOnly, namespaceAt, position, type FileContext } from './php-source';

/** Prefixo não qualificado quando o cursor está onde se espera um nome de classe. */
export function classContext(before: string): string | null {
 const tail = codeOnly(before).slice(-400);
 const m = /\bnew\s+([A-Za-z_\x80-￿][\w\x80-￿]*)?$/i.exec(tail)
  ?? /\b(?:instanceof|extends|insteadof)\s+([A-Za-z_\x80-￿][\w\x80-￿]*)?$/i.exec(tail)
  ?? /\bimplements\s+(?:[\w\\]+\s*,\s*)*([A-Za-z_\x80-￿][\w\x80-￿]*)?$/i.exec(tail)
  ?? /\bcatch\s*\(\s*(?:[\w\\]+\s*\|\s*)*([A-Za-z_\x80-￿][\w\x80-￿]*)?$/i.exec(tail);
 return m ? m[1] ?? '' : null;
}

/** Interpreta o detalhe do Phpactor, por exemplo `pub label(string $x): string`. */
export function signature(detail: string | undefined) {
 if (!detail) return { params: null as string | null, returns: null as string | null };
 const open = detail.indexOf('(');
 if (open < 0) { const m = /:\s*([^:]+)$/.exec(detail); return { params: null, returns: m ? m[1].trim() : null }; }
 let depth = 0; let close = -1;
 for (let i = open; i < detail.length; i++) { if (detail[i] === '(') depth++; else if (detail[i] === ')' && --depth === 0) { close = i; break; } }
 if (close < 0) return { params: null, returns: null };
 const m = /^\s*:\s*(.+)$/.exec(detail.slice(close + 1));
 return { params: detail.slice(open + 1, close).trim(), returns: m ? m[1].trim() : null };
}

export type TextEdit = { range: { start: { line: number; character: number }; end: { line: number; character: number } }; newText: string };

/** Como inserir uma classe no ponto do cursor: nome curto, alias existente, FQN ou novo `use`. */
export function classInsertion(text: string, offset: number, fqn: string, context: FileContext, localExists: (fqn: string) => boolean): { insert: string; edit?: TextEdit } {
 const namespace = namespaceAt(context, offset);
 const nsStart = [...context.namespaces].reverse().find(n => n.offset <= offset)?.offset ?? 0;
 const imports = context.imports.filter(i => i.offset >= nsStart && i.offset < offset);
 const lower = fqn.toLowerCase(); const short = fqn.split('\\').pop()!; const classNs = fqn.slice(0, -short.length - 1);
 const existing = imports.find(i => i.fqn.toLowerCase() === lower);
 if (existing) return { insert: existing.alias };
 const clash = imports.some(i => i.alias.toLowerCase() === short.toLowerCase()) ||
  (namespace !== classNs && namespace !== '' && localExists(`${namespace}\\${short}`));
 if (classNs.toLowerCase() === namespace.toLowerCase() && !clash) return { insert: short };
 if (clash || classNs === '') return { insert: namespace === '' && !clash ? short : '\\' + fqn };
 const code = codeOnly(text);
 let at: number; let newText: string;
 const last = imports.at(-1);
 if (last) { at = last.end; newText = `\nuse ${fqn};`; }
 else if (context.namespaces.length) { const semi = code.indexOf(';', nsStart); if (semi < 0 || semi > offset) return { insert: '\\' + fqn }; at = semi + 1; newText = `\n\nuse ${fqn};`; }
 else { const tag = text.indexOf('<?php'); if (tag < 0) return { insert: '\\' + fqn }; at = tag + 5; newText = `\n\nuse ${fqn};`; }
 const p = position(text, at);
 return { insert: short, edit: { range: { start: p, end: p }, newText } };
}
