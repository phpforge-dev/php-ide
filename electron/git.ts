import { GitAccountService } from './git-account';
import type { GitAccountUpdate } from '../shared/contracts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { Workspace } from './workspace';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { GitChange, GitCommit, GitDiff, GitState, GitBranch, GitHistory, GitHunks, GitOperation, GitConflict } from '../shared/contracts';

const exec = promisify(execFile);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const conflicts = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
const limit = 2 * 1024 * 1024;

export class GitService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly root: string) {}

  private async command(args: string[], input?: string) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    env.GIT_TERMINAL_PROMPT = '0';
    // Leituras (status/diff) não tomam o lock opcional do index; evita 'index.lock exists' em git do terminal.
    env.GIT_OPTIONAL_LOCKS = '0';
    // Literal pathspecs belong only to direct path commands. Propagating this flag
    // into stash breaks its internal cleanup of untracked files on Git 2.50.
    if (['status', 'diff', 'diff-tree', 'ls-files', 'add', 'reset', 'rm'].includes(args[0])) env.GIT_LITERAL_PATHSPECS = '1';
    try {
      const process = exec('git', ['--no-pager', '-c', 'color.ui=false', '-C', this.root, ...args], {
        encoding: 'utf8', timeout: 30_000, maxBuffer: limit, env,
      });
      process.child.stdin?.end(input);
      const { stdout } = await process;
      // Successful porcelain mutations can report useful output on stderr, but readers need stdout only.
      return stdout;
    } catch (error: any) {
      throw Object.assign(new Error(String(error.stderr || error.stdout || error.message).trim().slice(0, 1500)), { code: error.code });
    }
  }

  private async repository() {
    let top: string;
    try { top = (await this.command(['rev-parse', '--show-toplevel'])).trim(); }
    catch { throw new Error('Abra a raiz de um repositório Git para usar este painel.'); }
    if (await realpath(top) !== await realpath(this.root)) throw new Error('Abra a raiz do repositório Git, não uma subpasta.');
  }

  async account() { await this.repository(); return new GitAccountService(this.root,args=>this.command(args)).read(); }
  saveAccount(input: GitAccountUpdate) { return this.mutate(async()=>{await this.repository();return new GitAccountService(this.root,args=>this.command(args)).save(input);}); }
  testAccount(remote: string, token: string) { return this.mutate(async()=>{await this.repository();return new GitAccountService(this.root,args=>this.command(args)).test(remote,token);}); }

  private async head() {
    // An unborn branch has a symbolic HEAD but no object yet.
    const refs = await this.command(['rev-parse', '--verify', '--quiet', 'HEAD']).catch(error => {
      if (error.code === 1) return '';
      throw error;
    });
    return refs.trim() || null;
  }

  async status(): Promise<GitState> {
    await this.repository();
    const raw = await this.command(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const fields = raw.split('\0');
    const changes: GitChange[] = [];
    for (let i = 0; i < fields.length && fields[i]; i++) {
      const item = fields[i];
      const change: GitChange = { path: item.slice(3), index: item[0], worktree: item[1] };
      if (/[RC]/.test(item.slice(0, 2))) change.originalPath = fields[++i];
      changes.push(change);
    }
    const head = await this.head();
    const mergeHead = (await this.command(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']).catch(error => { if (error.code === 1) return ''; throw error; })).trim() || null;
    const branch = (await this.command(['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim() || `HEAD destacado · ${head?.slice(0, 8)}`;
    const indexToken = digest(`${head}\0${mergeHead}\0${await this.command(['ls-files', '--stage', '-z'])}`);
    return { branch, head, mergeHead, changes, indexToken };
  }

  private async change(path: string) {
    if (typeof path !== 'string' || !path || path.includes('\0') || isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('Caminho Git inválido');
    const state = await this.status();
    const change = state.changes.find(item => item.path === path);
    if (!change) throw new Error('Arquivo não está mais na lista de alterações. Atualize o painel.');
    if (conflicts.has(change.index + change.worktree)) throw new Error('Arquivo em conflito. O editor de merge ainda não está disponível.');
    return { state, change };
  }

  private text(bytes: Buffer) {
    if (bytes.length > limit || bytes.includes(0)) throw new Error('Diff disponível apenas para texto UTF-8 de até 2 MB.');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Este arquivo não é texto UTF-8.'); }
  }

  private async local(path: string) {
    const target = resolve(this.root, path);
    // Validate parents even when the final file was deleted; never follow symlinks outside the project.
    const parent = await realpath(dirname(target));
    const rel = relative(this.root, parent);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Arquivo fora do projeto');
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error('Diff de symlink, submódulo ou arquivo grande não suportado.');
    return this.text(await readFile(target));
  }

  private async blob(spec: string) {
    // cat-file bypasses external diff/textconv tools configured in a repository.
    const size = Number((await this.command(['cat-file', '-s', spec])).trim());
    if (size > limit) throw new Error('Arquivo grande demais para o diff.');
    const content = await this.command(['cat-file', 'blob', spec]);
    if (content.includes('\0') || content.includes('\uFFFD')) throw new Error('Diff disponível apenas para texto UTF-8.');
    return content;
  }

  async diff(path: string, staged: boolean): Promise<GitDiff> {
    if (typeof staged !== 'boolean') throw new Error('Comparação inválida');
    const { state, change } = await this.change(path);
    const untracked = change.index === '?';
    if (staged && (change.index === ' ' || untracked)) throw new Error('Arquivo sem alterações preparadas.');
    const before = staged
      ? !state.head || change.index === 'A' ? '' : await this.blob(`${state.head}:${change.originalPath ?? path}`)
      : untracked || change.index === 'D' ? '' : await this.blob(`:${path}`);
    const after = staged
      ? change.index === 'D' ? '' : await this.blob(`:${path}`)
      : change.worktree === 'D' ? '' : await this.local(path);
    return { path, before, after, beforeLabel: staged ? 'HEAD' : untracked ? 'Não rastreado (vazio)' : 'Preparado (index)',
      afterLabel: staged ? 'Preparado (index)' : 'Disco', token: digest(JSON.stringify([state.indexToken, change, before, after])) };
  }

  private mutate<T>(fn: () => Promise<T>): Promise<T> {
    const job = this.queue.catch(() => {}).then(fn);
    this.queue = job;
    return job;
  }

  stage(path: string, staged: boolean, token: string) {
    return this.mutate(async () => {
      await this.repository();
      const reviewed = await this.diff(path, staged);
      if (reviewed.token !== token) throw new Error('O arquivo ou index mudou desde a revisão. Abra o diff novamente.');
      const { state, change } = await this.change(path);
      const paths = change.originalPath ? [path, change.originalPath] : [path];
      if (!staged) await this.command(['add', '--', ...paths]);
      else if (state.head) await this.command(['reset', '-q', 'HEAD', '--', ...paths]);
      else await this.command(['rm', '--cached', '-f', '--', ...paths]);
    });
  }

  commit(message: string, indexToken: string) {
    return this.mutate(async () => {
      if (typeof message !== 'string' || !message.trim() || message.length > 10_000 || message.includes('\0')) throw new Error('Informe uma mensagem de commit válida.');
      const state = await this.status();
      if (state.indexToken !== indexToken) throw new Error('O index mudou desde a revisão. Atualize e confira os arquivos preparados.');
      if (state.changes.some(c => conflicts.has(c.index + c.worktree))) throw new Error('Resolva os conflitos antes de criar o commit.');
      if (!state.mergeHead && !state.changes.some(c => c.index !== ' ' && c.index !== '?')) throw new Error('Nenhuma alteração preparada para commit.');
      await this.command(['commit', '-m', message]);
      return (await this.head())!;
    });
  }

  async log(): Promise<GitCommit[]> {
    await this.repository();
    if (!await this.head()) return [];
    const raw = await this.command(['log', '-100', '--format=%H%x00%an%x00%aI%x00%s%x00']);
    const fields = raw.split('\0');
    const commits: GitCommit[] = [];
    for (let i = 0; i + 3 < fields.length; i += 4) commits.push({ hash: fields[i].trim(), author: fields[i + 1], date: fields[i + 2], subject: fields[i + 3] });
    return commits;
  }

  async branches(): Promise<GitBranch[]> {
    await this.repository();
    const output = await this.command(['for-each-ref', '--format=%(refname)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)', 'refs/heads', 'refs/remotes']);
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [ref, current, upstream, tracking] = line.split('\0');
      return { name: ref.replace(/^refs\/(heads|remotes)\//, ''), current: current === '*', remote: ref.startsWith('refs/remotes/'), upstream, tracking };
    });
  }

  async tools() {
    const branches = await this.branches();
    const remotes = (await this.command(['remote'])).trim().split('\n').filter(Boolean);
    const output = await this.command(['stash', 'list', '--format=%gd%x00%s']);
    const stashes = output.trim().split('\n').filter(Boolean).map(line => { const [ref, subject] = line.split('\0'); return { ref, subject }; });
    return { branches, remotes, stashes };
  }

  private validHash(hash: string) {
    if (typeof hash !== 'string' || !/^[a-f0-9]{40,64}$/.test(hash)) throw new Error('Commit inválido');
  }

  async history(hash: string): Promise<GitHistory> {
    await this.repository(); this.validHash(hash);
    const parents = (await this.command(['show', '-s', '--format=%P', hash])).trim().split(' ').filter(Boolean);
    const fields = (await this.command(['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-z', ...(parents.length ? [parents[0], hash] : [hash])])).split('\0');
    const files: GitHistory['files'] = [];
    for (let i = 0; fields[i];) {
      const status = fields[i++]; const first = fields[i++];
      files.push(/[RC]/.test(status[0]) ? { status, oldPath: first, path: fields[i++] } : { status, path: first });
    }
    return { hash, parents, files };
  }

  async historyDiff(hash: string, path: string): Promise<GitDiff> {
    const info = await this.history(hash); const file = info.files.find(f => f.path === path);
    if (!file) throw new Error('Arquivo não pertence à comparação deste commit');
    const before = !info.parents.length || file.status === 'A' ? '' : await this.blob(`${info.parents[0]}:${file.oldPath ?? path}`);
    const after = file.status === 'D' ? '' : await this.blob(`${hash}:${path}`);
    return { path, before, after, beforeLabel: info.parents[0]?.slice(0, 8) ?? 'Árvore vazia', afterLabel: hash.slice(0, 8), token: hash };
  }

  private async hunkData(path: string, staged: boolean) {
    const reviewed = await this.diff(path, staged);
    const { change } = await this.change(path);
    if (change.index === '?' || (staged ? change.index : change.worktree) !== 'M') throw new Error('Seleção por trecho disponível para arquivos de texto modificados. Use arquivo inteiro para inclusão, exclusão e rename.');
    const patch = await this.command(['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=0', ...(staged ? ['--cached'] : []), '--', path]);
    const start = patch.indexOf('\n@@ ');
    if (start < 0) throw new Error('Sem trechos textuais; use a operação de arquivo inteiro.');
    const prefix = patch.slice(0, start + 1);
    if (/^(old mode|new mode)/m.test(prefix)) throw new Error('Mudança de permissão requer revisão do arquivo inteiro.');
    const chunks = patch.slice(start + 1).split(/(?=^@@ )/m).filter(Boolean);
    return { token: reviewed.token, prefix, chunks };
  }

  async hunks(path: string, staged: boolean): Promise<GitHunks> {
    const data = await this.hunkData(path, staged);
    return { token: data.token, hunks: data.chunks.map((patch, id) => ({ id, patch })) };
  }

  applyHunk(path: string, staged: boolean, token: string, hunk: number) {
    return this.mutate(async () => {
      const data = await this.hunkData(path, staged);
      if (token !== data.token) throw new Error('O diff mudou. Reabra os trechos antes de aplicar.');
      if (!Number.isInteger(hunk) || !data.chunks[hunk]) throw new Error('Trecho inválido');
      const patch = data.prefix + data.chunks[hunk];
      const args = ['apply', '--cached', '--unidiff-zero', ...(staged ? ['--reverse'] : [])];
      await this.command([...args, '--check', '-'], patch);
      await this.command([...args, '-'], patch);
    });
  }

  operation(input: GitOperation) {
    return this.mutate(async () => {
      const state = await this.status();
      if (!input || state.head !== input.expectedHead) throw new Error('HEAD mudou. Atualize e revise a operação.');
      const target = input.target ?? '';
      if (typeof target !== 'string' || target.startsWith('-') || /[\0\r\n]/.test(target)) throw new Error('Destino inválido');
      const branch = async () => {
        if (!target || !(await this.branches()).some(b => b.name === target && !b.remote)) throw new Error('Selecione uma branch local existente.');
      };
      const clean = () => { if (state.changes.length) throw new Error('Prepare um commit ou guarde as alterações em stash antes desta operação.'); };
      let args: string[];
      switch (input.kind) {
        case 'create-branch':
          clean(); await this.command(['check-ref-format', '--branch', target]); args = ['switch', '-c', target]; break;
        case 'switch': clean(); await branch(); args = ['switch', '--no-guess', target]; break;
        case 'delete-branch': await branch(); args = ['branch', '-d', '--', target]; break;
        case 'merge': clean(); await branch(); args = ['merge', '--no-edit', target]; break;
        case 'rebase': clean(); await branch(); args = ['rebase', target]; break;
        case 'cherry-pick': case 'revert':
          clean(); this.validHash(target); args = [input.kind, ...(input.kind === 'revert' ? ['--no-edit'] : []), target]; break;
        case 'fetch': {
          const remotes = (await this.command(['remote'])).trim().split('\n');
          if (!target || !remotes.includes(target)) throw new Error('Informe um remoto configurado.');
          args = ['fetch', '--', target]; break;
        }
        case 'pull': clean(); args = ['pull', '--ff-only', '--no-rebase']; break;
        case 'push': {
          const remote = (await this.command(['config', '--get', `branch.${state.branch}.remote`])).trim();
          const destination = (await this.command(['config', '--get', `branch.${state.branch}.merge`])).trim();
          if (!destination.startsWith('refs/heads/') || !remote || remote.startsWith('-')) throw new Error('Configure upstream da branch antes do push.');
          args = ['push', '--porcelain', '--', remote, `HEAD:${destination}`]; break;
        }
        case 'stash':
          if (!state.changes.length) throw new Error('Nenhuma alteração para guardar.');
          args = ['stash', 'push', '--include-untracked', '-m', target || 'PHP IDE']; break;
        case 'stash-apply':
          clean(); if (!/^stash@\{\d+\}$/.test(target)) throw new Error('Informe uma referência stash@{n} válida.');
          args = ['stash', 'apply', '--index', target]; break;
        case 'merge-abort': args = ['merge', '--abort']; break;
        case 'rebase-abort': args = ['rebase', '--abort']; break;
        case 'rebase-continue': args = ['-c', 'core.editor=true', 'rebase', '--continue']; break;
        default: throw new Error('Operação Git não suportada');
      }
      return (await this.command(args)).trim() || 'Operação concluída. Atualize o estado para conferir o resultado.';
    });
  }

  async conflict(path: string): Promise<GitConflict> {
    const state = await this.status();
    if (!state.changes.some(c => c.path === path && conflicts.has(c.index + c.worktree))) throw new Error('Arquivo não está em conflito');
    const entries = (await this.command(['ls-files', '--unmerged', '-z', '--', path])).split('\0').filter(Boolean);
    const stages = new Map<number, string>();
    for (const entry of entries) { const [mode, object, stage] = entry.split('\t')[0].split(' '); if (!/^100(644|755)$/.test(mode)) throw new Error('Conflito de symlink/submódulo não suportado'); stages.set(Number(stage), object); }
    // Initial resolver supports content conflicts with both sides present; deletion requires a separate choice contract.
    if (!stages.has(2) || !stages.has(3)) throw new Error('Conflito de exclusão/rename exige resolução externa nesta versão.');
    const base = stages.has(1) ? await this.blob(stages.get(1)!) : '';
    const ours = await this.blob(stages.get(2)!); const theirs = await this.blob(stages.get(3)!);
    const result = await this.local(path);
    return { path, base, ours, theirs, result, ...await this.sides(state), token: digest(JSON.stringify([state.indexToken, path, result])) };
  }

  /** Nomes exibidos para os lados: branch atual × branch/commit integrado. */
  private async sides(state: GitState): Promise<{ operation: GitConflict['operation']; oursLabel: string; theirsLabel: string }> {
    const ref = async (name: string) => (await this.command(['rev-parse', '--verify', '--quiet', name]).catch(() => '')).trim();
    const short = (hash: string) => hash.slice(0, 8);
    const gitDir = (await this.command(['rev-parse', '--absolute-git-dir'])).trim();
    if (state.mergeHead) {
      const message = await readFile(`${gitDir}/MERGE_MSG`, 'utf8').catch(() => '');
      const branch = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(message)?.[1];
      return { operation: 'merge', oursLabel: state.branch, theirsLabel: branch ?? short(state.mergeHead) };
    }
    const picked = await ref('CHERRY_PICK_HEAD'); if (picked) return { operation: 'cherry-pick', oursLabel: state.branch, theirsLabel: short(picked) };
    const reverted = await ref('REVERT_HEAD'); if (reverted) return { operation: 'revert', oursLabel: state.branch, theirsLabel: `revert ${short(reverted)}` };
    const onto = await readFile(`${gitDir}/rebase-merge/onto`, 'utf8').catch(() => '');
    const applying = await ref('REBASE_HEAD');
    // Durante rebase, ours é a base de destino e theirs o commit sendo reaplicado.
    if (onto || applying) return { operation: 'rebase', oursLabel: onto ? `base ${short(onto.trim())}` : 'base do rebase', theirsLabel: applying ? short(applying) : 'commit reaplicado' };
    return { operation: 'merge', oursLabel: state.branch, theirsLabel: 'incoming' };
  }

  resolve(path: string, text: string, token: string) {
    return this.mutate(async () => {
      const reviewed = await this.conflict(path);
      if (reviewed.token !== token) throw new Error('O conflito mudou desde a revisão. Reabra antes de resolver.');
      if (typeof text !== 'string' || /^([<]{7}|[=]{7}|[>]{7}|[|]{7})/m.test(text)) throw new Error('Remova os marcadores de conflito antes de concluir.');
      const workspace = new Workspace(this.root); const file = await workspace.read(path);
      if (file.text !== reviewed.result) throw new Error('O arquivo mudou durante a resolução. Reabra o conflito.');
      await workspace.save(path, text, file.etag);
      await this.command(['add', '--', path]);
    });
  }
}
