import { t as tr, msg, html } from './i18n';
import type { GitOperation, GitState, GitTools, IdeApi } from '../shared/contracts';

type Hooks = { hasUnsaved(): boolean; busy(): boolean; setBusy(value: boolean): void; changed(): Promise<void>; feedback(message: string): void };
export function gitBranches(api: IdeApi, hooks: Hooks, advanced: () => void) {
 const dialog=document.createElement('dialog');dialog.id='git-branches-popup';
 dialog.setAttribute('aria-label',tr('Branches Git'));
 dialog.innerHTML=html`<div class="branch-popup-heading"><strong id="branch-current"></strong><button id="branch-close" aria-label="Fechar">×</button></div><div class="branch-toolbar"><button id="branch-new">Nova branch…</button><button id="branch-fetch">Fetch</button><button id="branch-pull">Pull</button></div><input id="branch-search" type="search" placeholder="Buscar branch…" aria-label="Buscar branch…"><div id="branch-list"></div><form id="branch-create" hidden><label>Nome da branch<input id="branch-name" required autocomplete="off" placeholder="feature/minha-mudanca"></label><label class="branch-check"><input id="branch-checkout" type="checkbox" checked>Trocar para a nova branch</label><button type="submit">Criar branch</button><button type="button" id="branch-create-cancel">Cancelar</button></form><div id="branch-delete" hidden><p id="branch-delete-label"></p><button id="branch-delete-confirm">Excluir branch local</button><button id="branch-delete-cancel">Cancelar</button></div><pre id="branch-result" role="status" aria-live="polite"></pre><button id="branch-advanced">Mais operações Git…</button>`;
 document.body.append(dialog);
 const el=<T extends HTMLElement=HTMLElement>(id:string)=>dialog.querySelector<T>('#'+id)!;
 const search=el<HTMLInputElement>('branch-search');
 let tools:GitTools={branches:[],remotes:[],stashes:[]};let state:GitState;let pendingDelete='';let epoch=0;
 function render(){
  const list=el('branch-list');list.replaceChildren();const query=search.value.trim().toLowerCase();
  for(const remote of [false,true]){
   const branches=tools.branches.filter(b=>b.remote===remote&&!b.name.endsWith('/HEAD')&&b.name.toLowerCase().includes(query));
   if(!branches.length)continue;
   const heading=document.createElement('h3');heading.textContent=remote?tr('Branches remotas'):tr('Branches locais');list.append(heading);
   for(const branch of branches){
    const row=document.createElement('div');row.className='branch-row';row.dataset.branch=branch.name;
    const name=document.createElement('span');name.className='branch-name';name.textContent=(branch.current?'● ':'⑂ ')+branch.name;name.title=branch.name;
    const detail=document.createElement('small');detail.textContent=[branch.upstream,branch.tracking].filter(Boolean).join(' ');name.append(detail);row.append(name);
    if(branch.current){const current=document.createElement('span');current.textContent=tr('Atual');row.append(current);}
    else {const checkout=document.createElement('button');checkout.textContent=tr('Trocar');checkout.dataset.checkout=branch.name;checkout.onclick=()=>void execute({kind:remote?'checkout-remote':'switch',target:branch.name});row.append(checkout);}
    if(!remote&&!branch.current){const remove=document.createElement('button');remove.textContent=tr('Excluir');remove.dataset.delete=branch.name;remove.onclick=()=>{pendingDelete=branch.name;el('branch-create').hidden=true;el('branch-delete').hidden=false;el('branch-delete-label').textContent=msg`Excluir a branch local ${branch.name}? Commits não integrados impedem a exclusão.`;el('branch-delete-confirm').focus();};row.append(remove);}
    list.append(row);
   }
  }
  if(!list.children.length){const empty=document.createElement('p');empty.textContent=tr('Nenhuma branch encontrada.');list.append(empty);}
  el('branch-current').textContent=msg`Branch atual: ${state.branch}`;
  el<HTMLButtonElement>('branch-fetch').disabled=!tools.remotes.length;
  el<HTMLButtonElement>('branch-pull').disabled=!tools.branches.some(b=>b.current&&b.upstream);
  el('branch-pull').title=tr('Atualizar a branch atual pelo upstream, somente fast-forward');
 }
 async function load(){tools=await api.gitTools();state=await api.gitStatus();render();}
 async function execute(input:Omit<GitOperation,'expectedHead'>){
  if(hooks.busy())return;
  if(input.kind!=='fetch'&&hooks.hasUnsaved()){el('branch-result').textContent=tr('Salve os buffers antes de executar a operação.');return;}
  hooks.setBusy(true);dialog.querySelectorAll<HTMLInputElement|HTMLButtonElement>('button,input').forEach(e=>e.disabled=true);el('branch-result').textContent=tr('Executando…');
  try {const output=await api.gitOperation({...input,expectedHead:state.head,expectedBranch:state.branch});el('branch-result').textContent=msg`Operação concluída. ${output}`;el('branch-create').hidden=true;el('branch-delete').hidden=true;}
  catch(error){el('branch-result').textContent=String(error);}
  finally {
   // Fetch does not modify the working tree and must not dispose unsaved editor buffers.
   try{if(input.kind!=='fetch')await hooks.changed();}catch(error){hooks.feedback(String(error));}
   hooks.setBusy(false);dialog.querySelectorAll<HTMLInputElement|HTMLButtonElement>('button,input').forEach(e=>e.disabled=false);
   try{await load();}catch(error){el('branch-result').textContent+='\n'+String(error);}
  }
 }
 search.oninput=render;
 el('branch-close').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',e=>{if(hooks.busy())e.preventDefault();});
 el('branch-new').onclick=()=>{el('branch-delete').hidden=true;el('branch-create').hidden=false;el<HTMLInputElement>('branch-name').focus();};
 el('branch-create-cancel').onclick=()=>el('branch-create').hidden=true;
 el('branch-delete-cancel').onclick=()=>el('branch-delete').hidden=true;
 el('branch-delete-confirm').onclick=()=>void execute({kind:'delete-branch',target:pendingDelete});
 el('branch-create').onsubmit=e=>{e.preventDefault();void execute({kind:'create-branch',target:el<HTMLInputElement>('branch-name').value.trim(),checkout:el<HTMLInputElement>('branch-checkout').checked});};
 el('branch-fetch').onclick=()=>void execute({kind:'fetch',target:''});
 el('branch-pull').onclick=()=>void execute({kind:'pull'});
 el('branch-advanced').onclick=()=>{dialog.close();advanced();};
 return {async open(){if(hooks.busy()||dialog.open)return;const version=++epoch;try{search.value='';await load();if(version!==epoch)return;el('branch-result').textContent=tr('Fetch busca atualizações. Pull integra o upstream na branch atual.');el('branch-create').hidden=true;el('branch-delete').hidden=true;dialog.showModal();search.focus();}catch(error){hooks.feedback(String(error));}},close(){epoch++;dialog.close();}};
}
