import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
export type RpcMessage = { id?: number | string; method?: string; params?: any; result?: any; error?: { code?: number; message: string } };
export class RpcProcess {
  private child: ChildProcessWithoutNullStreams;
  private bytes = Buffer.alloc(0);
  private counter = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private closed = false;
  onNotification: (message: RpcMessage) => void = () => {};
  onRequest: (message: RpcMessage) => unknown = () => null;
  onError: (message: string) => void = () => {};
  onStderr: (message: string) => void = () => {};
  constructor(command: string, args: string[], private framing: 'lsp' | 'lines', cwd: string) {
    this.child = spawn(command, args, { cwd, stdio: 'pipe', windowsHide: true });
    this.child.stdout.on('data', chunk => this.consume(chunk));
    this.child.stderr.on('data', chunk => this.onStderr(String(chunk).slice(-2000)));
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('exit', code => this.fail(new Error(`Processo encerrado (${code ?? 'sinal'})`)));
  }
  request(method: string, params: unknown, timeout = 30000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Processo indisponível'));
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Tempo esgotado: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  notify(method: string, params: unknown) { this.send({ method, params }); }
  private send(message: RpcMessage) {
    if (this.closed) return;
    const value = JSON.stringify(this.framing === 'lsp' ? { jsonrpc: '2.0', ...message } : message);
    this.child.stdin.write(this.framing === 'lsp' ? `Content-Length: ${Buffer.byteLength(value)}\r\n\r\n${value}` : value + '\n');
  }
  private consume(chunk: Buffer) {
    this.bytes = Buffer.concat([this.bytes, chunk]);
    if (this.bytes.length > 16 * 1024 * 1024) { this.fail(new Error('Resposta excedeu o limite de transporte')); this.dispose(); return; }
    while (this.bytes.length) {
      let start = 0, end = 0, next = 0;
      if (this.framing === 'lines') {
        end = this.bytes.indexOf(10); if (end < 0) return; next = end + 1;
      } else {
        const boundary = this.bytes.indexOf('\r\n\r\n'); if (boundary < 0) return;
        const match = /Content-Length:\s*(\d+)/i.exec(this.bytes.subarray(0, boundary).toString());
        if (!match) { this.fail(new Error('Cabeçalho LSP inválido')); this.dispose(); return; }
        start = boundary + 4; end = start + Number(match[1]); next = end;
        if (this.bytes.length < end) return;
      }
      const line = this.bytes.subarray(start, end).toString(); this.bytes = this.bytes.subarray(next);
      if (!line.trim()) continue;
      try { this.receive(JSON.parse(line)); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    }
  }
  private receive(message: RpcMessage) {
    if (message.method) {
      if (message.id !== undefined) {
        Promise.resolve().then(() => this.onRequest(message)).then(result => this.send({ id: message.id, result }),
          error => this.send({ id: message.id, error: { code: -32603, message: String(error) } }));
      } else this.onNotification(message);
      return;
    }
    const item = this.pending.get(Number(message.id)); if (!item) return;
    clearTimeout(item.timer); this.pending.delete(Number(message.id));
    if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
  }
  private fail(error: Error) {
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear(); this.onError(error.message);
  }
  dispose() { this.fail(new Error('Sessão encerrada')); this.child.kill(); }
}
