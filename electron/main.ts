import { TerminalService } from './terminal';
import type { FSWatcher } from 'chokidar';
import { watchProject } from './project-watcher';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { Workspace } from './workspace';
import { PhpLanguage } from './php-language';
import { AgentHost } from './agents';
import { inspectConnection, DatabaseBrowser } from './database';
import { GitService } from './git';
import type { Event } from '../shared/contracts';
import type { SqlModel } from '../shared/sql';
let window: BrowserWindow;
let workspace: Workspace;
let language: PhpLanguage;
let agents: AgentHost;
let git: GitService;
let terminals: TerminalService;
const databases = new DatabaseBrowser();
let watcher: FSWatcher | undefined;
const send = (event: Event) => { if (window && !window.isDestroyed()) window.webContents.send('event', event); };
async function select(root: string) {
  terminals?.dispose();
  databases.clear();
  await watcher?.close(); await language?.dispose(); agents?.dispose();
  workspace = new Workspace(await realpath(root));
  git = new GitService(workspace.root);
  terminals = new TerminalService(workspace.root,event=>{if(window&&!window.isDestroyed())window.webContents.send('terminal-event',event);});
  // SQL em strings PHP usa as fontes conectadas no painel de bancos, sem repassar credenciais.
  const database = { sessions: async () => (await Promise.all(databases.ids().map(async id => ({ id, model: await databases.model(id).catch(() => null) })))).filter((s): s is { id: string; model: SqlModel } => !!s.model), ddl: (id: string, schema: string, table: string) => databases.ddl(id, schema, table) };
  language = new PhpLanguage(workspace, join(app.getAppPath(), '.tools'), join(app.getPath('userData'), 'php-cache'), message => send({ type: 'language', message }), { database });
  agents = new AgentHost(workspace, app.getAppPath(), event => send({ type: 'acp', event }));
  watcher = await watchProject(workspace.root, (path,type) => language.changed(path,type));
  return workspace.info();
}
app.whenReady().then(async () => {
  await select(process.env.PHP_IDE_PROJECT ?? join(app.getAppPath(), 'fixtures/php-intelligence'));
  const handlers: Record<string, (...args: any[]) => any> = {
    terminalCreate: (id,cols,rows) => terminals.create(id,cols,rows), terminalWrite: (id,data) => terminals.write(id,data),
    terminalResize: (id,cols,rows) => terminals.resize(id,cols,rows), terminalClose: id => terminals.close(id), terminalAck: (id,size) => terminals.ack(id,size),
    workspace: () => workspace.info(),
    openProject: async () => { const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] }); return result.canceled ? null : select(result.filePaths[0]); },
    tree: path => workspace.tree(path), read: path => workspace.read(path),
    save: async (path, text, etag) => { const result = await workspace.save(path, text, etag); language.changed(await workspace.path(path)); return result; },
    language: input => language.request(input), plugins: () => language.plugins.status(), database: input => inspectConnection(input),
    databaseConnect: input => databases.connect(input), databaseDisconnect: id => databases.disconnect(id),
    databaseTables: (id, schema) => databases.tables(id, schema), databasePage: (id, schema, table, offset) => databases.page(id, schema, table, offset),
    databaseModel: id => databases.model(id), databaseExecute: (id, sql) => databases.execute(id, sql), databaseCancel: id => databases.cancel(id), databaseDdl: (id, schema, table) => databases.ddl(id, schema, table),
    gitAccount: () => git.account(), gitSaveAccount: input => git.saveAccount(input), gitTestAccount: (remote,token) => git.testAccount(remote,token),
    gitStatus: () => git.status(), gitDiff: (path, staged) => git.diff(path, staged),
    gitStage: (path, staged, token) => git.stage(path, staged, token),
    gitCommit: (message, token) => git.commit(message, token), gitLog: () => git.log(),
    gitBranches: () => git.branches(), gitTools: () => git.tools(),
    gitHistory: hash => git.history(hash), gitHistoryDiff: (hash, path) => git.historyDiff(hash, path),
    gitHunks: (path, staged) => git.hunks(path, staged), gitApplyHunk: (path, staged, token, hunk) => git.applyHunk(path, staged, token, hunk),
    gitOperation: input => git.operation(input), gitConflict: path => git.conflict(path), gitResolve: (path, text, token) => git.resolve(path, text, token),
    agents: () => agents.list(), agentStart: id => agents.start(id), agentPrompt: (text, context) => agents.prompt(text, context), agentCancel: () => agents.cancel(),
    agentMode: mode => agents.mode(mode), agentPermission: (id, option) => agents.permission(id, option), agentKeep: paths => agents.keep(paths), agentDiscard: paths => agents.discard(paths), agentReset: () => agents.reset()
  };
  for (const [name, handler] of Object.entries(handlers)) ipcMain.handle(name, (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem inválida');
    return handler(...args);
  });
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 1000, minHeight: 650, backgroundColor: '#1e1f22',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.on('closed',()=>terminals.dispose());
  window.webContents.on('render-process-gone',()=>terminals.dispose());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (process.env.PHP_IDE_DEV_URL) await window.loadURL(process.env.PHP_IDE_DEV_URL);
  else await window.loadFile(join(app.getAppPath(), 'dist/index.html'));
});
let closing = false;
let cleaned = false;
app.on('before-quit', event => {
  if (cleaned) return;
  event.preventDefault();
  if (closing) return;
  closing = true;
  void (async () => { await watcher?.close(); await language?.dispose(); agents?.dispose(); })()
    .finally(() => { cleaned = true; app.quit(); });
});
app.on('window-all-closed', () => app.quit());
