// Sincroniza buffers abertos com alterações externas no disco (terminal, outro editor, Git fora da IDE).
// Sem dependência de DOM/Vite para poder ser testado em Node.
export type SyncedFile = { path: string; uri: string; etag: string; text: string };
export type SyncedBuffer = { file: SyncedFile; model: { getValue(): string; setValue(text: string): void }; saved: string; virtual?: string };
export type SyncReport = { kind: 'reloaded' | 'conflict' | 'deleted'; path: string };

const fsPath = (uri: string) => { try { return decodeURIComponent(new URL(uri).pathname); } catch { return ''; } };

export function createFileSync(read: (path: string) => Promise<SyncedFile>, buffers: Map<string, SyncedBuffer>, report: (event: SyncReport) => void, delay = 150) {
  const pending = new Set<string>(); let timer: ReturnType<typeof setTimeout> | undefined; let running: Promise<void> = Promise.resolve();
  /** Conflitos já avisados por etag, para não repetir o aviso a cada evento do watcher. */
  const warned = new Map<string, string>();
  async function check(paths: string[]) {
    for (const [key, b] of buffers) {
      if (b.virtual || !paths.includes(fsPath(b.file.uri))) continue;
      let file: SyncedFile;
      try { file = await read(key); } catch { if (warned.get(key) !== 'deleted') { warned.set(key, 'deleted'); report({ kind: 'deleted', path: key }); } continue; }
      if (buffers.get(key) !== b || file.etag === b.file.etag) { if (file.etag === b.file.etag) warned.delete(key); continue; }
      const current = b.model.getValue();
      if (current === b.saved || current === file.text) {
        // Buffer limpo (ou já igual ao disco, ex.: o próprio salvamento): adota o disco.
        b.file = file; b.saved = file.text; if (current !== file.text) b.model.setValue(file.text); warned.delete(key);
        if (current !== file.text) report({ kind: 'reloaded', path: key });
      } else if (warned.get(key) !== file.etag) {
        // Buffer com edições: nunca sobrescreve; salvar continuará recusado pelo etag.
        warned.set(key, file.etag); report({ kind: 'conflict', path: key });
      }
    }
  }
  function changed(path: string) {
    pending.add(path); clearTimeout(timer);
    timer = setTimeout(() => { const paths = [...pending]; pending.clear(); running = running.then(() => check(paths)).catch(() => undefined); }, delay);
  }
  /** Descarta edições locais e recarrega do disco (resolução explícita do conflito). */
  async function reload(key: string) {
    const b = buffers.get(key); if (!b || b.virtual) return;
    const file = await read(key); b.file = file; b.saved = file.text; b.model.setValue(file.text); warned.delete(key);
  }
  return { changed, reload, idle: () => new Promise<void>(resolve => setTimeout(() => void running.then(() => resolve()), delay + 10)), conflicted: (key: string) => warned.has(key) };
}
