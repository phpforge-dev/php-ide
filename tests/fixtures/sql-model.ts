import type { SqlModel } from '../../shared/sql-types';

// Mesmo schema do banco descartável usado na observação do PhpStorm (recorte 13).
export const model: SqlModel = { label: 'fixture@127.0.0.1', database: 'fixture', defaultSchema: 'public', schemas: [
 { name: 'billing', tables: [{ name: 'invoices', kind: 'table', columns: [{ name: 'id', type: 'integer' }, { name: 'order_id', type: 'integer' }] }] },
 { name: 'public', tables: [
  { name: 'active_users', kind: 'view', columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'varchar' }] },
  { name: 'orders', kind: 'table', columns: [{ name: 'id', type: 'integer' }, { name: 'user_id', type: 'integer' }, { name: 'total', type: 'numeric' }] },
  { name: 'users', kind: 'table', columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'varchar' }, { name: 'email', type: 'varchar' }, { name: 'created_at', type: 'timestamp' }] },
 ] },
] };
