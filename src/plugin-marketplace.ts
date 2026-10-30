import { t as tr } from './i18n';
import type { InstalledPlugin, PluginManifest } from '../shared/language/plugins/api';

type CatalogPlugin = { id: string; name: string; description: string; author: string; version: string; minIdeVersion: string; repository: string; revision: string };
type Preview = { token: string; manifest: PluginManifest; origin: { repository: string; revision: string } };
type Options = {
 call(method: string, ...args: unknown[]): Promise<any>;
 installed(): readonly InstalledPlugin[];
 ideVersion(): string;
 onInstalled(plugin: InstalledPlugin): Promise<void>;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
 const item = document.createElement(tag); item.className = className; item.textContent = text; return item;
};
const button = (text: string, action: () => void) => { const b = el('button', '', text); b.type = 'button'; b.onclick = action; return b; };
const newer = (a: string, b: string) => {
 const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
 for (let i = 0; i < 3; i++) { if (aa[i] !== bb[i]) return aa[i] > bb[i]; }
 return false;
};
export function mountPluginMarketplace(options: Options) {
 const root = el('section', 'plugin-marketplace');
 const search = el('input'); search.type = 'search'; search.placeholder = tr('Buscar plugins por nome ou função…'); search.setAttribute('aria-label', tr('Buscar plugins no Marketplace'));
 const feedback = el('p', 'plugin-meta'); feedback.setAttribute('role', 'status');
 const results = el('div', 'marketplace-results');
 const reload = button(tr('Atualizar catálogo'), () => { void load(); });
 const git = el('form', 'plugin-git-form'); git.hidden = true;
 const url = el('input'); url.type = 'url'; url.required = true; url.placeholder = 'https://github.com/autor/plugin'; url.setAttribute('aria-label', tr('URL do repositório Git'));
 const ref = el('input'); ref.placeholder = tr('Tag, branch ou commit (opcional)'); ref.setAttribute('aria-label', tr('Versão do repositório'));
 const inspect = button(tr('Consultar repositório'), () => git.requestSubmit());
 const gitStatus = el('p', 'plugin-meta'); gitStatus.setAttribute('role', 'status');
 git.append(el('h3', '', tr('Instalar pelo Git')), el('p', 'plugin-meta', tr('Informe a URL HTTPS de um repositório com plugin.json na raiz. Não é necessário executar comandos ou compilar o plugin.')), url, ref, inspect, gitStatus);
 const gitButton = button(tr('Instalar pelo Git…'), () => { git.hidden = !git.hidden; if (!git.hidden) url.focus(); });
 const tools = el('div', 'marketplace-tools'); tools.append(search, reload, gitButton);
 root.append(tools, git, feedback, results);
 let entries: CatalogPlugin[] = [], loaded = false, busy = false;
 function controls(value: boolean) { busy = value; for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input')) control.disabled = value; root.setAttribute('aria-busy', String(value)); }
 function render() {
  const query = search.value.trim().toLocaleLowerCase();
  const matching = entries.filter(p => `${p.name} ${p.description} ${p.author} ${p.id}`.toLocaleLowerCase().includes(query));
  results.replaceChildren(...matching.map(p => {
   const installed = options.installed().find(i => i.manifest?.id === p.id);
   const current = installed?.manifest?.version;
   const incompatible = newer(p.minIdeVersion, options.ideVersion());
   const update = !!current && newer(p.version, current);
   const card = el('article', 'plugin-card'); card.dataset.catalogPlugin = p.id;
   const header = el('header'); header.append(el('strong', '', p.name), el('span', 'plugin-version', p.version), el('span', 'plugin-scope', p.author));
   const install = button(current ? update ? tr('Atualizar') : tr('Instalado') : tr('Instalar'), () => { void download('pluginInspectCatalog', p.id); });
   install.disabled = busy || incompatible || (!!current && !update); install.dataset.installPlugin = p.id;
   const actions = el('div', 'plugin-actions'); actions.append(install);
   card.append(header, el('p', 'plugin-meta', p.description), el('p', 'plugin-dir', p.repository), el('p', 'plugin-meta', tr('Requer PHP IDE {0} ou superior', p.minIdeVersion)), actions);
   return card;
  }));
  if (!matching.length && loaded) results.append(el('p', 'plugin-meta', query ? tr('Nenhum plugin encontrado. Tente outro nome ou instale pela URL Git.') : tr('O catálogo ainda não tem plugins. Você pode instalar pela URL Git.')));
 }
 async function load() {
  if (busy) return; controls(true); feedback.textContent = tr('Carregando catálogo…');
  try {
   const data = await options.call('pluginCatalog'); entries = data.plugins; loaded = true;
   feedback.textContent = data.warning ?? tr('{0} plugins disponíveis', entries.length);
  } catch (error) { feedback.textContent = String(error); }
  finally { controls(false); render(); }
 }
 async function download(method: string, ...args: string[]) {
  if (busy) return; controls(true); feedback.textContent = tr('Baixando o plugin para conferir os dados…'); gitStatus.textContent = '';
  try { const preview: Preview = await options.call(method, ...args);
   if(root.hidden || !root.closest<HTMLDialogElement>('dialog')?.open){await options.call('pluginDiscardPreview',preview.token);feedback.textContent=tr('Instalação cancelada.');return;}
   feedback.textContent = ''; await confirm(preview); }
  catch (error) { feedback.textContent = String(error); gitStatus.textContent = String(error); }
  finally { controls(false); render(); }
 }
 function confirm(preview: Preview): Promise<void> {
  return new Promise(resolve => {
   const d = el('dialog', 'plugin-consent plugin-install-preview');
   for(const type of ['click','keydown'])d.addEventListener(type,event=>event.stopPropagation());
   d.setAttribute('aria-label', tr('Conferir instalação do plugin'));
   const m = preview.manifest;
   const installed = options.installed().find(p => p.manifest?.id === m.id);
   const status = el('p', 'plugin-meta'); status.setAttribute('role', 'status');
   const perms = el('ul', 'plugin-permissions');
   for (const permission of m.permissions) perms.append(el('li', '', permission));
   const finish = () => { d.close(); d.remove(); resolve(); };
   let confirming = false;
   const cancel = button(tr('Cancelar'), () => { if (!confirming) { void options.call('pluginDiscardPreview', preview.token).catch(() => {}); finish(); } });
   const install = button(installed ? tr('Substituir versão instalada') : tr('Instalar'), () => {
    confirming = true; install.disabled = cancel.disabled = true; status.textContent = tr('Instalando plugin…');
    void (async () => {
     try { const p = await options.call('pluginConfirmInstall', preview.token); finish(); await options.onInstalled(p); }
     catch (error) { confirming = false; status.textContent = String(error); install.disabled = cancel.disabled = false; }
    })();
   });
   install.className = 'primary';
   d.addEventListener('cancel', e => { e.preventDefault(); cancel.click(); });
   const actions = el('div', 'plugin-actions'); actions.append(cancel, install);
   d.append(el('h2', '', m.name), el('p', 'plugin-meta', `${m.id} · ${m.version}`), el('p', '', m.description ?? ''), el('p', 'plugin-dir', preview.origin.repository), el('p', 'plugin-dir', tr('Commit: {0}', preview.origin.revision)),
    el('p', '', installed ? tr('A versão {0} será substituída. Suas permissões serão conferidas antes da ativação.', installed.manifest!.version) : tr('Depois de instalar, você escolhe quais permissões conceder.')),
    el('h3', '', tr('Permissões solicitadas')), perms, status, actions);
   document.body.append(d); d.showModal(); cancel.focus();
  });
 }
 git.onsubmit = e => { e.preventDefault(); void download('pluginInspectGit', url.value.trim(), ref.value.trim()); };
 search.oninput = render;
 return { element: root, show() { if (!loaded && !busy) void load(); else render(); }, git() { git.hidden = false; url.focus(); }, find(id: string) { search.value = id; render(); search.focus(); }, refresh: render };
}
