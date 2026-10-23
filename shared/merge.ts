// Merge de três vias por linhas, independente de UI. Resultado inicial = base; cada
// trecho alterado vira um chunk que a interface aplica, ignora ou combina.
export type Range = [start: number, end: number];
export type ChunkKind = 'left' | 'right' | 'both' | 'conflict';
export type Chunk = { kind: ChunkKind; base: Range; left: Range; right: Range };
type Hunk = { a: Range; b: Range };

/** Linhas preservando o terminador, para reconstruir o texto exatamente. */
export const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Diff de Myers (O(ND)) entre sequências; devolve trechos alterados. */
export function diff<T>(a: T[], b: T[]): Hunk[] {
 const n = a.length; const m = b.length; const max = n + m; const offset = max + 1;
 const v = new Int32Array(2 * max + 3); const trace: Int32Array[] = [];
 let found = false;
 for (let d = 0; d <= max && !found; d++) {
  trace.push(v.slice());
  for (let k = -d; k <= d; k += 2) {
   let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
   let y = x - k;
   while (x < n && y < m && a[x] === b[y]) { x++; y++; }
   v[offset + k] = x;
   if (x >= n && y >= m) { found = true; break; }
  }
 }
 // Reconstrói pares iguais de trás para frente: em cada passo, um movimento e depois a diagonal.
 const pairs: [number, number][] = []; let x = n; let y = m;
 for (let d = trace.length - 1; d > 0; d--) {
  const prev = trace[d]; const k = x - y;
  const down = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]);
  const px = prev[offset + (down ? k + 1 : k - 1)]; const py = px - (down ? k + 1 : k - 1);
  const mx = down ? px : px + 1; const my = down ? py + 1 : py;
  while (x > mx && y > my) { pairs.push([x - 1, y - 1]); x--; y--; }
  x = px; y = py;
 }
 while (x > 0 && y > 0) { pairs.push([x - 1, y - 1]); x--; y--; }
 pairs.reverse();
 const hunks: Hunk[] = []; let ai = 0; let bi = 0;
 for (const [pa, pb] of [...pairs, [n, m] as [number, number]]) {
  if (pa > ai || pb > bi) hunks.push({ a: [ai, pa], b: [bi, pb] });
  ai = pa + 1; bi = pb + 1;
 }
 return hunks;
}

const touches = (x: Range, y: Range) => (x[0] < y[1] && y[0] < x[1]) || x[0] === y[0] || (x[0] === x[1] && x[0] >= y[0] && x[0] <= y[1]) || (y[0] === y[1] && y[0] >= x[0] && y[0] <= x[1]);

/** Faixa correspondente no texto de um lado: deslocamento dos hunks anteriores + variação dos hunks da região. */
function project(range: Range, inside: Hunk[], all: Hunk[]): Range {
 const before = all.filter(h => !inside.includes(h) && h.a[0] < range[0]).reduce((sum, h) => sum + (h.b[1] - h.b[0]) - (h.a[1] - h.a[0]), 0);
 const growth = inside.reduce((sum, h) => sum + (h.b[1] - h.b[0]) - (h.a[1] - h.a[0]), 0);
 return [range[0] + before, range[1] + before + growth];
}

export function merge3(base: string, left: string, right: string) {
 const B = lines(base); const L = lines(left); const R = lines(right);
 const hl = diff(B, L); const hr = diff(B, R);
 const all = [...hl.map(h => ({ side: 'left' as const, h })), ...hr.map(h => ({ side: 'right' as const, h }))].sort((x, y) => x.h.a[0] - y.h.a[0] || x.h.a[1] - y.h.a[1]);
 const regions: { base: Range; left: Hunk[]; right: Hunk[] }[] = [];
 for (const item of all) {
  const last = regions.at(-1);
  if (last && touches(last.base, item.h.a)) { last.base = [Math.min(last.base[0], item.h.a[0]), Math.max(last.base[1], item.h.a[1])]; last[item.side].push(item.h); }
  else regions.push({ base: [...item.h.a] as Range, left: item.side === 'left' ? [item.h] : [], right: item.side === 'right' ? [item.h] : [] });
 }
 const chunks: Chunk[] = regions.map(r => {
  const leftRange = project(r.base, r.left, hl); const rightRange = project(r.base, r.right, hr);
  const kind: ChunkKind = !r.right.length ? 'left' : !r.left.length ? 'right'
   : L.slice(...leftRange).join('') === R.slice(...rightRange).join('') ? 'both' : 'conflict';
  return { kind, base: r.base, left: leftRange, right: rightRange };
 });
 return { base: B, left: L, right: R, chunks };
}

/** Texto do contador, como "3 alterações. 1 conflito." na barra do merge. */
export function summary(pendingChanges: number, pendingConflicts: number) {
 if (!pendingChanges && !pendingConflicts) return 'Todas as alterações foram processadas.';
 const changes = pendingChanges ? `${pendingChanges} ${pendingChanges === 1 ? 'alteração' : 'alterações'}.` : 'Nenhuma alteração.';
 return pendingConflicts ? `${changes} ${pendingConflicts} ${pendingConflicts === 1 ? 'conflito' : 'conflitos'}.` : changes;
}

/** Conflito "simples": edições dos dois lados em caracteres diferentes da base; devolve o texto combinado. */
export function simpleMerge(base: string, left: string, right: string): string | null {
 if (base.length + left.length + right.length > 20000) return null;
 const b = [...base]; const hl = diff(b, [...left]); const hr = diff(b, [...right]);
 for (const x of hl) for (const y of hr) if (touches(x.a, y.a)) {
  const same = left.slice(...x.b) === right.slice(...y.b) && x.a[0] === y.a[0] && x.a[1] === y.a[1];
  if (!same) return null;
 }
 const edits = [...hl.map(h => ({ h, text: [...left].slice(...h.b).join('') })), ...hr.filter(y => !hl.some(x => x.a[0] === y.a[0] && x.a[1] === y.a[1])).map(h => ({ h, text: [...right].slice(...h.b).join('') }))]
  .sort((p, q) => q.h.a[0] - p.h.a[0] || q.h.a[1] - p.h.a[1]);
 const out = [...b];
 for (const e of edits) out.splice(e.h.a[0], e.h.a[1] - e.h.a[0], ...e.text);
 return out.join('');
}
