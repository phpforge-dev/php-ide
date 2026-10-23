// Plugin de exemplo da API de terceiros do PHP IDE. Roda num Web Worker: não há `fetch`,
// IPC nem Node; arquivos do projeto chegam por `files` (permissão project.read).
const MARK = /\b(TODO|FIXME)\b(?:\(([\w.-]*)\))?:?\s*(.*)/g;
let owners = null;
const loadOwners = async files => owners ??= ((await files.read('.todo-owners')) ?? '').split('\n').map(s => s.trim()).filter(Boolean);

ide.register({
  invalidates: path => path === '.todo-owners',
  invalidate() { owners = null; },
  async diagnose(path, text) {
    const out = [];
    text.split('\n').forEach((line, n) => {
      for (const m of line.matchAll(MARK)) out.push({
        range: { start: { line: n, character: m.index }, end: { line: n, character: m.index + m[0].length } },
        message: `${m[1]}: ${m[3] || '(sem descrição)'}`,
        code: m[1].toLowerCase(),
        severity: m[1] === 'FIXME' ? 'error' : 'warning',
      });
    });
    return out;
  },
  async codeLenses(path, text) {
    const count = (text.match(/\b(TODO|FIXME)\b/g) || []).length;
    return count ? [{ line: 0, title: `${count} TODO/FIXME`, command: 'summary', arguments: [path, count] }] : [];
  },
  // `TODO(` sugere responsáveis listados em .todo-owners, um por linha.
  async completeCode(site, files) {
    const m = /\b(?:TODO|FIXME)\(([\w.-]*)$/.exec(site.text.slice(0, site.offset));
    if (!m) return null;
    return { from: site.offset - m[1].length, items: (await loadOwners(files)).map(name => ({ label: name, kind: 18, detail: 'responsável (.todo-owners)' })) };
  },
  commands: { summary: (path, count) => `${path}: ${count} pendência(s)` },
});
