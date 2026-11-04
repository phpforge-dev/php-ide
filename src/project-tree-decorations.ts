/**
 * Extension point for the Project tree: a workbench plugin adds a short muted text after an entry's
 * name (e.g. coverage "100% arquivos, 59% linhas"). The host owns the rows and repaints them when the
 * tree is rebuilt; plugins never touch #tree directly.
 */
export type TreeDecoration = { text: string; title?: string };
export type TreeDecorator = (entry: { path: string; directory: boolean }) => TreeDecoration | null | undefined;

const decorators = new Map<number, TreeDecorator>();
let next = 1;

function paint(row: HTMLElement) {
 row.querySelectorAll(':scope > .resource-decoration').forEach(el => el.remove());
 const path = row.dataset.path; if (path === undefined) return;
 const directory = row.tagName === 'SUMMARY';
 const parts: TreeDecoration[] = [];
 for (const decorate of decorators.values()) { try { const d = decorate({ path, directory }); if (d?.text) parts.push(d); } catch (error) { console.warn(error); } }
 if (!parts.length) return;
 const span = document.createElement('span');
 span.className = 'resource-decoration';
 span.textContent = parts.map(p => p.text).join(' · ');
 const title = parts.map(p => p.title).filter(Boolean).join('\n'); if (title) span.title = title;
 row.append(span);
}

/** Called by the host for each row it creates. */
export function decorateTreeRow(row: HTMLElement) { if (decorators.size) paint(row); }

/** Repaint every rendered row (after a decorator changes its data). */
export function refreshTreeDecorations(tree: ParentNode = document) {
 for (const row of tree.querySelectorAll<HTMLElement>('#tree button[data-path], #tree summary[data-path]')) paint(row);
}

export function addTreeDecorator(decorator: TreeDecorator): () => void {
 const id = next++; decorators.set(id, decorator); refreshTreeDecorations();
 return () => { if (decorators.delete(id)) refreshTreeDecorations(); };
}
