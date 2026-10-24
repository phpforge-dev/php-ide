import {t as tr} from './i18n';
import type {IdeApi} from '../shared/contracts';
import {essentialPlugins,outstanding,hasBackgroundWork,coversUpdate,type MaintenanceState,type PluginJob} from '../shared/app-maintenance';
import './app-maintenance.css';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const item=document.createElement(tag);item.textContent=text;item.className=className;return item;};
const button=(text:string,click:()=>void,className='')=>{const item=node('button',text,className);item.type='button';item.onclick=click;return item;};
const permission=(name:string)=>tr(({'project.read':'Ler arquivos do projeto','project.write':'Alterar arquivos do projeto',process:'Executar processos','native.tool':'Executar ferramenta nativa',workbench:'Integrar a interface da IDE',network:'Acessar a rede'} as Record<string,string>)[name]??name);
const descriptions:Record<string,string>={
 'phpforge.laravel':'Rotas, views Blade, configurações, traduções e Eloquent para Laravel.',
 'phpforge.dotenv':'Sugestões e navegação em variáveis de ambiente.',
 'phpforge.docker':'Sugestões e diagnósticos para Dockerfile e Compose.',
 'phpforge.bash':'Sugestões e navegação em scripts Bash.',
 'phpforge.prettier':'Formate JavaScript, TypeScript, Vue, JSON, HTML, CSS e Markdown com Prettier.',
 'phpforge.php-debugger':'Depure PHP com Xdebug, breakpoints e inspeção de variáveis.',
 'phpforge.composer':'Gerencie dependências e execute scripts do Composer.',
 'phpforge.php-tests':'Execute PHPUnit e Pest, acompanhe resultados e navegue até as falhas.',
 'phpforge.markdown':'Edite Markdown com prévia ao vivo, links e diagramas Mermaid.',
 'phpforge.symfony':'Navegue por rotas, templates Twig, serviços e parâmetros do Symfony.',
 'phpforge.ignore':'Complete padrões e caminhos em arquivos de ignore.',
 'phpforge.svg-preview':'Visualize SVG enquanto edita, com zoom e opções de fundo.',
 'phpforge.image-preview':'Abra imagens com zoom, dimensões e opções de transparência.',
 'phpforge.php-intelligence':'Autocomplete, navegação, inspeções e refatorações PHP.',
 'phpforge.docker-services':'Gerencie containers, serviços Compose e logs do Docker.',
 'phpforge.terminal':'Use terminais integrados, com abas e sessões do projeto.',
 'phpforge.git':'Revise alterações, crie commits e gerencie branches e histórico.',
 'phpforge.agents':'Conecte agentes de programação e revise as alterações propostas.',
 'phpforge.php-formatter':'Formate código PHP respeitando as configurações do projeto.',
 'phpforge.database':'Conecte fontes de dados, navegue por tabelas e execute consultas SQL.',
 'phpforge.web-languages':'Sugestões e diagnósticos para JavaScript, TypeScript, React e Vue.',
};
const jobLabel=(job:PluginJob)=>tr(({queued:'Na fila',downloading:'Baixando e verificando…',installed:'Instalado',failed:'Não foi possível instalar',review:'Novas permissões precisam da sua aprovação',staged:'Pronto para aplicar ao reabrir'} as const)[job.status]);

export async function mountAppMaintenance(api:IdeApi) {
 const call=(method:string,...args:unknown[])=>((api as unknown as Record<string,(...args:unknown[])=>Promise<unknown>>)[method](...args));
 let state=await call('appMaintenanceResume') as MaintenanceState;
 let feedback='';let busy=false;let closed=false;let setup:HTMLElement|undefined;
 let setupFinish:(()=>void)|undefined;const selected=new Set<string>();let search='';
 const launcher=button(tr('Atualizações e instalações'),()=>show(),'maintenance-launcher');launcher.id='app-maintenance';
 const dialog=node('dialog','','maintenance-dialog');dialog.setAttribute('aria-label',tr('Atualizações e instalações'));
 const notice=node('aside','','maintenance-notice');notice.hidden=true;notice.setAttribute('role','status');
 const panel=node('div','','maintenance-content');
 const head=node('header');head.append(node('h2',tr('Atualizações e instalações')),button(tr('Fechar'),()=>dialog.close()));dialog.append(head,panel);
 document.body.append(launcher,dialog,notice);
 for(const type of ['click','keydown'])dialog.addEventListener(type,event=>event.stopPropagation());
 const execute=async(work:()=>Promise<unknown>)=>{if(busy)return;busy=true;feedback='';try{await work();}catch(error){feedback=String(error);}finally{busy=false;await refresh();}};
 function restart(installIde=false) {
  if(!window.dispatchEvent(new Event('beforeunload',{cancelable:true}))){feedback=tr('Salve os arquivos alterados antes de reiniciar.');render();return;}
  if(!window.confirm(tr('Reiniciar a IDE agora? Terminais e tarefas em execução serão encerrados.')))return;
  void execute(async()=>{await call(installIde?'appInstallIdeUpdate':'appApplyIdeOnExit',true);if(!window.dispatchEvent(new Event('beforeunload',{cancelable:true})))throw Error(tr('Salve os arquivos alterados antes de reiniciar.'));await call('appRestart');});
 }
 function settings(parent:HTMLElement) {
  const section=node('section','','maintenance-preferences');section.append(node('h3',tr('Preferências de atualização')));
  const options:[keyof MaintenanceState['preferences'],string,string][]=[
   ['checkUpdates','Verificar novas versões','Consultar ao abrir e a cada quatro horas. Não instala atualizações.'],
   ['autoUpdatePlugins','Baixar atualizações de plugins automaticamente','Desativado por padrão. As versões verificadas são aplicadas ao reabrir a IDE. Novas permissões exigem aprovação.'],
   ['autoUpdateIde','Baixar atualizações da IDE automaticamente','Desativado por padrão. A atualização assinada é aplicada ao fechar a IDE ou quando você escolher reiniciar.'],
  ];
  for(const [key,title,detail] of options){const label=node('label');const input=node('input');input.type='checkbox';input.checked=state.preferences[key];input.disabled=busy||(key==='autoUpdateIde'&&!state.ideAutoUpdateAvailable);input.dataset.preference=key;
   const text=node('span');text.append(node('strong',tr(title)),node('small',tr(detail)));label.append(input,text);
   input.onchange=()=>void execute(async()=>{await call('appMaintenancePreferences',{[key]:input.checked});if(input.checked&&key!=='checkUpdates')await check();});section.append(label);
  }
  if(!state.ideAutoUpdateAvailable)section.append(node('p',tr('Atualização automática da IDE não está disponível neste build. Você receberá avisos e poderá abrir a página de downloads.'),'maintenance-muted'));
  parent.append(section);
 }
 function jobs(parent:HTMLElement) {
  if(!state.jobs.length)return;
  const section=node('section','','maintenance-jobs');section.append(node('h3',tr('Instalações e downloads')));
  for(const job of state.jobs){const row=node('article','','maintenance-job');row.dataset.job=job.id;const text=node('div');text.append(node('strong',job.name),node('small',jobLabel(job)));if(job.error)text.append(node('p',job.error,'maintenance-error'));row.append(text);
   if(job.status==='failed')row.append(button(tr('Tentar novamente'),()=>void execute(()=>call(job.kind==='install'?'appQueuePlugin':'appQueuePluginUpdate',job.id))));
   if(job.status==='review'){text.append(node('p',job.permissions.map(permission).join(' · ')));row.append(button(tr('Permitir e baixar atualização'),()=>void execute(()=>call('appApprovePluginUpdate',job.id))));}
   section.append(row);
  }
  if(state.jobs.some(job=>job.status==='staged'))section.append(button(tr('Reiniciar para aplicar plugins'),()=>restart(), 'primary'));
  parent.append(section);
 }
 function renderSetup() {
  if(!setup)return;
  const focus=document.activeElement as HTMLInputElement|null;const focusId=focus?.dataset.plugin;const searchFocus=focus?.id==='setup-search';const caret=searchFocus?focus.selectionStart:null;
  setup.replaceChildren();
  const heading=node('header');heading.append(node('span','PHP IDE','maintenance-brand'),node('h1',tr('Monte seu ambiente')),node('p',tr('Escolha os plugins que deseja instalar. Os downloads continuam em segundo plano enquanto você usa a IDE.')));
  const tools=node('div','','maintenance-setup-tools');tools.append(button(tr('Selecionar PHP essencial'),()=>{for(const id of essentialPlugins)if(state.defaults.some(plugin=>plugin.id===id))selected.add(id);renderSetup();}),button(tr('Limpar seleção'),()=>{selected.clear();renderSetup();}));
  const searchInput=node('input');searchInput.id='setup-search';searchInput.type='search';searchInput.value=search;searchInput.placeholder=tr('Buscar plugins');searchInput.setAttribute('aria-label',tr('Buscar plugins'));tools.prepend(searchInput);
  const choices=node('div','','maintenance-choices');
  for(const plugin of state.defaults){const job=state.jobs.find(job=>job.id===plugin.id);const card=node('label','','maintenance-choice');const input=node('input');input.type='checkbox';input.dataset.plugin=plugin.id;input.checked=selected.has(plugin.id)||!!job;input.disabled=!!job&&job.status!=='failed';input.onchange=()=>{if(input.checked)selected.add(plugin.id);else selected.delete(plugin.id);updateSelection();};
   const description=tr(descriptions[plugin.id]??plugin.description);const text=node('span');text.append(node('strong',plugin.name),node('small',description),node('small',plugin.permissions.length?plugin.permissions.map(permission).join(' · '):tr('Sem permissões adicionais'),'maintenance-permissions'));
   card.dataset.search=`${plugin.name} ${plugin.description} ${description}`.toLocaleLowerCase();if(job)text.append(node('small',jobLabel(job)));card.append(input,text);choices.append(card);
  }
  const filter=()=>{for(const card of choices.querySelectorAll<HTMLElement>('.maintenance-choice'))card.hidden=!card.dataset.search?.includes(search.toLocaleLowerCase());};searchInput.oninput=()=>{search=searchInput.value;filter();};filter();
  const actions=node('footer');const install=button(tr('Instalar selecionados'),()=>void execute(async()=>{for(const id of selected){const job=state.jobs.find(job=>job.id===id);if(!job||job.status==='failed')await call('appQueuePlugin',id);}selected.clear();}), 'primary');install.id='setup-install';
  const continueButton=button(tr('Continuar para a IDE'),()=>void execute(async()=>{await call('appSetupComplete');setup?.remove();setup=undefined;setupFinish?.();}));continueButton.id='setup-continue';actions.append(install,continueButton);
  const status=node('p',feedback,'maintenance-feedback');status.setAttribute('role','status');setup.append(heading,tools,choices,actions,status);jobs(setup);settings(setup);updateSelection();
  if(focusId)setup.querySelector<HTMLInputElement>(`input[data-plugin="${CSS.escape(focusId)}"]`)?.focus();
  if(searchFocus){searchInput.focus();if(caret!==null)searchInput.setSelectionRange(caret,caret);}
 }
 function updateSelection(){const install=setup?.querySelector<HTMLButtonElement>('#setup-install');if(install){const count=[...selected].filter(id=>!state.jobs.some(job=>job.id===id&&job.status!=='failed')).length;install.disabled=busy||!count;install.textContent=tr('Instalar selecionados ({0})',count);}}
 function render() {
  const focused=document.activeElement as HTMLElement|null;const preferenceFocus=focused?.dataset.preference;const inDialog=!!focused&&dialog.contains(focused);
  const count=outstanding(state);const active=hasBackgroundWork(state);const staged=state.jobs.some(job=>job.status==='staged')||['ready','installed'].includes(state.ideProgress?.status??'');
  launcher.textContent=active?tr('Instalando em segundo plano…'):staged?tr('Atualizações prontas'):count?tr('{0} atualizações disponíveis',count):tr('Atualizações e instalações');
  launcher.dataset.pending=String(count>0||staged);launcher.title=launcher.textContent;
  panel.replaceChildren();
  const summary=node('p',tr('PHP IDE {0}',state.ideVersion));panel.append(summary,button(state.checking?tr('Verificando…'):tr('Verificar agora'),()=>void check()));panel.querySelector<HTMLButtonElement>('button')!.disabled=state.checking;
  if(state.checkedAt)panel.append(node('small',tr('Última verificação: {0}',new Date(state.checkedAt*1000).toLocaleString()),'maintenance-muted'));
  if(feedback)panel.append(node('p',feedback,'maintenance-error'));
  for(const error of state.errors)panel.append(node('p',error,'maintenance-error'));
  if(state.ide){const row=node('article','','maintenance-release');row.append(node('h3',tr('PHP IDE {0} disponível',state.ide.version)));
   if(state.ide.notes){const details=node('details');details.append(node('summary',tr('Notas da versão')),node('pre',state.ide.notes));row.append(details);}
   const progress=state.ideProgress;
   if(progress?.status==='installed')row.append(button(tr('Reiniciar para concluir'),()=>restart(),'primary'));
   else if(progress?.status==='ready')row.append(button(tr('Instalar e reiniciar'),()=>restart(true),'primary'));
   else if(progress?.status==='downloading')row.append(node('p',progress.total?tr('Baixando: {0}%',Math.min(100,Math.round((progress.bytes??0)/progress.total*100))):tr('Baixando atualização assinada…')));
   else {if(progress?.error)row.append(node('p',progress.error,'maintenance-error'));row.append(button(state.ide.signed?tr('Baixar atualização'):tr('Abrir downloads'),()=>void execute(()=>call(state.ide!.signed?'appPrepareIdeUpdate':'appOpenReleases'))));}
   panel.append(row);
  }
  for(const update of state.updates){const job=state.jobs.find(job=>coversUpdate(job,update));if(job&&['queued','downloading','staged','review','installed'].includes(job.status))continue;
   const row=node('article','','maintenance-release');row.append(node('strong',update.name),node('p',`${update.currentVersion} → ${update.version}`),button(tr('Baixar atualização'),()=>void execute(()=>call('appQueuePluginUpdate',update.id))));panel.append(row);
  }
  jobs(panel);settings(panel);renderSetup();
  if(preferenceFocus)(inDialog?panel:setup)?.querySelector<HTMLInputElement>(`input[data-preference="${CSS.escape(preferenceFocus)}"]`)?.focus({preventScroll:true});
 }
 let refreshTimer:ReturnType<typeof setTimeout>|undefined;
 async function refresh(){try{const next=await call('appMaintenanceState') as MaintenanceState;const changed=state.jobs.some(job=>job.status!=='installed'&&next.jobs.some(n=>n.id===job.id&&n.status==='installed'));state=next;if(changed)window.dispatchEvent(new Event('ide-user-plugins-changed'));render();}catch(error){feedback=String(error);panel.append(node('p',feedback,'maintenance-error'));}}
 const scheduleRefresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),100);};
 window.addEventListener('ide-app-maintenance',scheduleRefresh);
 function show(){render();if(!dialog.open)dialog.showModal();void refresh();}
 let announced='';
 async function check(){try{await call('appCheckUpdates');await refresh();const key=state.updates.map(p=>`${p.id}@${p.version}`).join('|')+(state.ide?.version??'');if(outstanding(state)&&key!==announced){announced=key;notice.replaceChildren(node('span',tr('Há novas atualizações disponíveis.')),button(tr('Ver atualizações'),show),button(tr('Dispensar'),()=>{notice.hidden=true;}));notice.hidden=false;}}catch(error){feedback=String(error);await refresh();}}
 render();
 const timer=setInterval(()=>{if(state.preferences.checkUpdates)void check();},4*60*60*1000);
 window.addEventListener('online',()=>{if(state.preferences.checkUpdates)void check();});
 return {
  async setup(){if(state.preferences.setupComplete)return;setup=node('main','','maintenance-setup');setup.id='first-run-plugins';document.getElementById('app')!.replaceChildren(setup);renderSetup();await new Promise<void>(resolve=>{setupFinish=resolve;});},
  start(){if(!closed&&state.preferences.checkUpdates)void check();},show,
  dispose(){closed=true;clearInterval(timer);clearTimeout(refreshTimer);window.removeEventListener('ide-app-maintenance',scheduleRefresh);launcher.remove();notice.remove();dialog.remove();},
 };
}
