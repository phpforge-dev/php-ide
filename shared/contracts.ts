export type TerminalEvent = { type: 'output'; id: string; data: string } | { type: 'exit'; id: string; code: number };
export type GitAccount = { token: string; name: string; email: string; localName: string | null; localEmail: string | null; username: string; sshKey: string; sshConfigured: boolean; helperConfigured: boolean; remotes: { name: string; fetch: string; push: string }[] };
export type GitAccountUpdate = { token: string; identity: 'local' | 'inherit'; name: string; email: string; authentication: 'keep' | 'https' | 'ssh' | 'inherit'; username: string; sshKey: string };
export type TextMatch = { path: string; line: number; column: number; text: string };
export type LocalRevision = { id: string; path: string; time: number; label: string; size: number };
export type Entry = { name: string; path: string; directory: boolean };
export type FileBuffer = { path: string; uri: string; text: string; etag: string };
export type WorkspaceInfo = { root: string; name: string };
export type GitChange = { path: string; originalPath?: string; index: string; worktree: string };
export type GitState = { branch: string; head: string | null; mergeHead: string | null; operation?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'conflict' | null; changes: GitChange[]; indexToken: string };
export type GitDiff = { path: string; before: string; after: string; beforeLabel: string; afterLabel: string; token: string };
export type GitCommit = { hash: string; author: string; date: string; subject: string; parents?: string[]; refs?: string };
export type GitBranch = { name: string; current: boolean; remote: boolean; upstream: string; tracking: string };
export type GitTools = { branches: GitBranch[]; remotes: string[]; stashes: { ref: string; subject: string }[] };
export type GitHistory = { hash: string; parents: string[]; files: { path: string; oldPath?: string; status: string }[] };
export type GitHunks = { token: string; hunks: { id: number; patch: string }[] };
export type GitOperation = { kind: 'checkout-remote' | 'create-branch' | 'switch' | 'delete-branch' | 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'fetch' | 'pull' | 'push' | 'stash' | 'stash-apply' | 'merge-abort' | 'cherry-pick-abort' | 'revert-abort' | 'rebase-abort' | 'rebase-continue'; target?: string; checkout?: boolean; expectedBranch?: string; expectedHead: string | null };
export type GitConflict = { path: string; base: string; ours: string; theirs: string; result: string; token: string;
  operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'conflict'; oursLabel: string; theirsLabel: string };
export type LanguageMethod = 'textDocument/definition' | 'textDocument/completion' |
  'completionItem/resolve' | 'textDocument/hover' | 'textDocument/references' | 'textDocument/implementation' | 'textDocument/diagnostic' | 'textDocument/codeLens';
export type LanguageInput = { method: LanguageMethod; path: string; text: string;
  version: number; position: { line: number; character: number }; completionItem?: unknown };
export type DatabaseDriver = 'postgres' | 'mysql' | 'mariadb' | 'sqlite' | 'sqlserver' | 'redis' | 'oracle';
export type SslMode = 'disable' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
/** Fonte de dados salva por projeto; nunca contém senha. */
export type DataSource = { id: string; name: string; comment: string; driver: DatabaseDriver; host: string; port: number;
  database: string; user: string; file: string; auth: 'password' | 'none'; savePassword: 'never' | 'session';
  ssl: { mode: SslMode; ca: string }; ssh: { enabled: boolean; host: string; port: number; user: string; key: string };
  readOnly: boolean; startup: string; schemas: string[];
  /** Oracle: `database` é Service name ou SID. */
  connectType?: 'service' | 'sid' };
export type ConnectionInput = { driver: DatabaseDriver; host: string; port: number; database: string; user: string; password: string;
  /** Legado: equivale a ssl.mode verify-full/disable. */
  tls?: boolean; ssl?: { mode: SslMode; ca?: string }; file?: string; ssh?: { host: string; port: number; user: string; key: string };
  readOnly?: boolean; startup?: string[]; sourceId?: string; savePassword?: 'never' | 'session'; name?: string; auth?: 'password' | 'none'; schemas?: string[]; connectType?: 'service' | 'sid' };
export type DatabaseSession = { id: string; label: string; driver: DatabaseDriver; schemas: string[]; sourceId?: string; version?: string; readOnly?: boolean };
export type DatabaseTable = { name: string; kind: string };
export type DatabaseColumn = { name: string; type: string; nullable: boolean; primary: boolean };
export type SqlResult = { statement: string; ms: number; kind: 'rows' | 'update' | 'error'; columns?: string[]; rows?: (string | null)[][]; truncated?: boolean; affected?: number; error?: string };
export type { SqlModel } from './sql';
export type DatabasePage = { columns: DatabaseColumn[]; rows: (string | null)[][]; offset: number; hasMore: boolean; ordered: boolean; cellLimit: number; meta?: string;
  /** Redis: token da próxima página (HSCAN/SSCAN ou último id do stream), tipo, TTL e tamanho. */
  cursor?: string | null; kind?: string; ttl?: number; size?: number };
/** Edição de uma chave Redis pela prévia; `old` confere o valor lido (compara-e-grava). */
export type RedisEdit = { op: 'get' | 'set' | 'hset' | 'hdel' | 'lset' | 'ldel' | 'rpush' | 'sadd' | 'sreplace' | 'srem' | 'zadd' | 'zrem' | 'ttl' | 'rename' | 'delete';
  key: string; kind?: string; field?: string; newField?: string; member?: string; index?: number; value?: string; old?: string; score?: number; ttl?: number; to?: string };
export type AgentChange = { path: string; before: string | null; after: string };
export type AgentInfo = { id: string; name: string; available: boolean; detail: string };
/** Eventos de uma sessão de agente (ACP ou Codex) para o painel. */
export type AgentEvent =
  { type: 'session'; agent: string; protocol: number; modes: { id: string; name: string }[]; mode: string | null } |
  { type: 'message' | 'thought'; text: string } |
  { type: 'tool'; id: string; title?: string; kind?: string; status?: string } |
  { type: 'plan'; entries: { content: string; status: string }[] } |
  { type: 'mode'; current: string } |
  { type: 'permission'; id: string; title: string; kind?: string; options: { id: string; name: string; kind: string }[] } |
  { type: 'changes'; changes: AgentChange[] } |
  { type: 'done'; stopReason: string; error?: string };
export type Event = { type: 'language'; message: string } | { type: 'acp'; event: AgentEvent } |
  { type: 'agent'; text: string; done?: boolean; error?: boolean };
export type DockerContext = { name: string; endpoint: string; current: boolean };
export type DockerContainer = {id: string; name: string; image: string; state: string; status: string; ports: string};
export type DockerSnapshot = {version: string; os: string; containers: DockerContainer[]; images: {id:string;repository:string;tag:string;size:string}[]; volumes:{name:string;driver:string}[];networks:{id:string;name:string;driver:string}[]};
/** Saída de `testRun`: `junit` é o relatório `--log-junit` (null se o runner não chegou a gravá-lo). */
export type TestRunOutput = { command: string; exitCode: number | null; cancelled: boolean; timedOut: boolean; durationMs: number; junit: string | null; output: string };
/** Como executar o Composer: PATH (ou composer.phar do projeto), caminho escolhido ou imagem Docker. */
export type ComposerRunner = { mode: 'auto' | 'path' | 'docker'; path?: string; image?: string };
export type ComposerRunOutput = { command: string; exitCode: number | null; cancelled: boolean; timedOut: boolean; durationMs: number; output: string };
export interface IdeApi {
  searchSymbols(query:string):Promise<{name:string;kind:number;containerName?:string;location:{uri:string;range:{start:{line:number;character:number};end:{line:number;character:number}}}}[]>;
  onDockerProgress(listener: (event: {id: string; text: string}) => void): () => void;
  dockerCancel(id: string): Promise<void>;
  dockerContexts(): Promise<DockerContext[]>;
  dockerSnapshot(context: string): Promise<DockerSnapshot>;
  dockerLogs(context: string, container: string): Promise<string>;
  dockerContainerAction(context: string, container: string, action: 'start'|'stop'|'restart'|'rm'): Promise<string>;
  dockerPull(context: string, image: string, progressId?: string): Promise<string>;
  dockerComposeFiles(): Promise<string[]>;
  dockerCompose(context: string, file: string, action: 'services'|'up'|'stop'|'build', progressId?: string): Promise<string>;
  dockerTerminal(id: string, context: string, container: string): Promise<{shell: string}>;
  terminalCreate(id: string, cols: number, rows: number, cwd?: string): Promise<{ shell: string }>;
  terminalWrite(id: string, data: string): Promise<void>;
  terminalResize(id: string, cols: number, rows: number): Promise<void>;
  terminalClose(id: string): Promise<void>;
  terminalAck(id: string, size: number): Promise<void>;
  onTerminalEvent(listener: (event: TerminalEvent) => void): () => void;
  workspace(): Promise<WorkspaceInfo>;
  recentProjects(): Promise<{path: string; name: string; available: boolean}[]>;
  openRecentProject(path: string): Promise<WorkspaceInfo>;
  forgetRecentProject(path: string): Promise<void>;
  clearRecentProjects(): Promise<void>;
  startupInfo(): Promise<{project:boolean}>;
  closeProject(): Promise<void>;
  pickProjectParent(): Promise<string|null>;
  createProject(parent:string,name:string): Promise<{root:string}>;
  cloneProject(parent:string,name:string,url:string): Promise<{root:string}>;
  openProject(): Promise<WorkspaceInfo | null>;
  tree(path: string): Promise<Entry[]>;
  /** Arquivos do diretório (recursivo, até 50 mil), relativos à raiz; `vendor` só quando pedido. */
  listFiles(dir: string, vendor: boolean): Promise<string[]>;
  read(path: string): Promise<FileBuffer>;
  /** Texto somente leitura de um stub nativo `phar://` do Phpactor (recorte 20). */
  languageStub(uri: string): Promise<{uri: string; text: string; readOnly: true}>;
  /** Imagem do projeto como data URI (png, jpg, gif, webp, svg; até 5 MB) para a prévia Markdown. */
  readImage(path: string): Promise<string>;
  save(path: string, text: string, etag: string): Promise<string>;
  /** Cria arquivo (com texto inicial) ou diretório; caminho relativo novo, pais criados quando faltam. */
  fileCreate(path: string, kind: 'file' | 'directory', text?: string): Promise<string>;
  fileRename(path: string, name: string): Promise<string>;
  fileMove(path: string, directory: string): Promise<string>;
  fileCopy(path: string, directory: string, name: string): Promise<string>;
  /** Guarda o conteúdo no histórico local antes de excluir; arquivos acima de 5 MB só com `force`. */
  fileDelete(path: string, force?: boolean): Promise<{ deleted: boolean; unrecoverable: number }>;
  fileReveal(path: string): Promise<void>;
  fileOpenDefault(path: string): Promise<void>;
  fileSearch(text: string): Promise<{ matches: TextMatch[]; truncated: boolean }>;
  fileHistory(path: string): Promise<LocalRevision[]>;
  fileHistoryContent(id: string): Promise<{ path: string; text: string | null }>;
  fileHistoryRestore(id: string): Promise<string>;
  gitAccount(): Promise<GitAccount>;
  gitSaveAccount(input: GitAccountUpdate): Promise<GitAccount>;
  gitTestAccount(remote: string, token: string): Promise<string>;
  /** Ignorados pelo Git entre os caminhos existentes consultados; não enumera dependências. */
  gitIgnored(paths: string[]): Promise<string[]>;
  gitStatus(): Promise<GitState>;
  gitEditorBase(path: string): Promise<{text: string; label: string}>;
  gitLineInfo(path: string, line: number, text: string): Promise<{hash: string; author: string; date: string; summary: string; uncommitted: boolean}>;
  gitDiff(path: string, staged: boolean): Promise<GitDiff>;
  gitStage(path: string, staged: boolean, token: string): Promise<void>;
  gitCommitMessage(): Promise<string>;
  gitCommit(message: string, indexToken: string, amend?: boolean): Promise<string>;
  gitLog(ref?: string): Promise<GitCommit[]>;
  gitBranches(): Promise<GitBranch[]>;
  gitTools(): Promise<GitTools>;
  gitHistory(hash: string): Promise<GitHistory>;
  gitHistoryDiff(hash: string, path: string): Promise<GitDiff>;
  gitHunks(path: string, staged: boolean): Promise<GitHunks>;
  gitApplyHunk(path: string, staged: boolean, token: string, hunk: number): Promise<void>;
  gitOperation(input: GitOperation): Promise<string>;
  gitConflict(path: string): Promise<GitConflict>;
  gitResolve(path: string, text: string, token: string): Promise<void>;
  /** Aceita a versão inteira de um lado (inclui exclusão/binário); `token` é o `indexToken` do status. */
  gitResolveSide(path: string, side: 'ours' | 'theirs', token: string): Promise<void>;
  language(input: LanguageInput): Promise<unknown>;
  plugins(): Promise<{ id: string; name: string; version?: string }[]>;
  /** Executa `php vendor/bin/{framework}` no arquivo/pasta do projeto; uma execução por vez. */
  testRun(id: string, framework: 'pest' | 'phpunit', path: string, filter: string): Promise<TestRunOutput>;
  testCancel(id: string): Promise<void>;
  /** Composer: ação validada no backend; saída parcial chega por `onComposerProgress`. */
  composerRun(id: string, runner: ComposerRunner, request: import('./language/plugins/composer').ComposerRequest & { lock?: boolean }): Promise<ComposerRunOutput>;
  composerCancel(id: string): Promise<void>;
  composerProbe(runner: ComposerRunner): Promise<{ command: string; version: string }>;
  composerSearch(query: string): Promise<{ name: string; description: string; downloads: number; favers: number; abandoned: boolean }[]>;
  composerVersions(name: string): Promise<string[]>;
  onComposerProgress(listener: (event: { id: string; text: string }) => void): () => void;
  database(input: ConnectionInput): Promise<{ version: string; schemas: string[] }>;
  databaseConnect(input: ConnectionInput): Promise<DatabaseSession>;
  databaseDisconnect(id: string): Promise<void>;
  databaseTables(id: string, schema: string): Promise<DatabaseTable[]>;
  databasePage(id: string, schema: string, table: string, offset: number, cursor?: string | null): Promise<DatabasePage>;
  databaseRedisEdit(id: string, schema: string, edit: RedisEdit): Promise<{ value?: string; result?: string | null }>;
  databaseModel(id: string): Promise<import('./sql').SqlModel>;
  databaseExecute(id: string, sql: string): Promise<SqlResult[]>;
  databaseCancel(id: string): Promise<void>;
  databaseDdl(id: string, schema: string, table: string): Promise<string>;
  databaseLaravelFiles(): Promise<string[]>;
  databaseImportLaravel(file: string): Promise<{driver: DatabaseDriver; host: string; port: number; database: string; user: string; password: string; file: string; warnings: string[]}>;
  databaseSources(): Promise<DataSource[]>;
  databaseSaveSources(sources: DataSource[]): Promise<DataSource[]>;
  databasePasswordStored(sourceId: string): Promise<boolean>;
  databaseForgetPassword(sourceId: string): Promise<void>;
  databasePickFile(kind: 'sqlite' | 'cert' | 'key'): Promise<string | null>;
  agents(): Promise<AgentInfo[]>;
  agentStart(agent: string): Promise<void>;
  agentPrompt(text: string, context?: { path: string; text: string; selection?: string }): Promise<void>;
  agentCancel(): Promise<void>;
  agentMode(mode: string): Promise<void>;
  agentPermission(id: string, optionId: string | null): Promise<void>;
  agentKeep(paths?: string[]): Promise<void>;
  agentDiscard(paths?: string[]): Promise<void>;
  agentReset(): Promise<void>;
  onEvent(listener: (event: Event) => void): () => void;
}
