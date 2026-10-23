export function shortType(dtype: string, udt: string) {
  const map: Record<string, string> = { 'character varying': 'varchar', character: 'char', 'timestamp without time zone': 'timestamp', 'timestamp with time zone': 'timestamptz', 'time without time zone': 'time', 'time with time zone': 'timetz' };
  if (dtype === 'USER-DEFINED') return udt;
  if (dtype === 'ARRAY') return udt.replace(/^_/, '') + '[]';
  return map[dtype] ?? dtype;
}

export function generateDdl(name: string, columns: any[], keys: any[], primaryKeys: any[], current: string, owner?: string) {
  const primary = keys.filter(k => k.kind === 'PRIMARY KEY').map(k => String(k.col));
  const type = (c: any) => {
    const t = shortType(String(c.dtype), String(c.udt));
    const serial = /^nextval\(/.test(String(c.def ?? ''));
    if (serial && (t === 'integer' || t === 'bigint' || t === 'smallint')) return { text: t === 'bigint' ? 'bigserial' : t === 'smallint' ? 'smallserial' : 'serial', serial };
    if (t === 'varchar' && c.len) return { text: `varchar(${c.len})`, serial };
    if (t === 'char' && c.len) return { text: `char(${c.len})`, serial };
    if (t === 'numeric' && c.prec !== null && c.prec !== undefined) return { text: `numeric(${c.prec}, ${c.scale ?? 0})`, serial };
    return { text: t, serial };
  };
  const names = columns.map(c => String(c.name)); const width = Math.max(...names.map(n => n.length));
  const types = columns.map(type);
  const typeWidth = Math.max(...types.filter((t, i) => columns[i].nullable === 'NO' && !(t.serial && primary.includes(names[i]))).map(t => t.text.length), 0);
  const lines = columns.map((c, i) => {
    let line = `    ${names[i].padEnd(width)} `;
    const notNull = c.nullable === 'NO' && !(primary.length === 1 && primary[0] === names[i]);
    line += notNull ? `${types[i].text.padEnd(typeWidth)} not null` : types[i].text;
    if (c.def !== null && c.def !== undefined && !types[i].serial) line += ` default ${c.def}`;
    if (primary.length === 1 && primary[0] === names[i]) line += '\n        primary key';
    for (const _key of keys.filter(k => k.kind === 'UNIQUE' && k.col === names[i] && keys.filter(x => x.cname === k.cname).length === 1)) line += '\n        unique';
    for (const fk of keys.filter(k => k.kind === 'FOREIGN KEY' && k.col === names[i])) {
      const target = fk.fschema === current ? String(fk.ftable) : `${fk.fschema}.${fk.ftable}`;
      const pk = primaryKeys.filter(p => p.s === fk.fschema && p.t === fk.ftable);
      line += `\n        references ${target}${pk.length === 1 && pk[0].c === fk.fcol ? '' : ` (${fk.fcol})`}`;
    }
    return line;
  });
  if (primary.length > 1) lines.push(`    primary key (${primary.join(', ')})`);
  return `-- auto-generated definition\ncreate table ${name}\n(\n${lines.join(',\n')}\n);\n` + (owner ? `\nalter table ${name}\n    owner to ${owner};\n` : '');
}
