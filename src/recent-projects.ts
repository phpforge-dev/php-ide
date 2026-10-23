import { t as tr, html } from './i18n';
import type { IdeApi } from '../shared/contracts';
export function mountRecentProjects(api: IdeApi, open: (path?: string) => Promise<boolean>) {
 const button=document.getElementById('open')!;let popup:HTMLElement|undefined;let epoch=0;
 button.setAttribute('aria-label',tr('Projetos recentes'));button.title=tr('Projetos recentes');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
 function close() {epoch++;popup?.remove();popup=undefined;button.setAttribute('aria-expanded','false');}
 async function show() {
  if(popup){close();return;}const token=++epoch;
  const root=document.createElement('section');popup=root;root.className='recent-projects';root.setAttribute('role','dialog');root.setAttribute('aria-label',tr('Projetos recentes'));
  root.innerHTML=html('<div class="recent-actions"><button id="recent-open">＋ Abrir projeto…</button></div><input type="search" aria-label="Buscar projetos recentes" placeholder="Buscar projetos…"><div class="recent-heading">PROJETOS RECENTES</div><div class="recent-list"></div><p class="recent-feedback" role="status" aria-live="polite"></p><footer><span>Remover da lista não apaga arquivos</span><button id="recent-clear">Limpar lista</button></footer>');
  const rect=button.getBoundingClientRect();root.style.left=Math.max(8,Math.min(rect.left,innerWidth-470))+'px';root.style.top=(rect.bottom+5)+'px';document.body.append(root);button.setAttribute('aria-expanded','true');
  const filter=root.querySelector('input')!;const list=root.querySelector<HTMLElement>('.recent-list')!;const feedback=root.querySelector<HTMLElement>('.recent-feedback')!;let busy=false;
  async function choose(path?:string) {if(busy)return;busy=true;feedback.textContent=tr('Abrindo projeto…');try{if(await open(path))close();else feedback.textContent='';}catch(error){feedback.textContent=String(error);}finally{busy=false;}}
  root.querySelector<HTMLButtonElement>('#recent-open')!.onclick=()=>void choose();
  async function render() {
   try {const [entries,current]=await Promise.all([api.recentProjects(),api.workspace()]);if(token!==epoch)return;
    list.replaceChildren();const query=filter.value.toLocaleLowerCase();const visible=entries.filter(e=>(e.name+' '+e.path).toLocaleLowerCase().includes(query));
    if(!visible.length){list.textContent=entries.length?tr('Nenhum projeto corresponde à busca.'):tr('Seus projetos abertos aparecerão aqui.');return;}
    for(const entry of visible) {
     const row=document.createElement('div');row.className='recent-row';row.dataset.path=entry.path;
     const target=document.createElement('button');target.className='recent-target';target.type='button';target.disabled=!entry.available;
     const badge=document.createElement('span');badge.className='recent-badge';badge.textContent=entry.name.slice(0,2).toLocaleUpperCase();
     const content=document.createElement('span');const name=document.createElement('strong');name.textContent=entry.name;const path=document.createElement('small');path.textContent=entry.path;path.title=entry.path;content.append(name,path);
     const note=document.createElement('span');note.className='recent-note';note.textContent=!entry.available?tr('Indisponível'):entry.path===current.root?tr('Atual'):'';
     target.append(badge,content,note);target.title=entry.available?entry.path:tr('Pasta não encontrada. Use Abrir projeto para localizar a nova pasta.');
     target.onclick=()=>{if(entry.path===current.root){close();return;}void choose(entry.path);};
     const remove=document.createElement('button');remove.type='button';remove.className='recent-remove';remove.textContent='×';remove.setAttribute('aria-label',tr('Remover ')+entry.name+tr(' dos recentes'));
     remove.onclick=()=>{void api.forgetRecentProject(entry.path).then(render).catch(e=>feedback.textContent=String(e));};row.append(target,remove);list.append(row);
    }
   }catch(error){if(token===epoch)feedback.textContent=String(error);}
  }
  root.querySelector<HTMLButtonElement>('#recent-clear')!.onclick=()=>{void api.clearRecentProjects().then(render).catch(e=>feedback.textContent=String(e));};
  filter.oninput=()=>void render();root.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();close();button.focus();}
   const items=[...root.querySelectorAll<HTMLButtonElement>('.recent-target:not(:disabled)')];const at=items.indexOf(document.activeElement as HTMLButtonElement);
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[at<0 ? (e.key==='ArrowDown'?0:items.length-1) : (at+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
   if(e.key==='Enter'&&document.activeElement===filter){e.preventDefault();items[0]?.click();}
  });filter.focus();await render();
 }
 button.onclick=()=>void show();document.addEventListener('mousedown',e=>{if(popup&&!popup.contains(e.target as Node)&&!button.contains(e.target as Node))close();});
 return {close};
}
