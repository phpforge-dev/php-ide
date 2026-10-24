import * as monaco from 'monaco-editor';
import { t as tr } from './i18n';
import type { IdeApi } from '../shared/contracts';
import type { InstalledPlugin, PluginPermission, ProjectFiles } from '../shared/language/plugins/api';
import { setExternalPlugins } from '../shared/language/plugins/host';
import { SandboxedPlugin, WORKER_SOURCE, type Channel, type PluginServices } from '../shared/language/plugins/sandbox';
import './plugin-manager.css';
import { mountPluginMarketplace } from './plugin-marketplace';

// Plugins de terceiros: descoberta pelo backend, consentimento na primeira ativação,
// execução em Web Worker e tela Plugins (Aparência › Plugins ou clique na barra de status).
type Listing = { ideVersion: string; userDir: string; projectDir: string; permissions: PluginPermission[]; plugins: InstalledPlugin[] };
const permissionText = (p: PluginPermission): [string, string] => ({
 'project.read': [tr('Ler arquivos do projeto'), tr('Conteúdo de qualquer arquivo do projeto, inclusive .env e outros segredos.')],
 'project.write': [tr('Criar e alterar arquivos do projeto'), tr('Qualquer arquivo do projeto, exceto .git e .php-ide.')],
 process: [tr('Executar processos'), tr('Programas com os seus privilégios de usuário, na raiz do projeto. Equivale a acesso total à sua conta.')],
 'native.tool': ['Executar ferramenta nativa', 'Executável Rust do plugin com os seus privilégios. Pode acessar arquivos, rede e processos fora do projeto. Ative apenas pacotes de confiança.'],
 workbench: ['Integrar a interface da IDE', 'Código do plugin na janela da IDE, com acesso à interface e aos dados exibidos. Não usa o isolamento dos plugins de linguagem.'],
 network: [tr('Acessar a rede'), tr('Requisições HTTP(S) a qualquer endereço, inclusive serviços locais.')],
} as Record<PluginPermission, [string, string]>)[p];
type Child = Node | string | null | false;
const parts = (children: Child[]) => children.filter((c): c is Node | string => c !== null && c !== false);
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] => {
 const el = Object.assign(document.createElement(tag), props);
 el.append(...parts(children));
 return el;
};

export function mountPluginManager(api: IdeApi) {
 const call = (method: string, ...args: unknown[]) => (api as any)[method](...args) as Promise<any>;
 let root = ''; let rootUri = 'file:///';
 let listing: Listing | null = null; let listError = ''; let feedback = '';
 let generation = 0;
 const runtimes = new Map<string, SandboxedPlugin>();
 const startErrors = new Map<string, string>();
 const toolErrors = new Map<string,string>();
 window.addEventListener('ide-tool-state',event=>{const {key,state,error}=(event as CustomEvent).detail;if(state==='failed')toolErrors.set(key,error);else toolErrors.delete(key);changed();});
 const asked = new Set<string>();
 const files: ProjectFiles = {
  get root() { return root; },
  read: async path => { try { return (await call('read', path)).text; } catch { return null; } },
  exists: async path => { try { await call('fileExists', path); return true; } catch { return false; } },
  list: async (dir, accept) => ((await call('listFiles', dir, false)) as string[]).filter(p => accept(p.split('/').pop()!)),
  uri: path => new URL(path, rootUri).href,
 };
 const services: PluginServices = {
  files,
  write: (key, path, text) => call('pluginWrite', key, path, text),
  exec: (key, program, args, input) => call('pluginExec', key, program, args, input ?? null),
  fetch: (key, url, options) => call('pluginFetch', key, url, options),
 };
 let workerUrl: string | undefined;
 const open = (): Channel => {
  workerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl, { name: 'php-ide-plugin' });
  return {
   post: message => worker.postMessage(message),
   listen: (receive, fail) => {
    worker.onmessage = event => receive(event.data);
    worker.onerror = event => { event.preventDefault(); fail(event.message || tr('Erro no worker do plugin')); };
    worker.onmessageerror = () => fail(tr('Mensagem inválida do plugin'));
   },
   terminate: () => worker.terminate(),
  };
 };

 let statusTimer: ReturnType<typeof setTimeout> | undefined;
 const refreshStatus = () => {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(async () => {
   const bar = document.getElementById('plugins'); if (!bar) return;
   try { bar.textContent = (await api.plugins()).map(p => p.version ? `${p.name}: ${p.version}` : p.name).join(' · '); } catch { /* barra de status é informativa */ }
  }, 150);
 };
 const changed = () => { render(); refreshStatus(); };
 const applies = async (p: InstalledPlugin) => {
  const markers = p.manifest?.activation.files ?? [];
  return !markers.length || (await Promise.all(markers.map(m => files.exists(m)))).some(Boolean);
 };
 const askKey = (p: InstalledPlugin) => `${p.key}@${p.manifest?.version}:${p.manifest?.permissions.join(',')}`;

 async function start(p: InstalledPlugin, current: number) {
  try {
   const source = await call('pluginSource', p.key);
   if (current !== generation) return;
   runtimes.set(p.key, new SandboxedPlugin(p.key, source.manifest, source.code, p.granted, services, open, { rootUri: source.rootUri, onChange: changed }));
  } catch (error) { startErrors.set(p.key, String(error)); }
 }
 async function reload(): Promise<void> {
  const current = ++generation;
  for (const runtime of runtimes.values()) runtime.stop();
  runtimes.clear(); startErrors.clear(); setExternalPlugins(null);
  try {
   const info = await call('workspace'); root = info.root; rootUri = info.rootUri;
   listing = await call('pluginList'); listError = '';
  } catch (error) { listing = null; listError = String(error); changed(); return; }
  if (current !== generation) return;
  const pending: InstalledPlugin[] = [];
  for (const p of listing!.plugins) {
   if (!p.manifest || p.error || !p.enabled) continue;
   if (p.needsConsent) { if (!p.manifest.tool && !p.manifest.workbench && !asked.has(askKey(p)) && await applies(p)) pending.push(p); continue; }
   await start(p, current);
  }
  if (current !== generation) return;
  const active = [...runtimes.values()];
  setExternalPlugins(() => active);
  window.dispatchEvent(new Event('ide-plugins-changed'));
  changed();
  // Consent must not hold the workbench's first paint behind the native splash.
  // The ready promise covers discovery and already-consented workers, not user decisions.
  if(pending.length)void (async()=>{
   for(const p of pending){if(current!==generation)return;asked.add(askKey(p));await decide(p);}
   if(current===generation)await reload();
  })().catch(error=>{feedback=String(error);changed();});
 }
 async function decide(p: InstalledPlugin) {
  const granted = await consent(p);
  try { await call('pluginSetState', p.key, granted ? { consent: true, enabled: true, granted } : { consent: false }); }
  catch (error) { feedback = String(error); }
 }

 function consent(p: InstalledPlugin): Promise<PluginPermission[] | null> {
  const m = p.manifest!;
  return new Promise(resolve => {
   const dialog = node('dialog', { className: 'plugin-consent' });
   for(const type of ['click','keydown'])dialog.addEventListener(type,event=>event.stopPropagation());
   dialog.setAttribute('aria-label', tr('Ativar plugin'));
   const boxes = new Map<PluginPermission, HTMLInputElement>();
   const perms = m.permissions.length ? node('ul', { className: 'plugin-permissions' }, ...m.permissions.map(perm => {
    const [label, detail] = permissionText(perm);
    const box = node('input', { type: 'checkbox', checked: true }); boxes.set(perm, box);
    return node('li', {}, node('label', {}, box, node('span', {}, node('strong', { textContent: label }), node('small', { textContent: `${perm} · ${detail}` }))));
   })) : node('p', { textContent: tr('Este plugin não pede permissões: recebe apenas o texto dos documentos que atende e responde com sugestões, destinos e avisos.') });
   const risky = m.permissions.includes('process') || (m.permissions.includes('project.read') && m.permissions.includes('network'));
   const finish = (value: PluginPermission[] | null) => { dialog.close(); dialog.remove(); resolve(value); };
   const deny = node('button', { type: 'button', textContent: tr('Não ativar'), onclick: () => finish(null) });
   const allow = node('button', { type: 'button', className: 'primary', textContent: tr('Ativar plugin'), onclick: () => finish([...boxes].filter(([, b]) => b.checked).map(([perm]) => perm)) });
   dialog.append(...parts([
    node('h2', { textContent: tr('Ativar o plugin “{0}”?', m.name) }),
    node('p', { className: 'plugin-meta', textContent: `${m.id} · ${m.version}${m.description ? ' · ' + m.description : ''}` }),
    node('p', { textContent: p.scope === 'project' ? tr('Veio com o projeto, em {0}. Ative só se confiar na origem do repositório.', p.dir) : tr('Instalado na sua pasta de plugins: {0}.', p.dir) }),
    m.permissions.length ? node('p', { textContent: m.permissions.includes('workbench') ? tr('Este plugin integra a janela da IDE e pode usar os serviços nativos declarados. Ative somente se confiar no repositório.') : tr('O código roda isolado e só alcança o que você permitir. Desmarque o que não quiser conceder; o plugin recebe um erro ao tentar usar.') }) : null,
    perms,
    risky ? node('p', { className: 'plugin-warning', textContent: tr('Atenção: com estas permissões o plugin pode enviar o conteúdo do projeto, inclusive segredos, para fora da máquina.') }) : null,
    node('div', { className: 'plugin-actions' }, deny, allow)]));
   dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
   document.body.append(dialog); dialog.showModal(); deny.focus();
  });
 }

 // Tela Plugins.
 const dialog = node('dialog', { id: 'plugins-dialog', className: 'plugins-dialog' });
 // Dialog input belongs to the manager, not the editor's global clipboard/shortcut handlers.
 for(const type of ['click','keydown'])dialog.addEventListener(type,event=>event.stopPropagation());
 dialog.setAttribute('aria-label', tr('Plugins'));
 const body = node('div', { className: 'plugins-body' });
 const marketplace = mountPluginMarketplace({ call, ideVersion:()=>listing?.ideVersion??'0.0.0', installed: () => listing?.plugins ?? [], onInstalled: async p => {
  feedback = tr('Instalado: {0} {1}', p.manifest?.name ?? p.key, p.manifest?.version ?? '');
  if (p.needsConsent && p.enabled) { asked.add(askKey(p)); await decide(p); }
  await reload();
 } });
 marketplace.element.hidden = true;
 const installedTab = node('button', { type:'button', textContent:tr('Instalados') });
 const marketplaceTab = node('button', { type:'button', textContent:tr('Marketplace') });
 const tabs = node('div', { className:'plugins-tabs' }, installedTab, marketplaceTab);
 tabs.setAttribute('role','tablist');
 const selectTab = (market: boolean) => { body.hidden=market; marketplace.element.hidden=!market;
  installedTab.setAttribute('aria-selected',String(!market)); marketplaceTab.setAttribute('aria-selected',String(market)); if(market)marketplace.show(); };
 for(const b of [installedTab,marketplaceTab])b.setAttribute('role','tab');
 installedTab.onclick=()=>selectTab(false); marketplaceTab.onclick=()=>selectTab(true); selectTab(false);

 const status = node('p', { className: 'plugins-feedback' }); status.setAttribute('role', 'status');
 const close = node('button', { type: 'button', className: 'plugins-close', textContent: '×', onclick: () => dialog.close() }); close.setAttribute('aria-label', tr('Fechar plugins'));
 const act = (run: () => Promise<unknown>) => async () => { feedback = ''; try { await run(); } catch (error: any) { feedback = String(error?.message ?? error); } await reload(); };
 const install = (kind: 'folder' | 'zip') => act(async () => {
  const installed: InstalledPlugin | null = await call('pluginInstall', null, kind);
  if (!installed) return;
  feedback = tr('Instalado: {0} {1}', installed.manifest?.name ?? installed.key, installed.manifest?.version ?? '');
  if (installed.needsConsent && installed.enabled) { asked.add(askKey(installed)); await decide(installed); }
 });
 dialog.append(
  node('div', { className: 'plugins-heading' }, node('h2', { textContent: tr('Plugins') }), close),
  node('div', { className: 'plugins-toolbar' },
   node('button', { type: 'button', textContent: tr('Instalar de pasta…'), onclick: install('folder') }),
   node('button', { type: 'button', textContent: tr('Instalar .zip…'), onclick: install('zip') }),
   node('button', { type:'button', textContent:tr('Instalar pelo Git…'), onclick:()=>{selectTab(true);marketplace.git();} }),
   node('button', { type: 'button', textContent: tr('Recarregar'), onclick: act(async () => { feedback = tr('Plugins recarregados'); }) })),
  tabs, status, body, marketplace.element);
 document.body.append(dialog);

 function badge(p: InstalledPlugin): [string, string] {
  if (p.error) return [tr('Erro no manifesto'), 'error'];
  if (!p.enabled) return [tr('Desativado'), 'off'];
  if (p.needsConsent) return [tr('Aguardando consentimento'), 'pending'];
  if (toolErrors.has(p.key)) return [tr('Falhou ao carregar'), 'error'];
  if (startErrors.has(p.key)) return [tr('Falhou ao carregar'), 'error'];
  const state = runtimes.get(p.key)?.info.state;
  return state === 'active' ? [tr('Ativo'), 'on'] : state === 'loading' ? [tr('Carregando'), 'pending'] : state === 'failed' ? [tr('Interrompido'), 'error'] : [tr('Parado'), 'off'];
 }
 function card(p: InstalledPlugin) {
  const m = p.manifest; const runtime = runtimes.get(p.key);
  const [label, kind] = badge(p);
  const errors = [p.error, startErrors.get(p.key), toolErrors.get(p.key), ...(runtime?.info.errors ?? [])].filter((e): e is string => !!e);
  const denied = runtime?.info.denied ?? [];
  let confirmRemove = false;
  const remove = p.scope === 'user' ? node('button', { type: 'button', textContent: tr('Remover') }) : null;
  if (remove) remove.onclick = () => {
   if (!confirmRemove) { confirmRemove = true; remove.textContent = tr('Confirmar remoção'); return; }
   void act(async () => { await call('pluginRemove', p.key); feedback = tr('Removido: {0}', m?.name ?? p.key); })();
  };
  const actions = node('div', { className: 'plugin-actions' },
   m ? node('button', { type: 'button', textContent: p.enabled ? tr('Desativar') : tr('Ativar'), onclick: act(async () => {
    if (!p.enabled && p.needsConsent) { asked.add(askKey(p)); await decide(p); return; }
    await call('pluginSetState', p.key, { enabled: !p.enabled });
   }) }) : null,
   m && m.permissions.length && p.enabled ? node('button', { type: 'button', textContent: tr('Revisar permissões'), onclick: act(async () => { asked.add(askKey(p)); await decide(p); }) }) : null,
   remove);
  const element = node('article', { className: 'plugin-card' },
   node('header', {}, node('strong', { textContent: m?.name ?? p.key }), m ? node('span', { className: 'plugin-version', textContent: m.version }) : null,
    node('span', { className: 'plugin-scope', textContent: p.scope === 'project' ? tr('Projeto') : tr('Usuário') }), node('span', { className: `plugin-badge plugin-${kind}`, textContent: label })),
   node('p', { className: 'plugin-meta', textContent: [m?.id, m?.description].filter(Boolean).join(' · ') }),
   node('p', { className: 'plugin-dir', textContent: p.dir, title: p.dir }),
   p.origin ? node('p',{className:'plugin-meta',textContent:tr('Origem: {0}',p.origin.repository)+(p.origin.revision?' · '+p.origin.revision.slice(0,12):'')}) : null,
   m ? (m.permissions.length ? node('ul', { className: 'plugin-permissions compact' }, ...m.permissions.map(perm => {
    const ok = p.granted.includes(perm);
    return node('li', { className: ok ? 'granted' : 'denied', title: permissionText(perm)[1] }, `${ok ? '✓' : '✗'} ${permissionText(perm)[0]}`);
   })) : node('p', { className: 'plugin-meta', textContent: tr('Sem permissões') })) : null,
   runtime?.info.hooks.length ? node('p', { className: 'plugin-meta', textContent: tr('Ganchos: {0}', runtime.info.hooks.join(', ')) }) : null,
   ...errors.map(e => node('pre', { className: 'plugin-error', textContent: e })),
   denied.length ? node('p', { className: 'plugin-warning', textContent: tr('Acesso negado: {0}', denied.join(', ')) }) : null,
   actions);
  element.dataset.installedPlugin=m?.id??p.key;return element;
 }
 async function render() {
  status.textContent = feedback; marketplace.refresh();
  if (!dialog.open) return;
  const external = new Set(listing?.plugins.map(p => p.manifest?.id).filter(Boolean));
  let internal: string[] = [];
  try { internal = (await api.plugins()).filter(p => !external.has(p.id)).map(p => p.version ? `${p.name} ${p.version}` : p.name); } catch { /* lista informativa */ }
  body.replaceChildren(...parts([
   listError ? node('pre', { className: 'plugin-error', textContent: listError }) : null,
   node('h3', { textContent: tr('Plugins instalados') }),
   ...(listing?.plugins.length ? listing.plugins.map(card) : [node('p', { className: 'plugin-meta', textContent: tr('Nenhum plugin instalado. Procure no Marketplace ou instale pela URL Git, pasta ou ZIP.') })]),
   node('h3', { textContent: tr('Integrados ativos neste projeto') }),
   node('p', { className: 'plugin-meta', textContent: internal.join(' · ') || '—' }),
   listing ? node('p', { className: 'plugin-dir', textContent: tr('Pasta do usuário: {0} · Projeto: {1} · PHP IDE {2}', listing.userDir, listing.projectDir, listing.ideVersion) }) : null]));
 }
 const show = () => { if (!dialog.open) dialog.showModal(); void render(); };

 // Pontos de entrada: Aparência › Plugins… e a lista de plugins na barra de status.
 const appearance = document.getElementById('appearance-dialog');
 if (appearance) appearance.append(node('button', { type: 'button', className: 'plugins-open', textContent: tr('Plugins…'), onclick: (event:Event) => { event.stopPropagation(); (appearance as HTMLDialogElement).close?.(); show(); } }));
 const bar = document.getElementById('plugins');
 if (bar) {
  bar.classList.add('plugins-status'); bar.tabIndex = 0; bar.setAttribute('role', 'button'); bar.title = tr('Plugins ativos neste projeto · clique para gerenciar');
  bar.onclick = show; bar.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } };
 }
 monaco.editor.registerCommand('php-ide.pluginCommand', async (_accessor, key: string, name: string, args: unknown[]) => {
  const provider = listing?.plugins.find(p => p.key === key);
  if (provider?.manifest?.tool && provider.granted.includes('workbench') && provider.granted.includes('native.tool') && runtimes.has(key)) { window.dispatchEvent(new CustomEvent('ide-tool-command', {detail:{key,name,args}})); return; }
  const result = await runtimes.get(key)?.command(name, Array.isArray(args) ? args : []);
  const line = document.getElementById('status');
  if (line && typeof result === 'string') line.textContent = result.slice(0, 300);
 });
 // Troca de projeto e alterações em .php-ide/plugins recarregam os plugins do projeto.
 let timer: ReturnType<typeof setTimeout> | undefined;
 const later = () => { clearTimeout(timer); timer = setTimeout(() => { void reload(); }, 300); };
 const project = document.getElementById('project');
 if (project) new MutationObserver(later).observe(project, { childList: true, characterData: true, subtree: true });
 window.addEventListener('ide-workspace-file-changed', event => { const path = String((event as CustomEvent).detail?.path ?? ''); if (path.includes('/.php-ide/plugins/')) later(); });
 window.addEventListener('ide-user-plugins-changed',later);
 window.addEventListener('ide-show-plugins',show);
 const ready = reload();
 void ready.catch(error => { feedback = String(error); changed(); });
 return { reload, show, ready };
}
