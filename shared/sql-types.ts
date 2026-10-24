/** SQL data-transfer contracts shared with optional database providers. No SQL runtime. */
export type SqlColumn = { name: string; type: string; nullable?: boolean };
export type SqlTable = { name: string; kind: 'table' | 'view'; columns: SqlColumn[] };
export type SqlSchema = { name: string; tables: SqlTable[] };
export type SqlModel = { label: string; database: string; defaultSchema: string; schemas: SqlSchema[]; searchPath?: string[]; caseSensitiveTables?: boolean; complete?: boolean; errors?: string[] };
export type SqlItem = { label: string; kind: 'column' | 'table' | 'view' | 'schema' | 'keyword' | 'columns'; detail?: string; description?: string; insertText?: string };
export type SqlReference = { schema: string; table: string; column?: string; start: number; end: number };
