import {t as tr,msg,html,activeLanguage} from './i18n';
import {fileIcon} from './file-icons';
import {dockWindow,resizeToolWindow} from './tool-window';
import type {GitCommit,IdeApi} from '../shared/contracts';
export function gitLogView(api:IdeApi,hooks:{diff(path:string,revision:string):void;branches():void;operation(kind:'revert'|'cherry-pick',hash:string):void;commit():void}){
 const panel=document.createElement('section');panel.id='git-log-panel';panel.hidden=true;
 panel.innerHTML=html`<div class="tool-window-resize" id="git-log-resize" role="separator" tabindex="0" aria-label="Altura do Git" aria-orientation="horizontal"></div><div class="tool-window-head"><strong>Git</strong><span class="tool-window-tab">Log</span><button id="git-log-commit">Alterações locais</button><span class="tool-window-space"></span><button id="git-log-refresh" title="Atualizar histórico">↻</button><button id="git-log-hide" aria-label="Ocultar Git">−</button></div><div class="git-log-toolbar"><button id="git-log-branches">⑂ Branches…</button><input id="git-log-search" type="search" aria-label="Buscar commits" placeholder="Buscar mensagem, autor ou hash…"><span id="git-log-count"></span></div><div class="git-log-layout"><nav id="git-log-refs" aria-label="Branches do histórico"></nav><section class="git-commits-pane"><div class="git-log-columns"><span>Mensagem</span><span>Autor</span><span>Data</span></div><div id="git-log"></div></section><section class="git-history-detail"><h3>Arquivos alterados</h3><div id="git-history-files"></div><div id="git-history-info"></div><div id="git-history-actions" hidden><button id="git-history-revert">Reverter…</button><button id="git-history-pick">Cherry-pick…</button></div></section></div><div id="git-log-status" role="status" aria-live="polite"></div>`;
 document.querySelector('.code')!.append(panel);
 const el=<T extends HTMLElement=HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
 const button=document.getElementById('show-git')!;let entries:GitCommit[]=[];let ref='HEAD';let epoch=0;let selection=0;let selected:string|undefined;let selectedCommit:GitCommit|undefined;
 const feedback=(text:string)=>el('git-log-status').textContent=text;
 function hide(){panel.hidden=true;button.setAttribute('aria-pressed','false');}
 const show=dockWindow(panel,button,hide);resizeToolWindow(panel,el('git-log-resize'),'php-ide-git-height');
 async function choose(commit:GitCommit){
  const request=++selection;selected=commit.hash;selectedCommit=commit;render();el('git-history-files').replaceChildren();el('git-history-info').textContent=tr('Carregando…');el('git-history-actions').hidden=true;
  try{const history=await api.gitHistory(commit.hash);if(request!==selection)return;
   for(const file of history.files){const row=document.createElement('button');row.className='git-file-row';row.textContent=`${file.status} ${file.path}`;row.prepend(fileIcon(file.path));row.onclick=()=>hooks.diff(file.path,commit.hash);el('git-history-files').append(row);}
   const title=document.createElement('strong');title.textContent=commit.subject;const meta=document.createElement('p');meta.textContent=`${commit.hash}\n${commit.author}\n${new Date(commit.date).toLocaleString(activeLanguage)}`;el('git-history-info').replaceChildren(title,meta);el('git-history-actions').hidden=false;
  }catch(error){if(request===selection){el('git-history-info').textContent=String(error);feedback(String(error));}}
 }
 function render(){
  const query=el<HTMLInputElement>('git-log-search').value.trim().toLowerCase();const visible=entries.filter(c=>(c.subject+' '+c.author+' '+c.hash).toLowerCase().includes(query));
  el('git-log').replaceChildren(...visible.map(commit=>{const row=document.createElement('button');row.className='git-commit-row';row.dataset.hash=commit.hash;row.setAttribute('aria-pressed',String(selected===commit.hash));
   const subject=document.createElement('span');subject.className='git-commit-subject';subject.textContent=commit.subject;const hash=document.createElement('small');hash.textContent=commit.hash.slice(0,8);subject.append(hash);
   const author=document.createElement('span');author.textContent=commit.author;const date=document.createElement('time');date.textContent=new Date(commit.date).toLocaleDateString(activeLanguage);date.title=new Date(commit.date).toLocaleString(activeLanguage);row.append(subject,author,date);row.onclick=()=>void choose(commit);return row;}));el('git-log-count').textContent=msg`${visible.length} commits`;
 }
 async function load(){const token=++epoch;selection++;selected=undefined;selectedCommit=undefined;el('git-history-files').replaceChildren();el('git-history-info').textContent=tr('Selecione um commit para ver os arquivos e detalhes.');el('git-history-actions').hidden=true;feedback(tr('Carregando histórico…'));
  try{const [branches,commits]=await Promise.all([api.gitBranches(),api.gitLog(ref)]);if(token!==epoch)return;entries=commits;render();const refs=el('git-log-refs');refs.replaceChildren();
   for(const [value,label]of [['HEAD',tr('Branch atual')],['--all',tr('Todas as branches')],...branches.filter(b=>!b.name.endsWith('/HEAD')).map(b=>[(b.remote?'refs/remotes/':'refs/heads/')+b.name,'⑂ '+b.name])]){const b=document.createElement('button');b.textContent=label;b.dataset.ref=value;b.setAttribute('aria-pressed',String(ref===value));b.onclick=()=>{ref=value;void load();};refs.append(b);}
   feedback(tr('Até 100 commits. Selecione um arquivo do commit para comparar.'));
  }catch(error){if(token===epoch){entries=[];render();feedback(String(error));}}
 }
 async function open(){show();await load();}
 button.onclick=()=>panel.hidden?void open():hide();el('git-log-hide').onclick=hide;el('git-log-refresh').onclick=()=>void load();el('git-log-branches').onclick=hooks.branches;el('git-log-commit').onclick=hooks.commit;el<HTMLInputElement>('git-log-search').oninput=render;
 el('git-history-revert').onclick=()=>{if(selectedCommit)hooks.operation('revert',selectedCommit.hash);};el('git-history-pick').onclick=()=>{if(selectedCommit)hooks.operation('cherry-pick',selectedCommit.hash);};
 return {open,refresh:()=>{if(!panel.hidden)void load();},reset(){epoch++;selection++;entries=[];ref='HEAD';selected=undefined;render();el('git-log-refs').replaceChildren();el('git-history-files').replaceChildren();el('git-history-info').replaceChildren();el('git-history-actions').hidden=true;hide();}};
}
