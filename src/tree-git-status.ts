import type { IdeApi } from '../shared/contracts';
import { t as tr } from './i18n';
import './tree-git-status.css';

/** Repaint visible rows in place: keep expansion, focus, scroll and selection. */
export function mountTreeGitStatus(api: IdeApi, tree: HTMLElement) {
 let generation=0;let timer:ReturnType<typeof setTimeout>|undefined;let running=false;let queued=false;
 const rows=()=>[...tree.querySelectorAll<HTMLElement>('button[data-path], summary[data-path]')];
 const apply=(row:HTMLElement,ignored:boolean)=>{
  if(ignored){row.dataset.vcs='ignored';row.title=row.dataset.path+' · '+tr('Ignorado pelo Git');row.setAttribute('aria-description',tr('Ignorado pelo Git'));}
  else if(row.dataset.vcs==='ignored'){delete row.dataset.vcs;row.title=row.dataset.path??'';row.removeAttribute('aria-description');}
 };
 async function refresh(){
  if(running){queued=true;return;}running=true;queued=false;const version=generation;
  try{
   const current=rows().filter(row=>row.getClientRects().length>0);const paths=[...new Set(current.map(row=>row.dataset.path!))];
   const ignored=new Set<string>();
   for(let i=0;i<paths.length;i+=1000){for(const path of await api.gitIgnored(paths.slice(i,i+1000)))ignored.add(path);if(version!==generation)return;}
   if(version===generation)for(const row of current)if(row.isConnected)apply(row,ignored.has(row.dataset.path!));
  }catch{if(version===generation)rows().forEach(row=>apply(row,false));}
  finally{running=false;if(queued)schedule();}
 }
 function schedule(){generation++;clearTimeout(timer);timer=setTimeout(()=>void refresh(),180);}
 // Child changes cover lazy expansion and icons; attribute painting does not recurse.
 new MutationObserver(schedule).observe(tree,{childList:true,subtree:true});
 tree.addEventListener('toggle',schedule,true);
 window.addEventListener('ide-workspace-file-changed',schedule);
 window.addEventListener('focus',schedule);
 window.addEventListener('ide-project-files-changed',schedule);
 // .git/info/exclude and external Git operations aren't emitted by the project watcher.
 setInterval(()=>{if(!document.hidden&&!tree.hidden)schedule();},5000);
 schedule();
 return {refresh:schedule};
}
