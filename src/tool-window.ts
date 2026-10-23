// Shared docking behavior for our tool windows; no reference-product resources.
export function dockWindow(panel:HTMLElement,button:HTMLElement,hide:()=>void){
 document.addEventListener('ide-dock-open',event=>{if((event as CustomEvent).detail!==panel.id)hide();});
 return ()=>{document.dispatchEvent(new CustomEvent('ide-dock-open',{detail:panel.id}));panel.hidden=false;button.setAttribute('aria-pressed','true');};
}
export function resizeToolWindow(panel:HTMLElement,handle:HTMLElement,key:string){
 const apply=(height:number)=>{const max=(panel.parentElement?.clientHeight??600)*.7;panel.style.height=Math.round(Math.min(max,Math.max(210,height)))+'px';};
 try{const saved=Number(localStorage.getItem(key));if(saved)apply(saved);}catch{}
 const save=()=>{try{localStorage.setItem(key,String(panel.clientHeight));}catch{}};
 handle.onpointerdown=e=>{handle.setPointerCapture(e.pointerId);e.preventDefault();};
 handle.onpointermove=e=>{if(handle.hasPointerCapture(e.pointerId))apply(panel.getBoundingClientRect().bottom-e.clientY);};
 handle.onpointerup=e=>{handle.releasePointerCapture(e.pointerId);save();};
 handle.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();apply(panel.clientHeight+(e.key==='ArrowUp'?20:-20));save();}};
}
export function toolIcon(button:HTMLElement,path:string,label:string){
 button.setAttribute('aria-label',label);button.title=label;
 button.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
