// Shared docking behavior for our tool windows; no reference-product resources.
export function dockWindow(panel:HTMLElement,button:HTMLElement,hide:()=>void){
 document.addEventListener('ide-dock-open',event=>{if((event as CustomEvent).detail!==panel.id)hide();});
 return ()=>{document.dispatchEvent(new CustomEvent('ide-dock-open',{detail:panel.id}));panel.hidden=false;button.setAttribute('aria-pressed','true');};
}
export function resizeToolWindow(panel:HTMLElement,handle:HTMLElement,key:string,floor=210){
 // Cap by the dock column so the editor keeps a usable strip; recompute on every
 // apply so a stale localStorage height from a taller window cannot pin the panel
 // at the CSS/JS ceiling (native smoke shares WKWebView storage across runs).
 const maxHeight=()=>{
  const parent=panel.parentElement?.clientHeight||0;
  if(parent<=0)return Math.floor((window.innerHeight||600)*.7);
  return Math.floor(Math.min(parent*.7,Math.max(floor,parent-120)));
 };
 const apply=(height:number)=>{panel.style.height=Math.round(Math.min(maxHeight(),Math.max(floor,height)))+'px';};
 const current=()=>Number.parseInt(panel.style.height,10)||panel.clientHeight;
 const restore=()=>{try{const saved=Number(localStorage.getItem(key));if(saved)apply(saved);}catch{}};
 if((panel.parentElement?.clientHeight??0)>0)restore();else requestAnimationFrame(restore);
 const save=()=>{try{localStorage.setItem(key,String(current()));}catch{}};
 handle.onpointerdown=e=>{handle.setPointerCapture(e.pointerId);e.preventDefault();};
 handle.onpointermove=e=>{if(handle.hasPointerCapture(e.pointerId))apply(panel.getBoundingClientRect().bottom-e.clientY);};
 handle.onpointerup=e=>{handle.releasePointerCapture(e.pointerId);save();};
 handle.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();apply(current()+(e.key==='ArrowUp'?20:-20));save();}};
}
export function toolIcon(button:HTMLElement,path:string,label:string){
 button.setAttribute('aria-label',label);button.title=label;
 button.innerHTML=`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
