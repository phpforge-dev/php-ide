// Família de um método na hierarquia do projeto: declarações com o mesmo nome em supertipos e
// subtipos ligados por extends/implements. Usada por Find Usages (método atual × método base),
// Go to Implementation e Rename de método. Requisito próprio, guiado pela observação C03/C04/C06
// do PhpStorm 2026.1.4 (docs/research/phpstorm-reference-2026-10-23.md); não reproduz algoritmo interno.
import type { PhpClass, PhpHierarchy, PhpMethod } from './php-hierarchy';

export type MethodRef = { cls: PhpClass; method: PhpMethod };
const own = (cls: PhpClass, low: string) => cls.methods.find(m => m.name.toLowerCase() === low && m.visibility !== 'private');

/** Declarações do método em `fqn` ou herdado por ele: a própria, bases (supertipos) e a família inteira. */
export function methodFamily(index: PhpHierarchy, fqn: string, name: string): { current?: MethodRef; bases: MethodRef[]; members: MethodRef[] } {
 const cls = index.get(fqn); const low = name.toLowerCase();
 if (!cls) return { bases: [], members: [] };
 const mine = own(cls, low); const current = mine ? { cls, method: mine } : undefined;
 const bases = index.ancestors(cls.fqn).filter(c => c.kind !== 'trait').flatMap(c => { const m = own(c, low); return m ? [{ cls: c, method: m }] : []; });
 // Topos: bases sem base própria (ou o próprio tipo); a família são eles e todos os subtipos que declaram o método.
 const tops = bases.length ? bases.filter(b => !index.ancestors(b.cls.fqn).some(a => own(a, low))) : current ? [current] : [];
 const seen = new Set<string>(); const members: MethodRef[] = [];
 const add = (ref: MethodRef) => { const key = ref.cls.fqn.toLowerCase(); if (seen.has(key)) return; seen.add(key); members.push(ref); };
 for (const top of tops) { add(top); for (const c of index.descendants(top.cls.fqn)) { const m = c.kind === 'trait' ? undefined : own(c, low); if (m) add({ cls: c, method: m }); } }
 if (current) add(current);
 return { current, bases, members };
}

/** Implementações a partir de uma declaração (`declaration`) ou de uma chamada resolvida para `fqn::name`. */
export function methodImplementations(index: PhpHierarchy, fqn: string, name: string, from: 'declaration' | 'call'): MethodRef[] {
 const resolved = index.resolveMethod(fqn, name); if (!resolved || resolved.owner.kind === 'trait') return [];
 const low = name.toLowerCase(); const target = { cls: resolved.owner, method: resolved.method };
 const below = index.descendants(target.cls.fqn).filter(c => c.kind !== 'trait' && c.kind !== 'interface').flatMap(c => { const m = own(c, low); return m && !m.isAbstract ? [{ cls: c, method: m }] : []; });
 // Na chamada, a declaração resolvida também é destino (abstrata ou concreta); na declaração, só os subtipos.
 const out = from === 'call' ? [target, ...below] : below;
 return out.sort((a, b) => a.cls.name.localeCompare(b.cls.name) || a.cls.fqn.localeCompare(b.cls.fqn));
}
