// Hierarquia léxica de classes PHP: extends/implements, traits com `insteadof`/`as`
// e métodos declarados. Complementa o servidor de linguagem nos pontos em que ele
// não resolve adaptações de trait e alimenta os marcadores de override/implement
// do gutter. Requisito próprio; não é parser completo (sem tipos nem expressões).
import { analyze, namespaceAt, phpTokens, type PhpToken, type FileContext } from './php-source';

export type PhpMethod = { name: string; offset: number; visibility: 'public' | 'protected' | 'private'; isStatic: boolean; isAbstract: boolean; returnType?: string };
export type TraitRule =
 | { kind: 'insteadof'; trait: string; method: string; excluded: string[] }
 | { kind: 'as'; trait?: string; method: string; alias?: string; visibility?: PhpMethod['visibility'] };
export type PhpClass = {
 name: string; fqn: string; kind: 'class' | 'interface' | 'trait' | 'enum'; offset: number; isAbstract: boolean;
 extends: string[]; implements: string[]; traits: string[]; rules: TraitRule[]; methods: PhpMethod[]; path?: string;
};
export type ResolvedMethod = { owner: PhpClass; method: PhpMethod; alias?: string };

const isWord = (t?: PhpToken) => t?.type === 'word';
const modifiers = /^(public|protected|private|static|abstract|final|readonly)$/i;
const reserved = new Set(['self', 'static', 'parent']);

/** Nome qualificado relativo ao arquivo: `\A\B`, import, ou namespace atual. */
export function qualify(name: string, context: FileContext, offset: number): string {
 if (name.startsWith('\\')) return name.slice(1);
 if (reserved.has(name.toLowerCase())) return name;
 const [head, ...rest] = name.split('\\');
 const imported = context.imports.find(i => i.alias.toLowerCase() === head.toLowerCase());
 if (imported) return [imported.fqn, ...rest].join('\\');
 const namespace = namespaceAt(context, offset);
 return namespace ? `${namespace}\\${name}` : name;
}

/** Classes, interfaces, traits e enums do arquivo, com membros declarados. */
export function parseHierarchy(text: string, path?: string): PhpClass[] {
 const t = phpTokens(text).filter(x => x.type !== 'string');
 const context = analyze(text);
 const out: PhpClass[] = [];
 const readName = (from: number) => { let s = ''; let j = from; while (j < t.length && (t[j].value === '\\' || (isWord(t[j]) && (s === '' || s.endsWith('\\'))))) { s += t[j].value; j++; } return { s, j }; };
 const readList = (from: number, offset: number) => { const names: string[] = []; let j = from; for (;;) { const { s, j: n } = readName(j); if (!s) break; names.push(qualify(s, context, offset)); j = n; if (t[j]?.value !== ',') break; j++; } return { names, j }; };
 let depth = 0; let current: { cls: PhpClass; depth: number } | undefined;
 for (let k = 0; k < t.length; k++) {
  const v = t[k].value; const low = v.toLowerCase(); const prev = t[k - 1]?.value.toLowerCase();
  if (v === '{') { depth++; continue; }
  if (v === '}') { depth = Math.max(0, depth - 1); if (current && depth === current.depth) current = undefined; continue; }
  if (!current && /^(class|interface|trait|enum)$/.test(low) && prev !== '::' && prev !== '->' && prev !== 'new' && isWord(t[k + 1])) {
   const id = t[k + 1]; if (/^(extends|implements)$/i.test(id.value)) continue;
   if (low === 'enum' && !/^[{:]$|^implements$/i.test(t[k + 2]?.value ?? '')) continue;
   const namespace = namespaceAt(context, id.offset);
   let isAbstract = false; for (let b = k - 1; b >= 0 && /^(abstract|final|readonly)$/i.test(t[b].value); b--) if (t[b].value.toLowerCase() === 'abstract') isAbstract = true;
   const cls: PhpClass = { name: id.value, fqn: namespace ? `${namespace}\\${id.value}` : id.value, kind: low as PhpClass['kind'], offset: id.offset, isAbstract: isAbstract || low === 'interface', extends: [], implements: [], traits: [], rules: [], methods: [], ...(path ? { path } : {}) };
   let j = k + 2;
   while (j < t.length && t[j].value !== '{') {
    const word = t[j].value.toLowerCase();
    if (word === 'extends') { const r = readList(j + 1, id.offset); cls.extends = r.names; j = r.j; continue; }
    if (word === 'implements') { const r = readList(j + 1, id.offset); cls.implements = r.names; j = r.j; continue; }
    j++;
   }
   if (j >= t.length) break;
   out.push(cls); depth++; current = { cls, depth: depth - 1 }; k = j; continue;
  }
  if (!current || depth !== current.depth + 1) continue;
  const cls = current.cls;
  if (low === 'use' && cls.kind !== 'interface') {
   const r = readList(k + 1, t[k].offset); cls.traits.push(...r.names); let j = r.j;
   if (t[j]?.value === '{') {
    j++;
    while (j < t.length && t[j].value !== '}') {
     const { s: first, j: a } = readName(j); let trait: string | undefined; let method = first; let n = a;
     if (t[n]?.value === '::') { trait = qualify(first, context, t[j].offset); method = t[n + 1]?.value ?? ''; n += 2; }
     const op = t[n]?.value.toLowerCase();
     if (op === 'insteadof' && trait) { const r2 = readList(n + 1, t[n].offset); cls.rules.push({ kind: 'insteadof', trait, method, excluded: r2.names }); n = r2.j; }
     else if (op === 'as') {
      let visibility: PhpMethod['visibility'] | undefined; let alias: string | undefined; n++;
      if (/^(public|protected|private)$/i.test(t[n]?.value ?? '')) { visibility = t[n].value.toLowerCase() as PhpMethod['visibility']; n++; }
      if (isWord(t[n]) && t[n].value !== ';') { alias = t[n].value; n++; }
      cls.rules.push({ kind: 'as', ...(trait ? { trait } : {}), method, ...(alias ? { alias } : {}), ...(visibility ? { visibility } : {}) });
     }
     while (n < t.length && t[n].value !== ';' && t[n].value !== '}') n++;
     j = t[n]?.value === ';' ? n + 1 : n;
    }
    // Pula o `}` das adaptações: ele não fecha o corpo da classe.
    k = j;
   } else k = j;
   continue;
  }
  if (low === 'function' && prev !== '->' && prev !== '::') {
   let n = k + 1; if (t[n]?.value === '&') n++;
   if (!isWord(t[n])) continue;
   let visibility: PhpMethod['visibility'] = 'public'; let isStatic = false; let isAbstract = cls.kind === 'interface';
   for (let b = k - 1; b >= 0 && modifiers.test(t[b].value); b--) { const m = t[b].value.toLowerCase(); if (m === 'static') isStatic = true; else if (m === 'abstract') isAbstract = true; else if (/^(public|protected|private)$/.test(m)) visibility = m as PhpMethod['visibility']; }
   // Tipo de retorno declarado (`): tipo`), como texto; ausente quando não há.
   let p = n + 1, open = 0; for (; p < t.length; p++) { if (t[p].value === '(') open++; else if (t[p].value === ')' && --open === 0) break; }
   let returnType = ''; if (t[p + 1]?.value === ':') for (let r = p + 2; r < t.length && t[r].value !== '{' && t[r].value !== ';'; r++) returnType += t[r].value;
   cls.methods.push({ name: t[n].value, offset: t[n].offset, visibility, isStatic, isAbstract, ...(returnType ? { returnType } : {}) });
  }
 }
 return out;
}

export class PhpHierarchy {
 private byFqn = new Map<string, PhpClass[]>();
 constructor(classes: Iterable<PhpClass> = []) { for (const c of classes) this.add(c); }
 add(cls: PhpClass) { const key = cls.fqn.toLowerCase(); this.byFqn.set(key, [...(this.byFqn.get(key) ?? []).filter(c => c.path !== cls.path || !cls.path), cls]); }
 /** Remove declarações de um arquivo (reindexação incremental). */
 removePath(path: string) { for (const [key, list] of this.byFqn) { const kept = list.filter(c => c.path !== path); if (kept.length) this.byFqn.set(key, kept); else this.byFqn.delete(key); } }
 get(fqn: string): PhpClass | undefined { return this.byFqn.get(fqn.replace(/^\\/, '').toLowerCase())?.[0]; }
 all(): PhpClass[] { return [...this.byFqn.values()].flat(); }
 /** Resolve nome curto vindo de hover (sem namespace): import/namespace do arquivo, ou único candidato. */
 resolveShort(name: string, context: FileContext, offset: number): PhpClass | undefined {
  const direct = this.get(qualify(name, context, offset)); if (direct) return direct;
  const candidates = this.all().filter(c => c.name.toLowerCase() === name.replace(/^\\/, '').toLowerCase());
  return candidates.length === 1 ? candidates[0] : undefined;
 }

 /** Método visível por `name` em `fqn`: próprios, traits (com adaptações), pai e, por fim, contratos. */
 resolveMethod(fqn: string, name: string, seen = new Set<string>()): ResolvedMethod | undefined {
  const cls = this.get(fqn); if (!cls || seen.has(cls.fqn.toLowerCase())) return undefined; seen.add(cls.fqn.toLowerCase());
  const low = name.toLowerCase();
  const own = cls.methods.find(m => m.name.toLowerCase() === low); if (own) return { owner: cls, method: own };
  const fromTraits = this.traitMethod(cls, low, seen); if (fromTraits) return fromTraits;
  for (const parent of cls.kind === 'interface' ? [] : cls.extends) { const found = this.resolveMethod(parent, name, new Set(seen)); if (found) return found; }
  for (const contract of cls.kind === 'interface' ? cls.extends : cls.implements) { const found = this.resolveMethod(contract, name, new Set(seen)); if (found) return found; }
  return undefined;
 }

 private traitMethod(cls: PhpClass, low: string, seen: Set<string>): ResolvedMethod | undefined {
  for (const rule of cls.rules) {
   if (rule.kind !== 'as' || rule.alias?.toLowerCase() !== low) continue;
   const traits = rule.trait ? [rule.trait] : cls.traits;
   for (const trait of traits) { const found = this.resolveMethod(trait, rule.method, new Set(seen)); if (found) return { ...found, alias: rule.alias }; }
  }
  for (const trait of cls.traits) {
   const excluded = cls.rules.some(r => r.kind === 'insteadof' && r.method.toLowerCase() === low && r.excluded.some(e => e.toLowerCase() === trait.toLowerCase()));
   if (excluded) continue;
   const found = this.resolveMethod(trait, low, new Set(seen)); if (found) return found;
  }
  return undefined;
 }

 /** Nomes de métodos acessíveis por alias de trait (`X::m as alias`), que completion do servidor pode omitir. */
 aliases(fqn: string, seen = new Set<string>()): { alias: string; visibility: PhpMethod['visibility']; target: ResolvedMethod }[] {
  const cls = this.get(fqn); if (!cls || seen.has(cls.fqn.toLowerCase())) return []; seen.add(cls.fqn.toLowerCase());
  const out: { alias: string; visibility: PhpMethod['visibility']; target: ResolvedMethod }[] = [];
  for (const rule of cls.rules) if (rule.kind === 'as' && rule.alias) { const target = this.resolveMethod(cls.fqn, rule.alias); if (target) out.push({ alias: rule.alias, visibility: rule.visibility ?? target.method.visibility, target }); }
  for (const parent of cls.extends) out.push(...this.aliases(parent, seen).filter(a => !out.some(o => o.alias.toLowerCase() === a.alias.toLowerCase())));
  return out;
 }

 /** Ancestrais transitivos (pais, contratos e contratos herdados), sem o próprio tipo. */
 ancestors(fqn: string): PhpClass[] {
  const out: PhpClass[] = []; const seen = new Set<string>([fqn.toLowerCase()]);
  const visit = (name: string) => { const cls = this.get(name); if (!cls) return; for (const next of [...cls.extends, ...cls.implements]) { if (seen.has(next.toLowerCase())) continue; seen.add(next.toLowerCase()); const found = this.get(next); if (found) { out.push(found); visit(found.fqn); } } };
  visit(fqn); return out;
 }

 /** Subtipos transitivos (classes que estendem ou implementam). */
 descendants(fqn: string): PhpClass[] {
  const out: PhpClass[] = []; const seen = new Set<string>([fqn.toLowerCase()]); const queue = [fqn.toLowerCase()];
  while (queue.length) { const current = queue.shift()!; for (const c of this.all()) { if (seen.has(c.fqn.toLowerCase()) || ![...c.extends, ...c.implements].some(n => n.toLowerCase() === current)) continue; seen.add(c.fqn.toLowerCase()); out.push(c); queue.push(c.fqn.toLowerCase()); } }
  return out;
 }
}

export type MarkerTarget = { cls: PhpClass; method?: PhpMethod };
export type HierarchyMarker = { offset: number; name: string; kind: 'overrides' | 'implements' | 'overridden' | 'implemented' | 'subclassed'; targets: MarkerTarget[] };

/** Marcadores de gutter para as declarações de `classes` (normalmente o arquivo aberto). */
export function hierarchyMarkers(classes: PhpClass[], index: PhpHierarchy): HierarchyMarker[] {
 const out: HierarchyMarker[] = [];
 for (const cls of classes) {
  if (cls.kind === 'trait') continue;
  const ancestors = index.ancestors(cls.fqn); const descendants = index.descendants(cls.fqn);
  if (descendants.length) out.push({ offset: cls.offset, name: cls.name, kind: cls.kind === 'interface' ? 'implemented' : 'subclassed', targets: descendants.map(c => ({ cls: c })) });
  for (const method of cls.methods) {
   if (method.visibility === 'private' || method.name.toLowerCase() === '__construct') continue;
   const low = method.name.toLowerCase(); const up: MarkerTarget[] = [];
   // Só o método mais próximo na cadeia de classes; contratos aparecem todos.
   const inherited = cls.kind === 'interface' ? undefined : cls.extends.map(p => index.resolveMethod(p, method.name)).find(r => r && r.owner.kind !== 'interface' && r.method.visibility !== 'private');
   if (inherited) up.push({ cls: inherited.owner, method: inherited.method });
   for (const ancestor of ancestors) {
    if (ancestor.kind !== 'interface') continue;
    const found = ancestor.methods.find(m => m.name.toLowerCase() === low);
    if (found) up.push({ cls: ancestor, method: found });
   }
   const implementsOnly = up.every(u => u.method!.isAbstract);
   if (up.length) out.push({ offset: method.offset, name: method.name, kind: implementsOnly && cls.kind !== 'interface' ? 'implements' : 'overrides', targets: up });
   const down = descendants.flatMap(c => { const m = c.methods.find(m => m.name.toLowerCase() === low); return m ? [{ cls: c, method: m }] : []; });
   if (down.length) out.push({ offset: method.offset, name: method.name, kind: method.isAbstract ? 'implemented' : 'overridden', targets: down });
  }
 }
 return out;
}

/** Tipo de classe único no hover de variável do Phpactor (``variable x: `Ⓒ User` ``); união, mixed e desconhecido não viram tipo. */
export function hoverClassName(value: string): string | undefined {
 const type = /variable \$?\w+: `([^`]+)`/.exec(value)?.[1]; if (!type) return undefined;
 const names = type.replace(/[^\w\\|?]/g, '').replace(/^\?/, '').split('|').filter(n => n && n.toLowerCase() !== 'null');
 if (names.length !== 1 || /^(mixed|object|array|string|int|float|bool|callable|iterable|void|never|static|self)$/i.test(names[0])) return undefined;
 return names[0];
}

/** Método resolvido e se a resolução passou por `insteadof`/`as` (onde o servidor de linguagem erra). */
export function adaptedMethod(index: PhpHierarchy, fqn: string, name: string): { found: ResolvedMethod; adapted: boolean } | undefined {
 const found = index.resolveMethod(fqn, name); if (!found) return undefined;
 const low = name.toLowerCase(); const cls = index.get(fqn)!;
 const adapted = !!found.alias || [cls, ...index.ancestors(fqn)].some(c => c.rules.some(r => r.kind === 'insteadof' && r.method.toLowerCase() === low));
 return { found, adapted };
}
