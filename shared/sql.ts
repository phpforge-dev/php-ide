// Análise de SQL independente de UI: divisão de comandos, escopo de tabelas,
// completion e referência sob o cursor sobre um modelo de schema introspectado.
export type SqlColumn = { name: string; type: string };
export type SqlTable = { name: string; kind: 'table' | 'view'; columns: SqlColumn[] };
export type SqlSchema = { name: string; tables: SqlTable[] };
export type SqlModel = { label: string; database: string; defaultSchema: string; schemas: SqlSchema[] };
export type SqlItem = { label: string; kind: 'column' | 'table' | 'view' | 'schema' | 'keyword' | 'columns'; detail?: string; description?: string };
type Token = { type: 'word' | 'quoted' | 'string' | 'punct'; value: string; start: number; end: number };

const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'USING', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'EXISTS', 'DISTINCT', 'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'RETURNING', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'TRUE', 'FALSE'];
const reserved = new Set(keywords);
const tableKeywords = new Set(['FROM', 'JOIN', 'UPDATE', 'INTO', 'TABLE']);
const clauseKeywords = new Set(['SELECT', 'WHERE', 'ON', 'SET', 'BY', 'HAVING', 'AND', 'OR', 'NOT', 'VALUES', 'RETURNING', 'WHEN', 'THEN', 'ELSE', 'LIMIT', 'OFFSET', 'USING']);

/** Texto parece SQL (para detectar SQL em strings PHP). */
export const looksLikeSql = (text: string) => /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH|CREATE|ALTER|DROP|TRUNCATE|REPLACE\s+INTO)\b/i.test(text);

export function tokenize(text: string): Token[] {
 const out: Token[] = [];
 for (let i = 0; i < text.length;) {
  const c = text[i];
  if (/\s/.test(c)) { i++; continue; }
  if (c === '-' && text[i + 1] === '-') { const n = text.indexOf('\n', i); i = n < 0 ? text.length : n; continue; }
  if (c === '#' ) { const n = text.indexOf('\n', i); i = n < 0 ? text.length : n; continue; }
  if (c === '/' && text[i + 1] === '*') { const n = text.indexOf('*/', i + 2); i = n < 0 ? text.length : n + 2; continue; }
  if (c === "'") { let j = i + 1; while (j < text.length && !(text[j] === "'" && text[j + 1] !== "'")) j += text[j] === "'" ? 2 : 1; out.push({ type: 'string', value: text.slice(i, j + 1), start: i, end: Math.min(j + 1, text.length) }); i = j + 1; continue; }
  const dollar = c === '$' ? /^\$[A-Za-z_]*\$/.exec(text.slice(i)) : null;
  if (dollar) { const n = text.indexOf(dollar[0], i + dollar[0].length); const end = n < 0 ? text.length : n + dollar[0].length; out.push({ type: 'string', value: text.slice(i, end), start: i, end }); i = end; continue; }
  if (c === '"' || c === '`') { const n = text.indexOf(c, i + 1); const end = n < 0 ? text.length : n + 1; out.push({ type: 'quoted', value: text.slice(i + 1, n < 0 ? text.length : n), start: i, end }); i = end; continue; }
  const word = /^[A-Za-z_À-￿][\w$À-￿]*/.exec(text.slice(i, i + 256));
  if (word) { out.push({ type: 'word', value: word[0], start: i, end: i + word[0].length }); i += word[0].length; continue; }
  out.push({ type: 'punct', value: c, start: i, end: i + 1 }); i++;
 }
 return out;
}

/** Comandos separados por `;` fora de strings e comentários, com offsets no texto. */
export function statements(text: string): { start: number; end: number; text: string }[] {
 const out: { start: number; end: number; text: string }[] = []; let start = 0;
 for (const t of tokenize(text)) if (t.type === 'punct' && t.value === ';') { out.push({ start, end: t.start, text: text.slice(start, t.start) }); start = t.end; }
 out.push({ start, end: text.length, text: text.slice(start) });
 return out.filter(s => s.text.trim());
}

const plsqlStart = (words: string[]) => {
 const w = words.map(v => v.toUpperCase()); if (w[0] === 'BEGIN' || w[0] === 'DECLARE') return true; if (w[0] !== 'CREATE') return false;
 let i = w[1] === 'OR' && w[2] === 'REPLACE' ? 3 : 1; if (w[i] === 'EDITIONABLE' || w[i] === 'NONEDITIONABLE') i++;
 return ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER', 'TYPE'].includes(w[i]);
};

/** Divisão no estilo SQL*Plus (Oracle): `;` termina SQL; blocos PL/SQL vão até uma linha só com `/`. */
export function oracleStatements(text: string): { start: number; end: number; text: string }[] {
 const out: { start: number; end: number; text: string }[] = []; let start = 0; let words: string[] = [];
 const close = (end: number, next: number) => { out.push({ start, end, text: text.slice(start, end) }); start = next; words = []; };
 for (const t of tokenize(text)) {
  if (t.type === 'punct' && t.value === '/') {
   const before = text.slice(text.lastIndexOf('\n', t.start - 1) + 1, t.start); const after = text.slice(t.end, (text.indexOf('\n', t.end) + 1 || text.length + 1) - 1);
   if (!before.trim() && !after.trim()) { close(t.start, t.end); continue; }
  }
  if (t.type === 'punct' && t.value === ';' && !plsqlStart(words)) { close(t.start, t.end); continue; }
  if (t.type === 'word' && words.length < 6) words.push(t.value);
 }
 out.push({ start, end: text.length, text: text.slice(start) });
 return out.filter(s => s.text.trim());
}

export function statementAt(text: string, offset: number, dialect?: 'oracle') {
 const all = dialect === 'oracle' ? oracleStatements(text) : statements(text);
 return all.find(s => offset >= s.start && offset <= s.end + 1) ?? all.filter(s => s.end <= offset).at(-1) ?? null;
}

type Ref = { schema?: string; table: string; alias?: string; at: number };
const ident = (t: Token | undefined) => !!t && (t.type === 'quoted' || (t.type === 'word' && !reserved.has(t.value.toUpperCase())));

/** Tabelas referenciadas no comando (FROM/JOIN/UPDATE/INTO, listas com vírgula) e seus aliases. */
export function tablesInScope(tokens: Token[]): Ref[] {
 const refs: Ref[] = [];
 for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].type !== 'word' || !tableKeywords.has(tokens[i].value.toUpperCase())) continue;
  let j = i + 1;
  while (ident(tokens[j])) {
   let schema: string | undefined; let table = tokens[j].value; const at = tokens[j].start;
   if (tokens[j + 1]?.value === '.' && ident(tokens[j + 2])) { schema = table; table = tokens[j + 2].value; j += 2; }
   j++;
   if (tokens[j]?.type === 'word' && tokens[j].value.toUpperCase() === 'AS') j++;
   let alias: string | undefined;
   if (ident(tokens[j]) && tokens[j + 1]?.value !== '(') { alias = tokens[j].value; j++; }
   refs.push({ schema, table, alias, at });
   if (tokens[j]?.value === ',' && tokens[i].value.toUpperCase() === 'FROM') { j++; continue; }
   break;
  }
 }
 return refs;
}

function findTable(model: SqlModel, ref: { schema?: string; table: string }) {
 const lower = ref.table.toLowerCase();
 const schemas = ref.schema ? model.schemas.filter(s => s.name.toLowerCase() === ref.schema!.toLowerCase()) : [model.schemas.find(s => s.name === model.defaultSchema), ...model.schemas.filter(s => s.name !== model.defaultSchema)].filter(Boolean) as SqlSchema[];
 for (const schema of schemas) { const table = schema.tables.find(t => t.name.toLowerCase() === lower); if (table) return { schema, table }; }
 return null;
}

/** Sugestões no offset do texto SQL. */
export function sqlComplete(model: SqlModel, text: string, offset: number): { from: number; items: SqlItem[] } {
 const statement = statementAt(text, offset) ?? { start: 0, end: text.length, text };
 const tokens = tokenize(statement.text);
 const local = offset - statement.start;
 const prefix = /[\w$À-￿]*$/.exec(statement.text.slice(0, local))![0];
 const from = offset - prefix.length;
 const before = tokens.filter(t => t.end <= local - prefix.length);
 const scope = tablesInScope(tokens);
 const items: SqlItem[] = [];
 const qualified = (s: SqlSchema, t: SqlTable) => ` (${model.database}.${s.name}${t ? '.' + t.name : ''})`;
 const tableItem = (s: SqlSchema, t: SqlTable): SqlItem => ({ label: t.name, kind: t.kind, detail: ` (${model.database}.${s.name})`, description: model.label });
 const columns = (s: SqlSchema, t: SqlTable, tail: string) => t.columns.map(c => ({ label: c.name, kind: 'column' as const, detail: tail, description: c.type }));
 // Qualificador antes do cursor: alias/tabela → colunas; schema → tabelas.
 const last = before.at(-1);
 if (last?.value === '.' && (before.at(-2)?.type === 'word' || before.at(-2)?.type === 'quoted')) {
  const name = before.at(-2)!.value; const outer = before.at(-3)?.value === '.' ? before.at(-4)?.value : undefined;
  const byAlias = scope.find(r => (r.alias ?? '').toLowerCase() === name.toLowerCase());
  const found = byAlias ? findTable(model, byAlias) : findTable(model, { schema: outer, table: name });
  if (found) {
   const tail = byAlias ? ` (${byAlias.alias})` : qualified(found.schema, found.table);
   items.push(...columns(found.schema, found.table, tail));
   if (found.table.columns.length > 1) items.push({ label: found.table.columns.map(c => c.name).join(', '), kind: 'columns', detail: qualified(found.schema, found.table) });
   return { from, items };
  }
  const schema = model.schemas.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (schema) return { from, items: schema.tables.map(t => tableItem(schema, t)) };
  return { from, items: [] };
 }
 const keyword = [...before].reverse().find(t => t.type === 'word' && reserved.has(t.value.toUpperCase()));
 const defaultSchema = model.schemas.find(s => s.name === model.defaultSchema);
 const schemaItems = model.schemas.filter(s => s !== defaultSchema).map(s => ({ label: s.name, kind: 'schema' as const, detail: ` (${model.database})`, description: model.label }));
 if (keyword && tableKeywords.has(keyword.value.toUpperCase())) {
  if (defaultSchema) items.push(...defaultSchema.tables.map(t => tableItem(defaultSchema, t)));
  items.push(...schemaItems);
  return { from, items };
 }
 const inSelectList = keyword?.value.toUpperCase() === 'SELECT' || (!!keyword && keyword.value.toUpperCase() === 'DISTINCT');
 const resolved = scope.map(r => findTable(model, r)).filter(Boolean) as { schema: SqlSchema; table: SqlTable }[];
 for (const { schema, table } of resolved) items.push(...columns(schema, table, qualified(schema, table)));
 if (inSelectList && resolved.length === 1 && resolved[0].table.columns.length > 1) items.push({ label: resolved[0].table.columns.map(c => c.name).join(', '), kind: 'columns', detail: qualified(resolved[0].schema, resolved[0].table) });
 if (!keyword || clauseKeywords.has(keyword.value.toUpperCase()) || inSelectList) {
  if (defaultSchema) items.push(...defaultSchema.tables.map(t => tableItem(defaultSchema, t)));
  items.push(...schemaItems);
 }
 items.push(...keywords.map(k => ({ label: k, kind: 'keyword' as const })));
 return { from, items };
}

export type SqlReference = { schema: string; table: string; column?: string; start: number; end: number };

/** Tabela ou coluna sob o cursor, resolvida no modelo. */
export function sqlReferenceAt(model: SqlModel, text: string, offset: number): SqlReference | null {
 const statement = statementAt(text, offset); if (!statement) return null;
 const tokens = tokenize(statement.text); const local = offset - statement.start;
 const index = tokens.findIndex(t => (t.type === 'word' || t.type === 'quoted') && local >= t.start && local <= t.end);
 if (index < 0) return null;
 const token = tokens[index]; const range = { start: statement.start + token.start, end: statement.start + token.end };
 const scope = tablesInScope(tokens);
 const asTable = scope.find(r => r.at === token.start || (tokens[index - 2]?.start === r.at && tokens[index - 1]?.value === '.'));
 if (asTable) { const found = findTable(model, asTable); return found ? { schema: found.schema.name, table: found.table.name, ...range } : null; }
 if (tokens[index + 1]?.value === '.') {
  const alias = scope.find(r => (r.alias ?? '').toLowerCase() === token.value.toLowerCase());
  const found = alias ? findTable(model, alias) : findTable(model, { table: token.value });
  return found ? { schema: found.schema.name, table: found.table.name, ...range } : null;
 }
 const qualifier = tokens[index - 1]?.value === '.' ? tokens[index - 2]?.value : undefined;
 const candidates = qualifier ? scope.filter(r => [r.alias, r.table].some(n => n?.toLowerCase() === qualifier.toLowerCase())) : scope;
 for (const ref of candidates) {
  const found = findTable(model, ref);
  const column = found?.table.columns.find(c => c.name.toLowerCase() === token.value.toLowerCase());
  if (found && column) return { schema: found.schema.name, table: found.table.name, column: column.name, ...range };
 }
 return null;
}
