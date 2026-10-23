import { analyze, namespaceAt, phpTokens, position, type FileContext, type PhpToken } from '../php-source';
import { CompletionKind, type CodeCompletion, type PluginCompletion, type PluginDiagnostic, type PluginLocation, type ProjectFiles, type StringSite } from './api';
import type { PluginFix, PluginHover } from './extensions';

// Eloquent por análise léxica (DOC laravel.com/docs/eloquent*, migrations): modelos em `app/`,
// colunas das migrations em ordem de nome, casts, accessors, relações e scopes. Nada é executado.

export type Place = { file: string; line: number; character: number; length: number };
export type Column = Place & { name: string; type: string; nullable: boolean; table: string };
export type Relation = Place & { name: string; kind: string; related?: string; many: boolean };
export type Scope = Place & { name: string; method: string; params: string };
export type Accessor = Place & { name: string; method: string; type?: string };
export type Method = Place & { name: string; static: boolean; visibility: string; params: string; returns?: string };
export type Model = Place & {
 name: string; fqn: string; parent: string; table: string; softDeletes: boolean;
 fillable: string[]; hidden: string[]; casts: Map<string, string>;
 relations: Relation[]; scopes: Scope[]; accessors: Accessor[]; methods: Method[]; columns: Column[];
};
export type EloquentIndex = { models: Model[]; tables: Map<string, Column[]> };
/** Tipo de uma expressão: instância, classe (`User::`), Builder, relação ou coleção de modelos. */
export type EType = { kind: 'model' | 'static' | 'builder' | 'relation' | 'collection'; model: Model; relation?: Relation };

const bases = new Set(['illuminate\\database\\eloquent\\model', 'illuminate\\foundation\\auth\\user', 'illuminate\\database\\eloquent\\relations\\pivot', 'illuminate\\database\\eloquent\\relations\\morphpivot']);
const manyRelations = new Set(['hasMany', 'belongsToMany', 'morphMany', 'morphToMany', 'morphedByMany', 'hasManyThrough']);
const oneRelations = new Set(['hasOne', 'belongsTo', 'morphOne', 'morphTo', 'hasOneThrough']);

export const snake = (s: string) => s.replace(/([a-z\d])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
const studly = (s: string) => s.replace(/(?:^|_)([a-z\d])/g, (_, c: string) => c.toUpperCase());
const irregular: Record<string, string> = { person: 'people', child: 'children', man: 'men', woman: 'women', mouse: 'mice', goose: 'geese', ox: 'oxen', tooth: 'teeth', foot: 'feet' };
const uncountable = new Set(['data', 'equipment', 'information', 'media', 'news', 'series', 'species', 'feedback', 'metadata']);
export function plural(word: string) {
 if (uncountable.has(word)) return word;
 if (irregular[word]) return irregular[word];
 if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
 if (/(s|x|z|ch|sh)$/.test(word)) return word + 'es';
 return word + 's';
}
/** `Str::snake(Str::pluralStudly(classe))`: só a última palavra vai ao plural. */
export const tableName = (name: string) => { const parts = snake(name).split('_'); parts.push(plural(parts.pop()!)); return parts.join('_'); };

function matchClose(t: PhpToken[], open: number) {
 let depth = 0;
 for (let i = open; i < t.length; i++) {
  const v = t[i].type === 'punct' ? t[i].value : '';
  if (v === '(' || v === '[' || v === '{') depth++;
  else if ((v === ')' || v === ']' || v === '}') && --depth === 0) return i;
 }
 return t.length;
}
function matchOpen(t: PhpToken[], close: number) {
 let depth = 0;
 for (let i = close; i >= 0; i--) {
  const v = t[i].type === 'punct' ? t[i].value : '';
  if (v === ')' || v === ']' || v === '}') depth++;
  else if ((v === '(' || v === '[' || v === '{') && --depth === 0) return i;
 }
 return -1;
}
/** Argumentos de nível 0 entre `open` e o fechamento: intervalos [início, fim). */
function args(t: PhpToken[], open: number): [number, number][] {
 const close = matchClose(t, open); const out: [number, number][] = []; let depth = 0; let start = open + 1;
 for (let i = open + 1; i < close; i++) {
  const v = t[i].type === 'punct' ? t[i].value : '';
  if (v === '(' || v === '[' || v === '{') depth++;
  else if (v === ')' || v === ']' || v === '}') depth--;
  else if (v === ',' && depth === 0) { out.push([start, i]); start = i + 1; }
 }
 if (close > start) out.push([start, close]);
 return out;
}
/** Nome de classe terminando em `end` (inclusive), com `\` opcionais. */
function className(t: PhpToken[], end: number) {
 let name = ''; let i = end;
 while (i >= 0 && (t[i].type === 'word' || t[i].value === '\\') && (i === end || t[i].offset + t[i].value.length === t[i + 1].offset)) { name = t[i].value + name; i--; }
 return name;
}
/** `X::class` ou `\\A\\X::class` começando em `at`. */
function classAt(t: PhpToken[], at: number) {
 let j = at; let name = '';
 while (t[j] && (t[j].type === 'word' || t[j].value === '\\') && (j === at || t[j - 1].offset + t[j - 1].value.length === t[j].offset)) name += t[j++].value;
 return name && t[j]?.value === '::' && t[j + 1]?.value === 'class' ? name : undefined;
}

/** Resolve nome curto/qualificado pelo namespace e `use` do arquivo. */
function qualify(name: string, context: FileContext, offset: number) {
 if (name.startsWith('\\')) return name.slice(1);
 const [head, ...rest] = name.split('\\');
 const use = context.imports.find(i => i.alias.toLowerCase() === head.toLowerCase());
 if (use) return [use.fqn.replace(/^\\/, ''), ...rest].join('\\');
 const ns = namespaceAt(context, offset);
 return ns ? `${ns}\\${name}` : name;
}

type RawClass = { name: string; fqn: string; parent: string; file: string; text: string; tokens: PhpToken[]; open: number; close: number; context: FileContext; offset: number };

function castType(cast: string) {
 const c = cast.replace(/^\\/, '');
 const base = c.split(':')[0].toLowerCase();
 if (['int', 'integer', 'timestamp'].includes(base)) return 'int';
 if (['real', 'float', 'double'].includes(base)) return 'float';
 if (['decimal', 'string', 'encrypted', 'hashed'].includes(base)) return c.toLowerCase().startsWith('encrypted:') ? (c.slice(10) === 'collection' ? '\\Illuminate\\Support\\Collection' : c.slice(10) === 'object' ? 'object' : 'array') : 'string';
 if (['bool', 'boolean'].includes(base)) return 'bool';
 if (['array', 'json'].includes(base)) return 'array';
 if (base === 'object') return 'object';
 if (base === 'collection') return '\\Illuminate\\Support\\Collection';
 if (['date', 'datetime', 'custom_datetime'].includes(base)) return '\\Illuminate\\Support\\Carbon';
 if (['immutable_date', 'immutable_datetime', 'immutable_custom_datetime'].includes(base)) return '\\Carbon\\CarbonImmutable';
 if (/(^|\\)AsCollection$/.test(c)) return '\\Illuminate\\Support\\Collection';
 if (/(^|\\)AsArrayObject$/.test(c)) return '\\ArrayObject';
 return c; // enum ou classe de cast
}

const intColumns = new Set(['id', 'increments', 'bigIncrements', 'mediumIncrements', 'smallIncrements', 'tinyIncrements', 'integerIncrements', 'integer', 'bigInteger', 'mediumInteger', 'smallInteger', 'tinyInteger', 'unsignedInteger', 'unsignedBigInteger', 'unsignedMediumInteger', 'unsignedSmallInteger', 'unsignedTinyInteger', 'foreignId', 'year']);
const stringColumns = new Set(['string', 'char', 'text', 'tinyText', 'mediumText', 'longText', 'uuid', 'ulid', 'ipAddress', 'macAddress', 'enum', 'set', 'binary', 'foreignUuid', 'foreignUlid', 'time', 'timeTz', 'json', 'jsonb', 'decimal', 'unsignedDecimal', 'vector']);
const floatColumns = new Set(['float', 'double']);
const dateColumns = new Set(['date', 'dateTime', 'dateTimeTz', 'timestamp', 'timestampTz']);
const mixedColumns = new Set(['geometry', 'geography', 'point', 'polygon', 'lineString', 'multiPoint', 'multiPolygon', 'multiLineString', 'geometryCollection', 'computed']);
const carbon = '\\Illuminate\\Support\\Carbon';

/** Colunas criadas por `$table->metodo(...)` com tipo PHP lido sem cast. */
function columnsOf(method: string, t: PhpToken[], a: [number, number][], table: string, file: string, text: string, at: number, context: FileContext): Column[] {
 const first = a[0] && a[0][1] - a[0][0] === 1 && t[a[0][0]].type === 'string' ? a[0][0] : -1;
 const place = (i: number, length: number) => ({ file, ...position(text, t[i].offset), length });
 const column = (name: string, type: string, i: number, nullable = false) => ({ name, type, nullable, table, ...place(i, i === at ? 1 + 'table'.length : name.length + 2) });
 if (method === 'id') return [column(first >= 0 ? t[first].value : 'id', 'int', first >= 0 ? first : at)];
 if (method === 'timestamps' || method === 'timestampsTz' || method === 'nullableTimestamps') return ['created_at', 'updated_at'].map(n => column(n, carbon, at, true));
 if (method === 'softDeletes' || method === 'softDeletesTz') return [column(first >= 0 ? t[first].value : 'deleted_at', carbon, first >= 0 ? first : at, true)];
 if (method === 'rememberToken') return [column('remember_token', 'string', at, true)];
 if (method === 'foreignIdFor') {
  const cls = a[0] ? classAt(t, a[0][0]) : undefined;
  const own = a[1] && t[a[1][0]].type === 'string' ? a[1][0] : -1;
  if (own >= 0) return [column(t[own].value, 'int', own)];
  return cls ? [column(`${snake(qualify(cls, context, t[a[0][0]].offset).split('\\').pop()!)}_id`, 'int', a[0][0])] : [];
 }
 if (/^(nullable|uuid|ulid|numeric)?Morphs$|^morphs$/i.test(method) && first >= 0) {
  const name = t[first].value; const nullable = method.startsWith('nullable');
  return [column(`${name}_id`, /uuid|ulid/i.test(method) ? 'string' : 'int', first, nullable), column(`${name}_type`, 'string', first, nullable)];
 }
 if (first < 0) return [];
 const type = intColumns.has(method) ? 'int' : stringColumns.has(method) ? 'string' : floatColumns.has(method) ? 'float' : method === 'boolean' ? 'bool' : dateColumns.has(method) ? carbon : mixedColumns.has(method) ? 'mixed' : '';
 return type ? [column(t[first].value, type, first)] : [];
}

/** Aplica as migrations em ordem de nome de arquivo: `Schema::create/table/rename/drop`. */
export function applyMigration(tables: Map<string, Column[]>, text: string, file: string) {
 const t = phpTokens(text); const context = analyze(text);
 for (let i = 0; i < t.length; i++) {
  if (t[i].value !== 'Schema' || t[i + 1]?.value !== '::' || t[i + 3]?.value !== '(') continue;
  const op = t[i + 2].value; const a = args(t, i + 3);
  const name = a[0] && t[a[0][0]].type === 'string' ? t[a[0][0]].value : undefined;
  if (!name) continue;
  if (op === 'drop' || op === 'dropIfExists') { tables.delete(name); continue; }
  if (op === 'rename') { const to = a[1] && t[a[1][0]].type === 'string' ? t[a[1][0]].value : undefined; if (to) { tables.set(to, (tables.get(name) ?? []).map(c => ({ ...c, table: to }))); tables.delete(name); } continue; }
  if (op !== 'create' && op !== 'table') continue;
  const fn = a[1]?.[0]; if (fn === undefined || !['function', 'fn', 'static'].includes(t[fn].value)) continue;
  const paren = t.findIndex((x, k) => k >= fn && x.value === '(');
  const varAt = t.findIndex((x, k) => k > paren && x.value === '$');
  const variable = t[varAt + 1]?.value;
  const body = t.findIndex((x, k) => k > matchClose(t, paren) && (x.value === '{' || x.value === '=>'));
  const end = t[body]?.value === '{' ? matchClose(t, body) : a[1][1];
  let columns = op === 'create' ? [] : [...(tables.get(name) ?? [])];
  for (let k = body + 1; k < end; k++) {
   if (t[k].value !== '$' || t[k + 1]?.value !== variable || t[k + 2]?.value !== '->' || t[k + 4]?.value !== '(') continue;
   const method = t[k + 3].value; const ma = args(t, k + 4);
   const strings = ma.flatMap(([x, y]) => t.slice(x, y).filter(s => s.type === 'string').map(s => s.value));
   let next = matchClose(t, k + 4) + 1; const modifiers: string[] = [];
   while (t[next]?.value === '->' && t[next + 2]?.value === '(') { modifiers.push(t[next + 1].value); next = matchClose(t, next + 2) + 1; }
   if (method === 'dropColumn' || method === 'dropColumns') { columns = columns.filter(c => !strings.includes(c.name)); continue; }
   if (method === 'dropTimestamps' || method === 'dropTimestampsTz') { columns = columns.filter(c => c.name !== 'created_at' && c.name !== 'updated_at'); continue; }
   if (method === 'dropSoftDeletes' || method === 'dropSoftDeletesTz') { columns = columns.filter(c => c.name !== (strings[0] ?? 'deleted_at')); continue; }
   if (method === 'dropRememberToken') { columns = columns.filter(c => c.name !== 'remember_token'); continue; }
   if (method === 'renameColumn' && strings.length === 2) {
    const target = ma[1][0];
    columns = columns.map(c => c.name === strings[0] ? { ...c, name: strings[1], file, ...position(text, t[target].offset), length: strings[1].length + 2 } : c);
    continue;
   }
   const created = columnsOf(method, t, ma, name, file, text, k + 1, context).map(c => ({ ...c, nullable: c.nullable || modifiers.includes('nullable') }));
   for (const c of created) {
    const old = columns.findIndex(x => x.name === c.name);
    if (old >= 0 && modifiers.includes('change')) columns[old] = c; else if (old < 0) columns.push(c);
   }
  }
  tables.set(name, columns);
 }
}

function classes(text: string, file: string): RawClass[] {
 const t = phpTokens(text); const context = analyze(text); const out: RawClass[] = [];
 for (let i = 0; i < t.length; i++) {
  if (t[i].value !== 'class' || t[i + 1]?.type !== 'word' || t[i - 1]?.value === '::' || t[i - 1]?.value === 'new') continue;
  let j = i + 2; let parent = '';
  if (t[j]?.value === 'extends') { j++; while (t[j] && (t[j].type === 'word' || t[j].value === '\\') && t[j].value !== 'implements') parent += t[j++].value; }
  while (t[j] && t[j].value !== '{') j++;
  if (!t[j]) continue;
  const name = t[i + 1].value;
  out.push({ name, fqn: qualify(name, context, t[i].offset), parent: parent ? qualify(parent, context, t[i].offset) : '', file, text, tokens: t, open: j, close: matchClose(t, j), context, offset: t[i + 1].offset });
 }
 return out;
}

function pairs(t: PhpToken[], open: number) {
 const out: { key: string; value: string }[] = [];
 for (const [a, b] of args(t, open)) {
  if (t[a].type !== 'string' || t[a + 1]?.value !== '=>') continue;
  const value = t[a + 2]?.type === 'string' && b - a === 3 ? t[a + 2].value : classAt(t, a + 2) ?? t.slice(a + 2, b).map(x => x.value).join('');
  out.push({ key: t[a].value, value });
 }
 return out;
}
const listOf = (t: PhpToken[], open: number) => args(t, open).filter(([a, b]) => b - a === 1 && t[a].type === 'string').map(([a]) => t[a].value);

function model(raw: RawClass): Model {
 const { tokens: t, text, file, context } = raw;
 const place = (i: number, length: number) => ({ file, ...position(text, t[i].offset), length });
 const m: Model = { name: raw.name, fqn: raw.fqn, parent: raw.parent, table: tableName(raw.name), softDeletes: false, fillable: [], hidden: [], casts: new Map(), relations: [], scopes: [], accessors: [], methods: [], columns: [], file, ...position(text, raw.offset), length: raw.name.length };
 const typeName = (n: string) => qualify(n, context, raw.offset);
 for (let i = raw.open + 1; i < raw.close; i++) {
  const v = t[i].value;
  if (v === '{' || v === '(' || v === '[') { i = matchClose(t, i); continue; }
  if (v === 'use' && t[i + 1]?.type === 'word') { for (let j = i + 1; j < t.length && t[j].value !== ';' && t[j].value !== '{'; j++) if (t[j].value === 'SoftDeletes') m.softDeletes = true; continue; }
  if (v === '$' && t[i + 2]?.value === '=') {
   const prop = t[i + 1].value; const value = i + 3;
   if (prop === 'table' && t[value].type === 'string') m.table = t[value].value;
   else if (t[value].value === '[') {
    if (prop === 'fillable') m.fillable = listOf(t, value);
    else if (prop === 'hidden') m.hidden = listOf(t, value);
    else if (prop === 'casts') for (const p of pairs(t, value)) m.casts.set(p.key, p.value);
   }
   continue;
  }
  if (v !== 'function' || t[i + 1]?.type !== 'word' || t[i + 2]?.value !== '(') continue;
  const name = t[i + 1].value; const paren = i + 2; const closeParen = matchClose(t, paren);
  const modifiers: string[] = []; let k = i - 1;
  while (k > raw.open && ['public', 'protected', 'private', 'static', 'final', 'abstract'].includes(t[k].value)) modifiers.push(t[k--].value);
  const attributes = t[k]?.value === ']' ? t.slice(matchOpen(t, k), k).map(x => x.value) : [];
  let returns: string | undefined; let j = closeParen + 1;
  if (t[j]?.value === ':') { returns = ''; j++; while (t[j] && t[j].value !== '{' && t[j].value !== ';') returns += t[j++].value; }
  const bodyEnd = t[j]?.value === '{' ? matchClose(t, j) : j;
  const params = text.slice(t[paren].offset + 1, t[closeParen].offset).replace(/\s+/g, ' ').trim();
  const at = place(i + 1, name.length);
  m.methods.push({ name, static: modifiers.includes('static'), visibility: modifiers.find(x => ['public', 'protected', 'private'].includes(x)) ?? 'public', params, ...(returns ? { returns } : {}), ...at });
  const legacy = /^get([A-Z]\w*)Attribute$/.exec(name);
  if (legacy) { m.accessors.push({ name: snake(legacy[1]), method: name, ...(returns ? { type: returns } : {}), ...at }); continue; }
  if (returns && /(^|\\)\??Attribute$/.test(returns)) {
   const body = text.slice(t[j].offset, t[bodyEnd]?.offset ?? text.length);
   const get = /\bget\s*:\s*(?:static\s+)?(?:fn|function)\s*\([^)]*\)\s*(?:use\s*\([^)]*\)\s*)?:\s*(\??[\w\\|]+)/.exec(body);
   m.accessors.push({ name: snake(name), method: name, ...(get ? { type: get[1] } : {}), ...at });
   continue;
  }
  const scope = /^scope([A-Z]\w*)$/.exec(name);
  const rest = params.replace(/^[^,]*,?\s*/, '');
  if (scope) { m.scopes.push({ name: scope[1][0].toLowerCase() + scope[1].slice(1), method: name, params: rest, ...at }); continue; }
  if (attributes.includes('Scope')) { m.scopes.push({ name, method: name, params: rest, ...at }); continue; }
  if (name === 'casts') {
   for (let r = j; r < bodyEnd; r++) if (t[r].value === 'return' && t[r + 1]?.value === '[') { for (const p of pairs(t, r + 1)) m.casts.set(p.key, p.value); break; }
   continue;
  }
  for (let r = j; r < bodyEnd; r++) {
   if (t[r].value !== '$' || t[r + 1]?.value !== 'this' || t[r + 2]?.value !== '->' || t[r + 4]?.value !== '(') continue;
   const kind = t[r + 3].value;
   if (!manyRelations.has(kind) && !oneRelations.has(kind)) continue;
   const first = args(t, r + 4)[0];
   const related = first ? classAt(t, first[0]) ?? (t[first[0]].type === 'string' ? '\\' + t[first[0]].value : undefined) : undefined;
   m.relations.push({ name, kind, many: manyRelations.has(kind), ...(related ? { related: typeName(related) } : {}), ...at });
   break;
  }
 }
 return m;
}

/** Modelos de `app/` (herança resolvida entre arquivos) e tabelas das migrations. */
export async function eloquentIndex(files: ProjectFiles): Promise<EloquentIndex> {
 const raws: RawClass[] = [];
 for (const p of await files.list('app', n => n.endsWith('.php'))) raws.push(...classes((await files.read(p)) ?? '', p));
 const byFqn = new Map(raws.map(r => [r.fqn.toLowerCase(), r]));
 const isModel = (r: RawClass, seen = new Set<string>()): boolean => {
  const parent = r.parent.toLowerCase();
  if (!parent || seen.has(parent)) return false;
  if (bases.has(parent)) return true;
  seen.add(parent);
  const next = byFqn.get(parent);
  return next ? isModel(next, seen) : false;
 };
 const tables = new Map<string, Column[]>();
 for (const p of (await files.list('database/migrations', n => n.endsWith('.php'))).sort((a, b) => a.split('/').pop()!.localeCompare(b.split('/').pop()!))) applyMigration(tables, (await files.read(p)) ?? '', p);
 const models = raws.filter(r => isModel(r)).map(model);
 // Modelo filho herda membros declarados no modelo pai do projeto.
 for (const m of models) {
  const parent = models.find(p => p.fqn.toLowerCase() === m.parent.toLowerCase());
  if (parent) for (const key of ['relations', 'scopes', 'accessors', 'methods'] as const) (m[key] as Place[]).push(...(parent[key] as Place[]).filter(x => !(m[key] as { name: string }[]).some(y => y.name === (x as unknown as { name: string }).name)));
  m.columns = tables.get(m.table) ?? [];
 }
 return { models, tables };
}

// ---- Tipos de expressão ----

const builderChain = ['where', 'orWhere', 'whereNot', 'orWhereNot', 'whereIn', 'orWhereIn', 'whereNotIn', 'orWhereNotIn', 'whereNull', 'orWhereNull', 'whereNotNull', 'orWhereNotNull', 'whereBetween', 'orWhereBetween', 'whereNotBetween', 'whereColumn', 'orWhereColumn', 'whereDate', 'whereMonth', 'whereDay', 'whereYear', 'whereTime', 'whereLike', 'whereAny', 'whereAll', 'whereKey', 'whereKeyNot', 'whereHas', 'orWhereHas', 'whereDoesntHave', 'withWhereHas', 'whereRelation', 'whereBelongsTo', 'has', 'orHas', 'doesntHave', 'with', 'without', 'withCount', 'withSum', 'withAvg', 'withMax', 'withMin', 'withExists', 'withTrashed', 'onlyTrashed', 'withoutTrashed', 'select', 'addSelect', 'distinct', 'orderBy', 'orderByDesc', 'latest', 'oldest', 'inRandomOrder', 'reorder', 'groupBy', 'having', 'limit', 'take', 'skip', 'offset', 'forPage', 'when', 'unless', 'tap', 'join', 'leftJoin', 'lockForUpdate', 'sharedLock', 'withoutGlobalScope', 'withoutGlobalScopes', 'query', 'newQuery'];
const toModel = ['first', 'firstOrFail', 'firstOrNew', 'firstOrCreate', 'firstWhere', 'firstOr', 'find', 'findOrFail', 'findOrNew', 'sole', 'create', 'forceCreate', 'make', 'updateOrCreate', 'createOrFirst'];
const toCollection = ['get', 'all', 'findMany', 'paginate', 'simplePaginate', 'cursorPaginate', 'cursor', 'lazy'];
const builderScalar: [string, string][] = [['count', 'int'], ['exists', 'bool'], ['doesntExist', 'bool'], ['sum', 'mixed'], ['avg', 'mixed'], ['max', 'mixed'], ['min', 'mixed'], ['pluck', 'Collection'], ['value', 'mixed'], ['update', 'int'], ['delete', 'mixed'], ['increment', 'int'], ['decrement', 'int'], ['chunk', 'bool'], ['each', 'bool'], ['insert', 'bool'], ['upsert', 'int'], ['toSql', 'string'], ['dd', 'never'], ['dump', 'static']];
const modelSelf = ['fresh', 'refresh', 'load', 'loadMissing', 'loadCount', 'fill', 'forceFill', 'replicate', 'setAttribute', 'setRelation', 'unsetRelation', 'makeHidden', 'makeVisible', 'append', 'touchOwners'];
const modelScalar: [string, string][] = [['save', 'bool'], ['update', 'bool'], ['delete', 'bool|null'], ['forceDelete', 'bool|null'], ['push', 'bool'], ['touch', 'bool'], ['toArray', 'array'], ['toJson', 'string'], ['getKey', 'mixed'], ['getAttribute', 'mixed'], ['getOriginal', 'mixed'], ['isDirty', 'bool'], ['isClean', 'bool'], ['wasChanged', 'bool'], ['getChanges', 'array'], ['is', 'bool'], ['isNot', 'bool'], ['relationLoaded', 'bool']];
const relationOwn: [string, string][] = [['save', 'Model|false'], ['saveMany', 'iterable'], ['createMany', 'Collection'], ['associate', 'Model'], ['dissociate', 'Model'], ['attach', 'void'], ['detach', 'int'], ['sync', 'array'], ['syncWithoutDetaching', 'array'], ['toggle', 'array'], ['updateExistingPivot', 'int'], ['getResults', 'mixed']];
const collectionToModel = ['first', 'last', 'find', 'firstWhere', 'sole', 'pop', 'shift', 'random', 'get', 'firstOrFail'];
const collectionSelf = ['filter', 'reject', 'where', 'whereIn', 'whereNotIn', 'whereNull', 'whereNotNull', 'sortBy', 'sortByDesc', 'sortKeys', 'values', 'unique', 'take', 'skip', 'slice', 'reverse', 'merge', 'each', 'load', 'loadMissing', 'fresh', 'except', 'only', 'diff', 'intersect', 'keyBy', 'shuffle', 'makeHidden', 'makeVisible', 'toQuery'];
const collectionScalar: [string, string][] = [['count', 'int'], ['isEmpty', 'bool'], ['isNotEmpty', 'bool'], ['map', 'Collection'], ['pluck', 'Collection'], ['groupBy', 'Collection'], ['contains', 'bool'], ['sum', 'mixed'], ['avg', 'mixed'], ['toArray', 'array'], ['modelKeys', 'array'], ['implode', 'string']];
/** Métodos do Builder cujo argumento é nome de coluna; `all`: qualquer argumento. */
export const columnArguments: Record<string, number[] | 'all'> = {
 where: [0], orWhere: [0], whereNot: [0], orWhereNot: [0], whereIn: [0], orWhereIn: [0], whereNotIn: [0], orWhereNotIn: [0], whereNull: 'all', orWhereNull: [0], whereNotNull: 'all', orWhereNotNull: [0],
 whereBetween: [0], orWhereBetween: [0], whereNotBetween: [0], whereDate: [0], whereMonth: [0], whereDay: [0], whereYear: [0], whereTime: [0], whereLike: [0], firstWhere: [0],
 whereColumn: 'all', orWhereColumn: 'all', select: 'all', addSelect: 'all', groupBy: 'all', orderBy: [0], orderByDesc: [0], latest: [0], oldest: [0], pluck: [0, 1], value: [0],
 increment: [0], decrement: [0], sum: [0], avg: [0], max: [0], min: [0],
};
export const relationArguments: Record<string, number[] | 'all'> = {
 with: 'all', without: 'all', withCount: 'all', load: 'all', loadMissing: 'all', loadCount: 'all', has: [0], orHas: [0], doesntHave: [0], whereHas: [0], orWhereHas: [0],
 whereDoesntHave: [0], withWhereHas: [0], whereRelation: [0], withSum: [0], withAvg: [0], withMax: [0], withMin: [0], withExists: 'all', relationLoaded: [0],
};
const accepts = (table: Record<string, number[] | 'all'>, method: string, argument: number) => { const a = table[method]; return a === 'all' || (a?.includes(argument) ?? false); };

/** `whereEmailAndName` → colunas do `where` dinâmico (Builder::dynamicWhere). */
function dynamicWhere(method: string, model: Model) {
 const m = /^(?:or)?[wW]here([A-Z]\w*)$/.exec(method); if (!m) return null;
 const names = m[1].split(/And(?=[A-Z])|Or(?=[A-Z])/).map(snake);
 return names.every(n => model.columns.some(c => c.name === n)) ? names : null;
}

export type Lookup = { tokens: PhpToken[]; text: string; context: FileContext; index: EloquentIndex; offset: number; view?: (name: string) => string | undefined };

export function findModel(index: EloquentIndex, name: string, context?: FileContext, offset = 0) {
 const clean = name.replace(/^\?/, '').replace(/\|null$/, '');
 const fqn = (context && !clean.startsWith('\\') ? qualify(clean, context, offset) : clean.replace(/^\\/, '')).toLowerCase();
 const exact = index.models.find(m => m.fqn.toLowerCase() === fqn);
 if (exact) return exact;
 const short = clean.split('\\').pop()!.toLowerCase();
 const same = index.models.filter(m => m.name.toLowerCase() === short);
 return same.length === 1 ? same[0] : undefined;
}
function enclosing(l: Lookup, at: number) {
 const decl = l.context.declarations.filter(d => d.kind === 'class' && d.offset <= at).at(-1);
 return decl ? l.index.models.find(m => m.fqn.toLowerCase() === decl.fqn.toLowerCase()) : undefined;
}

type Step = { name: string; call: boolean; index?: boolean };
type Base = { var: string; at: number } | { class: string; at: number } | { new: string; at: number };

/** Cadeia que termina no token `last`: base (`$x`, `User::`, `new User`) e passos `->a`, `->b()`, `[0]`. */
function chainEnding(t: PhpToken[], last: number): { base: Base; steps: Step[] } | null {
 const steps: Step[] = []; let j = last;
 for (let guard = 0; guard < 64 && j >= 0; guard++) {
  const tok = t[j];
  if (tok.value === ')') {
   const o = matchOpen(t, j); if (o < 0) return null;
   const name = t[o - 1];
   if (name?.type === 'word') {
    const acc = t[o - 2]?.value;
    if (acc === '->' || acc === '::') {
     steps.unshift({ name: name.value, call: true });
     if (acc === '::') return { base: { class: className(t, o - 3), at: o - 3 }, steps };
     j = o - 3; if (t[j]?.value === '?') j--; continue;
    }
    if (acc === 'new' || t[o - 2]?.value === '\\') { const cls = className(t, o - 1); return { base: { new: cls, at: o - 1 }, steps }; }
    return null;
   }
   if (t[o + 1]?.value === 'new') { let k = o + 2; let cls = ''; while (t[k] && (t[k].type === 'word' || t[k].value === '\\')) cls += t[k++].value; return { base: { new: cls, at: o + 2 }, steps }; }
   return null;
  }
  if (tok.value === ']') { const o = matchOpen(t, j); if (o < 1) return null; steps.unshift({ name: '', call: false, index: true }); j = o - 1; continue; }
  if (tok.type === 'word') {
   const prev = t[j - 1]?.value;
   if (prev === '$') return { base: { var: tok.value, at: j - 1 }, steps };
   const cls = className(t, j); const before = t[j - cls.split(/(?=\\)|(?<=\\)/).length]?.value;
   if (before === 'new') return { base: { new: cls, at: j }, steps };
   if (prev === '->') { steps.unshift({ name: tok.value, call: false }); j -= 2; if (t[j]?.value === '?') j--; continue; }
   return null;
  }
  return null;
 }
 return null;
}

function element(type: EType | null): EType | null {
 if (!type) return null;
 if (type.kind === 'collection') return { kind: 'model', model: type.model };
 return null;
}

function variable(l: Lookup, name: string, before: number, depth: number): EType | null {
 const t = l.tokens; const model = (n: string, at: number) => findModel(l.index, n, l.context, at);
 for (let i = before - 1; i >= 0; i--) {
  if (t[i].value === '$' && t[i + 1]?.value === name) {
   if (t[i + 2]?.value === '=' && !(t[i + 3]?.value === '=' && t[i + 3].offset === t[i + 2].offset + 1)) {
    let e = i + 3; let depthLevel = 0;
    for (; e < before; e++) {
     const v = t[e].value;
     if (v === '(' || v === '[' || v === '{') depthLevel++;
     else if (v === ')' || v === ']' || v === '}') { if (depthLevel === 0) break; depthLevel--; }
     else if ((v === ';' || v === ',') && depthLevel === 0) break;
    }
    if (e <= i + 3) continue;
    return expression(l, e - 1, depth + 1);
   }
   // foreach (EXPR as $x) / foreach (EXPR as $k => $x)
   const as = t[i - 1]?.value === 'as' ? i - 1 : t[i - 1]?.value === '=>' && t[i - 4]?.value === 'as' ? i - 4 : -1;
   if (as > 0) return element(expression(l, as - 1, depth + 1));
   const hint = t[i - 1];
   if (hint?.type === 'word' && !['as', 'global', 'static', 'return', 'echo', 'new', 'use'].includes(hint.value)) {
    const cls = className(t, i - 1); const found = model(cls, t[i - 1].offset);
    if (found) return { kind: 'model', model: found };
    if (/(^|\\)Builder$/.test(cls)) { const own = enclosing(l, t[i].offset); if (own) return { kind: 'builder', model: own }; }
   }
  }
 }
 const doc = [...l.text.slice(0, t[before]?.offset ?? l.offset).matchAll(new RegExp(`@var\\s+(\\\\?[\\w\\\\]+)(\\[\\])?\\s+\\$${name}\\b`, 'g'))].at(-1);
 if (doc) { const found = model(doc[1], doc.index!); if (found) return { kind: doc[2] ? 'collection' : 'model', model: found }; }
 const viewType = l.view?.(name);
 if (viewType) { const found = findModel(l.index, viewType); if (found) return { kind: 'model', model: found }; }
 return null;
}

function baseType(l: Lookup, base: Base, depth: number): EType | null {
 if ('var' in base) {
  if (base.var === 'this') { const own = enclosing(l, l.tokens[base.at].offset); return own ? { kind: 'model', model: own } : null; }
  return depth > 6 ? null : variable(l, base.var, base.at, depth);
 }
 const name = 'class' in base ? base.class : base.new;
 const at = l.tokens[base.at]?.offset ?? 0;
 const found = ['static', 'self', 'parent'].includes(name.toLowerCase()) ? enclosing(l, at) : findModel(l.index, name, l.context, at);
 if (!found) return null;
 return { kind: 'class' in base ? 'static' : 'model', model: found };
}

function related(index: EloquentIndex, relation: Relation) { return relation.related ? findModel(index, '\\' + relation.related) : undefined; }

/** Tipo após aplicar um passo da cadeia (`->x`, `->x()`, `[i]`). */
export function apply(index: EloquentIndex, type: EType, s: Step): EType | null {
 const { model } = type;
 if (s.index) return element(type);
 if (type.kind === 'collection') {
  if (!s.call) return null;
  if (collectionToModel.includes(s.name)) return { kind: 'model', model };
  if (collectionSelf.includes(s.name)) return type;
  return null;
 }
 if (type.kind === 'model') {
  if (!s.call) {
   const relation = model.relations.find(r => r.name === s.name);
   const target = relation && related(index, relation);
   return target ? { kind: relation!.many ? 'collection' : 'model', model: target } : null;
  }
  const relation = model.relations.find(r => r.name === s.name);
  if (relation) { const target = related(index, relation); return target ? { kind: 'relation', model: target, relation } : null; }
  if (modelSelf.includes(s.name)) return type;
  if (s.name === 'query' || s.name === 'newQuery' || builderChain.includes(s.name) || model.scopes.some(x => x.name === s.name)) return { kind: 'builder', model };
  const own = model.methods.find(m => m.name === s.name);
  const ret = own?.returns && findModel(index, own.returns);
  return ret ? { kind: 'model', model: ret } : null;
 }
 if (!s.call) return null;
 // Builder, relação e chamada estática (`User::where`) se comportam como Builder do modelo.
 if (toModel.includes(s.name)) return { kind: 'model', model };
 if (toCollection.includes(s.name)) return { kind: 'collection', model };
 if (builderChain.includes(s.name) || model.scopes.some(x => x.name === s.name) || dynamicWhere(s.name, model)) return type.kind === 'relation' ? type : { kind: 'builder', model };
 if (type.kind === 'static') { const own = model.methods.find(m => m.name === s.name && m.static); const ret = own?.returns && findModel(index, own.returns); if (ret) return { kind: 'model', model: ret }; }
 return null;
}

/** Tipo da expressão que termina no token `last`. */
export function expression(l: Lookup, last: number, depth = 0): EType | null {
 const chain = chainEnding(l.tokens, last); if (!chain) return null;
 let type = baseType(l, chain.base, depth);
 for (const s of chain.steps) { if (!type) return null; type = apply(l.index, type, s); }
 return type;
}
/** Tipo do receptor de `->`/`::` no token `accessor`. */
export function receiver(l: Lookup, accessor: number): EType | null {
 const t = l.tokens;
 if (t[accessor].value === '::') {
  const cls = className(t, accessor - 1); if (!cls) return null;
  return baseType(l, { class: cls, at: accessor - 1 }, 0);
 }
 return expression(l, t[accessor - 1]?.value === '?' ? accessor - 2 : accessor - 1);
}

// ---- Apresentação ----

export const columnType = (model: Model, c: Column) => {
 const cast = model.casts.get(c.name);
 return (cast ? castType(cast) : c.type) + (c.nullable ? '|null' : '');
};
const short = (type: string) => type.replace(/^\\?(?:[\w]+\\)+/, '').replace(/\|null$/, '|null');
const relationType = (index: EloquentIndex, r: Relation) => {
 const target = related(index, r)?.name ?? r.related?.split('\\').pop() ?? 'Model';
 return r.many ? `Collection<${target}>` : `${target}|null`;
};

export type Member =
 | { kind: 'column'; name: string; column: Column; type: string }
 | { kind: 'accessor'; name: string; accessor: Accessor }
 | { kind: 'relation'; name: string; relation: Relation; call: boolean }
 | { kind: 'scope'; name: string; scope: Scope }
 | { kind: 'where'; name: string; columns: Column[] }
 | { kind: 'method'; name: string; method: Method };

/** Membro nomeado de um tipo (para navegação e hover). */
export function member(type: EType, name: string, call: boolean): Member | null {
 const { model } = type;
 if (type.kind === 'model') {
  if (!call) {
   const column = model.columns.find(c => c.name === name);
   if (column) return { kind: 'column', name, column, type: columnType(model, column) };
   const accessor = model.accessors.find(a => a.name === name);
   if (accessor) return { kind: 'accessor', name, accessor };
  }
  const relation = model.relations.find(r => r.name === name);
  if (relation) return { kind: 'relation', name, relation, call };
 }
 if (type.kind !== 'collection' && call) {
  const scope = model.scopes.find(s => s.name === name);
  if (scope && type.kind !== 'model') return { kind: 'scope', name, scope };
  const where = type.kind !== 'model' ? dynamicWhere(name, model) : null;
  if (where) return { kind: 'where', name, columns: where.map(n => model.columns.find(c => c.name === n)!) };
 }
 if (type.kind === 'model' || type.kind === 'static') {
  const method = model.methods.find(m => m.name === name && (type.kind === 'static' ? m.static || !m.name.startsWith('scope') : true));
  if (method && call) return { kind: 'method', name, method };
 }
 return null;
}

/** Itens de completion após `->`/`::` de um tipo Eloquent. */
export function members(index: EloquentIndex, type: EType, own = false): (PluginCompletion & { insertText?: string })[] {
 const { model } = type; const out: (PluginCompletion & { insertText?: string })[] = [];
 const method = (label: string, description?: string, detail?: string) => out.push({ label, kind: CompletionKind.Method, insertText: `${label}()`, ...(description ? { labelDetails: { description } } : {}), ...(detail ? { detail } : {}) });
 if (type.kind === 'model') {
  for (const c of model.columns) out.push({ label: c.name, kind: CompletionKind.Property, labelDetails: { description: short(columnType(model, c)) }, detail: `${c.table}.${c.name} · ${c.file}:${c.line + 1}` });
  for (const a of model.accessors) if (!out.some(o => o.label === a.name)) out.push({ label: a.name, kind: CompletionKind.Property, labelDetails: { description: a.type ? short(a.type) : 'mixed' }, detail: `${model.name}::${a.method}()` });
  for (const r of model.relations) out.push({ label: r.name, kind: CompletionKind.Property, labelDetails: { description: relationType(index, r) }, detail: `${r.kind} · ${model.name}::${r.name}()` });
  for (const r of model.relations) method(r.name, r.kind, `${model.name}::${r.name}()`);
  for (const m of model.methods) if ((own || m.visibility === 'public') && !m.static && !model.relations.some(r => r.name === m.name) && !/^scope[A-Z]/.test(m.name)) method(m.name, m.returns, `${model.name}::${m.name}(${m.params})`);
  for (const name of modelSelf) method(name, model.name);
  for (const [name, ret] of modelScalar) method(name, ret);
  if (model.softDeletes) { method('restore', 'bool'); method('trashed', 'bool'); }
 } else if (type.kind === 'collection') {
  for (const name of collectionToModel) method(name, `${model.name}|null`);
  for (const name of collectionSelf) method(name, `Collection<${model.name}>`);
  for (const [name, ret] of collectionScalar) method(name, ret);
 } else {
  if (type.kind === 'relation') for (const [name, ret] of relationOwn) method(name, ret);
  for (const s of model.scopes) method(s.name, 'scope', `${model.name}::${s.method}(${s.params})`);
  for (const name of toModel) method(name, model.name);
  for (const name of toCollection) method(name, `Collection<${model.name}>`);
  for (const name of builderChain) method(name, 'Builder');
  for (const [name, ret] of builderScalar) method(name, ret);
  for (const c of model.columns) method(`where${studly(c.name)}`, 'Builder', `where('${c.name}', …)`);
  if (type.kind === 'static') {
   for (const m of model.methods) if (m.static) method(m.name, m.returns);
   out.push({ label: 'class', kind: CompletionKind.Keyword });
  }
 }
 const seen = new Set<string>();
 return out.filter(i => { const key = `${i.kind}:${i.label}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

export const placeOf = (files: ProjectFiles, p: Place): PluginLocation => ({ uri: files.uri(p.file), range: { start: { line: p.line, character: p.character }, end: { line: p.line, character: p.character + p.length } } });

export function describe(index: EloquentIndex, model: Model, m: Member): string {
 const where = (p: Place) => `\`${p.file}:${p.line + 1}\``;
 if (m.kind === 'column') return `\`\`\`php\n${m.type} $${m.name}\n\`\`\`\nColuna \`${m.column.table}.${m.name}\` de ${model.name}${model.casts.has(m.name) ? ` · cast \`${model.casts.get(m.name)}\`` : ''}${model.fillable.includes(m.name) ? ' · fillable' : ''}${model.hidden.includes(m.name) ? ' · hidden' : ''}\n\nMigration ${where(m.column)}`;
 if (m.kind === 'accessor') return `\`\`\`php\n${m.accessor.type ?? 'mixed'} $${m.name}\n\`\`\`\nAccessor ${model.name}::${m.accessor.method}() · ${where(m.accessor)}`;
 if (m.kind === 'relation') return `\`\`\`php\n${m.call ? `${m.relation.kind}(): ${m.relation.related?.split('\\').pop() ?? 'Model'}` : `${relationType(index, m.relation)} $${m.name}`}\n\`\`\`\nRelação ${m.relation.kind} de ${model.name} · ${where(m.relation)}`;
 if (m.kind === 'scope') return `\`\`\`php\n${model.name}::${m.name}(${m.scope.params}): Builder\n\`\`\`\nLocal scope ${model.name}::${m.scope.method}() · ${where(m.scope)}`;
 if (m.kind === 'where') return `\`\`\`php\n${m.name}(mixed $value): Builder\n\`\`\`\nWhere dinâmico: ${m.columns.map(c => `\`${c.table}.${c.name}\``).join(', ')}`;
 return `\`\`\`php\n${m.method.name}(${m.method.params})${m.method.returns ? `: ${m.method.returns}` : ''}\n\`\`\`\n${model.name} · ${where(m.method)}`;
}
export const target = (m: Member): Place => m.kind === 'column' ? m.column : m.kind === 'accessor' ? m.accessor : m.kind === 'relation' ? m.relation : m.kind === 'scope' ? m.scope : m.kind === 'where' ? m.columns[0] : m.method;

// ---- Strings de coluna/relação ----

export type ColumnCall = { method: string; argument: number; type: EType };
/** Chamada `->metodo(` que contém a string em `start`, com tipo do receptor. */
export function callAround(l: Lookup, start: number): ColumnCall | null {
 const t = l.tokens; let i = t.findIndex(x => x.offset >= start); if (i < 0) i = t.length;
 let depth = 0; let argument = 0;
 for (i = i - 1; i >= 0; i--) {
  const v = t[i].type === 'punct' ? t[i].value : '';
  if (v === ')' || v === ']' || v === '}') depth++;
  else if (v === '[' && depth === 0) continue;
  else if (v === '(' || v === '[' || v === '{') { if (depth === 0) break; depth--; }
  else if (v === ',' && depth === 0) argument++;
  else if (v === ';' && depth === 0) return null;
 }
 if (i < 2 || t[i - 1].type !== 'word' || (t[i - 2].value !== '->' && t[i - 2].value !== '::')) return null;
 const type = receiver(l, i - 2); if (!type || type.kind === 'collection') return null;
 return { method: t[i - 1].value, argument, type };
}

const relationPath = (value: string) => value.split(/\s+as\s+/i)[0].split(':')[0];
/** Relação (`posts.comments`) percorrendo modelos; null se algum trecho não existir. */
export function relationChain(index: EloquentIndex, model: Model, path: string) {
 const out: { relation: Relation; model: Model }[] = []; let current: Model | undefined = model;
 for (const part of path.split('.')) {
  const relation = current?.relations.find(r => r.name === part);
  if (!relation || !current) return null;
  out.push({ relation, model: current });
  current = related(index, relation);
 }
 return out;
}

export function stringKind(call: ColumnCall): 'column' | 'relation' | null {
 if (accepts(relationArguments, call.method, call.argument)) return 'relation';
 if (accepts(columnArguments, call.method, call.argument)) return 'column';
 return null;
}

export function completeColumnString(index: EloquentIndex, call: ColumnCall, prefix: string): PluginCompletion[] | null {
 const kind = stringKind(call); if (!kind) return null;
 const { model } = call.type;
 if (kind === 'column') return model.columns.map(c => ({ label: c.name, kind: CompletionKind.Field, labelDetails: { description: short(columnType(model, c)) }, detail: `${c.table} · ${c.file}:${c.line + 1}` }));
 const head = prefix.includes('.') ? prefix.slice(0, prefix.lastIndexOf('.')) : '';
 const chain = head ? relationChain(index, model, head) : [];
 if (!chain) return [];
 const owner = chain.length ? related(index, chain.at(-1)!.relation) : model;
 return (owner?.relations ?? []).map(r => ({ label: head ? `${head}.${r.name}` : r.name, kind: CompletionKind.Reference, labelDetails: { description: relationType(index, r) }, detail: `${r.kind} · ${owner!.name}::${r.name}()` }));
}

export function defineColumnString(index: EloquentIndex, call: ColumnCall, value: string): Place[] | null {
 const kind = stringKind(call); if (!kind) return null;
 const { model } = call.type;
 if (kind === 'column') { const c = model.columns.find(c => c.name === value.split('.').pop()); return c ? [c] : []; }
 const chain = relationChain(index, model, relationPath(value));
 return chain ? [chain.at(-1)!.relation] : [];
}

export function hoverColumnString(index: EloquentIndex, call: ColumnCall, value: string): string | null {
 const kind = stringKind(call); if (!kind) return null;
 const { model } = call.type;
 if (kind === 'column') { const c = model.columns.find(c => c.name === value); return c ? describe(index, model, { kind: 'column', name: c.name, column: c, type: columnType(model, c) }) : null; }
 const chain = relationChain(index, model, relationPath(value));
 return chain ? describe(index, chain.at(-1)!.model, { kind: 'relation', name: chain.at(-1)!.relation.name, relation: chain.at(-1)!.relation, call: true }) : null;
}

/** Distância de edição para sugerir troca em referências inexistentes. */
export function closest(value: string, candidates: string[]) {
 let best: string | undefined; let score = Infinity;
 for (const c of candidates) {
  const d = distance(value, c);
  if (d < score) { score = d; best = c; }
 }
 return best !== undefined && score <= Math.max(1, Math.floor(value.length / 3)) ? best : undefined;
}
function distance(a: string, b: string) {
 // Distância com transposição de vizinhos (OSA): `emial` → `email` custa 1.
 const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i || j ? (i ? (j ? 0 : i) : j) : 0));
 for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
  d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
 }
 return d[a.length][b.length];
}

/** Inspeções de colunas e relações em strings de chamadas do Builder. */
export function diagnoseStrings(l: Lookup, uri: string): (PluginDiagnostic & { fixes?: PluginFix[] })[] {
 const out: (PluginDiagnostic & { fixes?: PluginFix[] })[] = [];
 for (const s of l.tokens) {
  if (s.type !== 'string' || l.text[s.offset] === '"' && s.value.includes('$')) continue;
  const call = callAround(l, s.offset); if (!call) continue;
  const kind = stringKind(call); if (!kind) continue;
  const { model } = call.type;
  const range = { start: position(l.text, s.offset + 1), end: position(l.text, s.offset + 1 + s.value.length) };
  const replace = (value: string): PluginFix => ({ title: `Trocar por '${value}'`, edits: [{ uri, range, newText: value }] });
  if (kind === 'column') {
   if (!model.columns.length || !/^[A-Za-z_]\w*$/.test(s.value) || model.columns.some(c => c.name === s.value)) continue;
   const near = closest(s.value, model.columns.map(c => c.name));
   out.push({ range, code: 'laravel.column.missing', severity: 'warning', message: `Coluna '${s.value}' não existe na tabela '${model.table}' (${model.name}).`, ...(near ? { fixes: [replace(near)] } : {}) });
  } else {
   const path = relationPath(s.value); if (!/^[A-Za-z_][\w.]*$/.test(path) || relationChain(l.index, model, path)) continue;
   const parts = path.split('.'); let owner: Model | undefined = model;
   for (const part of parts.slice(0, -1)) { const r: Relation | undefined = owner?.relations.find(x => x.name === part); owner = r && related(l.index, r); }
   if (!owner) continue;
   const near = parts.length === 1 ? closest(path, owner.relations.map(r => r.name)) : undefined;
   out.push({ range, code: 'laravel.relation.missing', severity: 'warning', message: `Relação '${parts.at(-1)}' não existe em ${owner.name}.`, ...(near ? { fixes: [replace(s.value.replace(path, near))] } : {}) });
  }
 }
 return out;
}

/** Completion/navegação/hover de membros em `$x->`/`User::` (PHP e Blade). */
export function lookup(text: string, offset: number, blade: boolean, index: EloquentIndex, view?: (name: string) => string | undefined): Lookup {
 const code = text;
 return { tokens: phpTokens(code, blade), text: code, context: analyze(blade ? `<?php ${code}` : code), index, offset, ...(view ? { view } : {}) };
}

export function completeMember(l: Lookup, offset: number): CodeCompletion | null {
 const word = /[A-Za-z_]\w*$/.exec(l.text.slice(Math.max(0, offset - 200), offset))?.[0] ?? '';
 const from = offset - word.length;
 const t = l.tokens; let a = -1;
 for (let i = t.length - 1; i >= 0; i--) if (t[i].offset < from) { a = i; break; }
 if (a < 0 || (t[a].value !== '->' && t[a].value !== '::')) return null;
 if (t[a].offset + t[a].value.length !== from && l.text.slice(t[a].offset + t[a].value.length, from).trim()) return null;
 const type = receiver(l, a); if (!type) return null;
 const own = t[a - 1]?.value === 'this';
 return { from, items: members(l.index, type, own) };
}

/** Membro sob o cursor: palavra precedida de `->`/`::`, com o tipo do receptor. */
export function memberAt(l: Lookup, offset: number): { model: Model; member: Member } | null {
 const t = l.tokens;
 const i = t.findIndex(x => x.type === 'word' && x.offset <= offset && offset <= x.offset + x.value.length);
 if (i < 1 || (t[i - 1].value !== '->' && t[i - 1].value !== '::')) return null;
 const type = receiver(l, i - 1); if (!type) return null;
 const found = member(type, t[i].value, t[i + 1]?.value === '(');
 return found ? { model: type.model, member: found } : null;
}

/** Hover a partir de uma string de coluna/relação. */
export function hoverAt(l: Lookup, offset: number, site: StringSite | null): PluginHover | null {
 if (site) {
  const call = callAround(l, site.literal.start); if (!call) return null;
  const contents = hoverColumnString(l.index, call, site.literal.value);
  return contents ? { contents, range: { start: position(l.text, site.literal.start), end: position(l.text, site.literal.end) } } : null;
 }
 const found = memberAt(l, offset); if (!found) return null;
 const t = l.tokens; const tok = t.find(x => x.type === 'word' && x.offset <= offset && offset <= x.offset + x.value.length)!;
 return { contents: describe(l.index, found.model, found.member), range: { start: position(l.text, tok.offset), end: position(l.text, tok.offset + tok.value.length) } };
}
