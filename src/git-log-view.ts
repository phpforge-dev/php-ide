import {t as tr,msg,html,activeLanguage} from './i18n';
import {fileIcon} from './file-icons';
import './git-log.css';
import {dockWindow,resizeToolWindow,toolIcon} from './tool-window';
import type {GitCommit,IdeApi} from '../shared/contracts';
export function gitLogView(api:IdeApi,hooks:{diff(path:string,revision:string):void;branches():void;operation(kind:'revert'|'cherry-pick',hash:string):void;commit():void}){
 const panel=document.createElement('section');panel.id='git-log-panel';panel.hidden=true;
 panel.innerHTML=html`<div class="tool-window-resize" id="git-log-resize" role="separator" tabindex="0" aria-label="Altura do Git" aria-orientation="horizontal"></div>
 <div class="tool-window-head"><strong>Git</strong><span class="tool-window-tab" id="git-log-title">Log</span><button id="git-log-commit">Commit</button><span class="tool-window-space"></span><span id="git-log-count"></span><button id="git-log-hide" aria-label="Ocultar Git">−</button></div>
 <div class="git-log-body"><div class="git-log-actions"><button id="git-log-refresh" title="Atualizar histórico"></button><button id="git-log-branches" title="Branches e operações…"></button><button id="git-toggle-branches" title="Ocultar branches" aria-pressed="true"></button></div>
 <div class="git-log-layout"><nav class="git-refs-pane" aria-label="Branches do histórico"><input id="git-branch-search" type="search" placeholder="Branch" aria-label="Buscar branches"><div id="git-log-refs"></div></nav>
 <section class="git-commits-pane"><div class="git-log-toolbar"><input id="git-log-search" type="search" aria-label="Buscar commits" placeholder="Texto ou hash"><select id="git-ref-filter" aria-label="Branch"></select><select id="git-user-filter" aria-label="Autor"><option value="">Autor: todos</option></select><label class="git-date-filter" title="Desde a data"><input id="git-date-filter" type="date" aria-label="Desde a data"></label></div>
 <div class="git-log-columns"><span>Mensagem</span><span>Autor</span><span>Data</span></div><div id="git-log"></div></section>
 <section class="git-history-detail"><h3>Arquivos alterados <span id="git-history-count"></span></h3><div id="git-history-files"></div><div id="git-history-info"></div><div id="git-history-actions" hidden><button id="git-history-revert">Reverter…</button><button id="git-history-pick">Cherry-pick…</button></div></section></div></div><div id="git-log-status" role="status" aria-live="polite"></div>`;
 document.querySelector('.code')!.append(panel);
 const el=<T extends HTMLElement=HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
 toolIcon(el('git-log-refresh'),'<path d="M19 7a8 8 0 1 0 1 8M19 3v5h-5"/>',tr('Atualizar histórico'));
 toolIcon(el('git-log-branches'),'<circle cx="7" cy="5" r="2"/><circle cx="17" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><path d="M7 7v10m10-10c0 7-10 2-10 8"/>',tr('Branches e operações…'));
 toolIcon(el('git-toggle-branches'),'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',tr('Ocultar branches'));
 el('git-toggle-branches').onclick=()=>{const hidden=panel.classList.toggle('git-branches-hidden');el('git-toggle-branches').setAttribute('aria-pressed',String(!hidden));};
 const button=document.getElementById('show-git')!;let entries:GitCommit[]=[];let ref='HEAD';let epoch=0;let selection=0;let selected:string|undefined;let selectedCommit:GitCommit|undefined;let branches:Awaited<ReturnType<IdeApi['gitBranches']>>=[];
 const feedback=(text:string)=>el('git-log-status').textContent=text;
 function hide(){panel.hidden=true;button.setAttribute('aria-pressed','false');}
 const show=dockWindow(panel,button,hide);resizeToolWindow(panel,el('git-log-resize'),'php-ide-git-height');
 async function choose(commit:GitCommit){
  const request=++selection;selected=commit.hash;selectedCommit=commit;render();el('git-history-files').replaceChildren();el('git-history-info').textContent=tr('Carregando…');el('git-history-actions').hidden=true;
  try{const history=await api.gitHistory(commit.hash);if(request!==selection)return;
   el('git-history-count').textContent=String(history.files.length);
   for(const file of history.files){const row=document.createElement('button');row.className='git-file-row';row.dataset.status=file.status;row.textContent=file.path.split('/').pop()!;row.title=file.path;const directory=document.createElement('small');directory.textContent=file.path.includes('/')?file.path.slice(0,file.path.lastIndexOf('/')):'';row.append(directory);row.prepend(fileIcon(file.path));row.onclick=()=>hooks.diff(file.path,commit.hash);el('git-history-files').append(row);}
   const title=document.createElement('strong');title.textContent=commit.subject;const meta=document.createElement('p');meta.textContent=`${commit.hash}\n${commit.author}\n${new Date(commit.date).toLocaleString(activeLanguage)}`;el('git-history-info').replaceChildren(title,meta);el('git-history-actions').hidden=false;
  }catch(error){if(request===selection){el('git-history-info').textContent=String(error);feedback(String(error));}}
 }
 function render(){
  const query=el<HTMLInputElement>('git-log-search').value.trim().toLowerCase();const author=el<HTMLSelectElement>('git-user-filter').value;const date=el<HTMLInputElement>('git-date-filter').value;const visible=entries.filter(c=>(c.subject+' '+c.author+' '+c.hash).toLowerCase().includes(query)&&(!author||c.author===author)&&(!date||c.date.slice(0,10)>=date));
  el('git-log').replaceChildren(...visible.map(commit=>{const row=document.createElement('button');row.className='git-commit-row';row.dataset.hash=commit.hash;row.setAttribute('aria-pressed',String(selected===commit.hash));
   const subject=document.createElement('span');subject.className='git-commit-subject';subject.textContent=commit.subject;const hash=document.createElement('small');hash.textContent=commit.hash.slice(0,8);subject.append(hash);if(commit.refs){const refs=document.createElement('em');refs.className='git-ref-label';refs.textContent=commit.refs;refs.title=commit.refs;subject.prepend(refs);}
   const author=document.createElement('span');author.textContent=commit.author;const date=document.createElement('time');date.textContent=new Date(commit.date).toLocaleDateString(activeLanguage);date.title=new Date(commit.date).toLocaleString(activeLanguage);row.append(subject,author,date);row.onclick=()=>void choose(commit);row.onkeydown=event=>{const index=visible.indexOf(commit);const next=event.key==='ArrowDown'?visible[index+1]:event.key==='ArrowUp'?visible[index-1]:undefined;if(next){event.preventDefault();void choose(next);el('git-log').querySelector<HTMLButtonElement>(`[data-hash="${next.hash}"]`)?.focus();}};return row;}));el('git-log-count').textContent=msg`${visible.length} commits`;drawGraph(visible);
 }
 function drawGraph(commits:GitCommit[]){
  const lanes=new Map<string,number>();const active:(string|undefined)[]=[];
  const free=()=>{const index=active.indexOf(undefined);return index<0?active.length:index;};
  for(const commit of entries){let lane=active.indexOf(commit.hash);if(lane<0)lane=free();lanes.set(commit.hash,lane);active[lane]=undefined;
   for(const [index,parent]of (commit.parents??[]).entries()){if(active.includes(parent))continue;const slot=index===0&&active[lane]===undefined?lane:free();active[slot]=parent;}
  }
  const ns='http://www.w3.org/2000/svg';const graph=document.createElementNS(ns,'svg');graph.classList.add('git-log-graph');graph.setAttribute('aria-hidden','true');
  const width=Math.max(24,active.length*12+12);graph.setAttribute('width',String(width));graph.setAttribute('height',String(commits.length*26));el('git-log').style.setProperty('--git-graph-width',width+'px');
  const x=(hash:string)=>12+(lanes.get(hash)??0)*12;const positions=new Map(commits.map((commit,index)=>[commit.hash,index*26+13]));
  for(const commit of commits){const y=positions.get(commit.hash)!;for(const parent of commit.parents??[]){const end=positions.get(parent);if(end===undefined)continue;const line=document.createElementNS(ns,'path');line.setAttribute('d',`M${x(commit.hash)} ${y} C${x(commit.hash)} ${y+13} ${x(parent)} ${y+13} ${x(parent)} ${end}`);line.setAttribute('stroke',`var(--git-lane-${(lanes.get(commit.hash)??0)%4})`);line.setAttribute('fill','none');graph.append(line);}
   const node=document.createElementNS(ns,'circle');node.setAttribute('cx',String(x(commit.hash)));node.setAttribute('cy',String(y));node.setAttribute('r','3');node.setAttribute('fill',`var(--git-lane-${(lanes.get(commit.hash)??0)%4})`);graph.append(node);
  }el('git-log').prepend(graph);
 }
 function renderBranches(){
  const container=el('git-log-refs');container.replaceChildren();const query=el<HTMLInputElement>('git-branch-search').value.toLowerCase();
  function row(parent:HTMLElement,value:string,label:string,current=false){const button=document.createElement('button');button.textContent=label;button.dataset.ref=value;button.title=label;button.classList.toggle('git-current-branch',current);button.setAttribute('aria-pressed',String(ref===value));button.onclick=()=>{ref=value;void load();};parent.append(button);}
  row(container,'HEAD','HEAD ('+tr('Branch atual')+')');row(container,'--all',tr('Todas as branches'));
  for(const remote of [false,true]){const group=document.createElement('details');group.open=true;const label=document.createElement('summary');label.textContent=remote?tr('Remotas'):tr('Local');group.append(label);
   for(const branch of branches.filter(b=>b.remote===remote&&!b.name.endsWith('/HEAD')&&b.name.toLowerCase().includes(query)))row(group,(remote?'refs/remotes/':'refs/heads/')+branch.name,branch.name,branch.current);
   container.append(group);
  }
 }
 async function load(){const token=++epoch;selection++;selected=undefined;selectedCommit=undefined;el('git-history-files').replaceChildren();el('git-history-count').textContent='';el('git-history-info').textContent=tr('Selecione um commit para ver os arquivos e detalhes.');el('git-history-actions').hidden=true;feedback(tr('Carregando histórico…'));
  try{const [loadedBranches,commits]=await Promise.all([api.gitBranches(),api.gitLog(ref)]);if(token!==epoch)return;branches=loadedBranches;entries=commits;
   const filter=el<HTMLSelectElement>('git-ref-filter');filter.replaceChildren();for(const [value,label]of [['HEAD',tr('Branch atual')],['--all',tr('Todas as branches')],...branches.map(b=>[(b.remote?'refs/remotes/':'refs/heads/')+b.name,b.name])]){const option=document.createElement('option');option.value=value;option.textContent=label;filter.append(option);}filter.value=ref;
   const users=el<HTMLSelectElement>('git-user-filter');const previous=users.value;users.replaceChildren();for(const user of ['',...new Set(commits.map(c=>c.author))]){const option=document.createElement('option');option.value=user;option.textContent=user||tr('Autor: todos');users.append(option);}if([...users.options].some(o=>o.value===previous))users.value=previous;
   el('git-log-title').textContent='Log'+(ref==='HEAD'||ref==='--all'?'':': '+ref.replace(/^refs\/(heads|remotes)\//,''));renderBranches();render();
   feedback(commits.length?tr('Até 100 commits. Selecione um arquivo do commit para comparar.'):tr('Nenhum commit nesta branch.'));
  }catch(error){if(token===epoch){entries=[];branches=[];el('git-log-refs').replaceChildren();render();feedback(String(error));}}
 }
 async function open(){show();await load();}
 button.onclick=()=>panel.hidden?void open():hide();el('git-log-hide').onclick=hide;el('git-log-refresh').onclick=()=>void load();el('git-log-branches').onclick=hooks.branches;el('git-log-commit').onclick=hooks.commit;el<HTMLInputElement>('git-log-search').oninput=render;
 el<HTMLInputElement>('git-branch-search').oninput=renderBranches;el<HTMLSelectElement>('git-ref-filter').onchange=()=>{ref=el<HTMLSelectElement>('git-ref-filter').value;void load();};el<HTMLSelectElement>('git-user-filter').onchange=render;el<HTMLInputElement>('git-date-filter').oninput=render;
 el('git-history-revert').onclick=()=>{if(selectedCommit)hooks.operation('revert',selectedCommit.hash);};el('git-history-pick').onclick=()=>{if(selectedCommit)hooks.operation('cherry-pick',selectedCommit.hash);};
 return {open,refresh:()=>{if(!panel.hidden)void load();},reset(){epoch++;selection++;entries=[];branches=[];ref='HEAD';selected=undefined;selectedCommit=undefined;for(const id of ['git-log-search','git-branch-search','git-date-filter'])el<HTMLInputElement>(id).value='';el<HTMLSelectElement>('git-user-filter').value='';el<HTMLSelectElement>('git-ref-filter').replaceChildren();el('git-log-title').textContent='Log';el('git-history-count').textContent='';render();el('git-log-refs').replaceChildren();el('git-history-files').replaceChildren();el('git-history-info').replaceChildren();el('git-history-actions').hidden=true;hide();}};
}
