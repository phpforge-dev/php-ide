/** Optional feature contributions owned by an installed plugin generation. */
const contributions=new Map<string,{owner:string;value:any}>();
const subscribers=new Map<string,Set<()=>void>>();
const notify=(name:string)=>{for(const fn of subscribers.get(name)??[])fn();};
const visible=()=>{if(typeof document==='undefined')return;document.documentElement.dataset.pluginServices=[...contributions.keys()].sort().join(",");};
export function providePluginService(owner:string,name:string,value:unknown){
 if(contributions.has(name))throw Error(`Multiple active plugins provide ${name}`);
 contributions.set(name,{owner,value});visible();try{notify(name);}catch(error){contributions.delete(name);visible();notify(name);throw error;}window.dispatchEvent(new CustomEvent('ide-plugin-service',{detail:{name,active:true}}));
 return()=>{if(contributions.get(name)?.owner===owner){contributions.delete(name);visible();notify(name);window.dispatchEvent(new CustomEvent('ide-plugin-service',{detail:{name,active:false}}));}};
}
export function pluginService<T=any>(name:string):T|undefined{return contributions.get(name)?.value;}

/** Mount contributions lazily on activation and follow replacements without retaining old controllers. */
export function optionalPluginService<T extends object=any>(name:string,mount:(service:any)=>T,fallback:Record<string,any>={reset:()=>{},refresh:()=>{}}):T{
 let contribution:any;let controller:any;
 const update=()=>{const next=pluginService(name);if(next===contribution)return;contribution=next;controller=next?mount(next):undefined;};
 let listeners=subscribers.get(name);if(!listeners){listeners=new Set();subscribers.set(name,listeners);}listeners.add(update);update();
 return new Proxy({} as T,{get(_target,key){update();const value=controller?.[key]??fallback[String(key)];if(value!==undefined)return typeof value==='function'?value.bind(controller):value;
 return()=>{const status=document.getElementById('status');if(status)status.textContent=`${name}: instale ou ative o plugin em Plugins.`;};}});
}
