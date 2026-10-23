import { t as tr } from './i18n';
import './theme';
document.querySelectorAll<HTMLElement>('#startup-splash [data-i18n]').forEach(el=>el.textContent=tr(el.textContent??''));
const splash=document.getElementById('startup-splash')!;
const status=document.getElementById('startup-status')!;
function failed(error:unknown){splash.style.display='grid';status.textContent=tr('Não foi possível iniciar a IDE.');const detail=document.getElementById('startup-error')!;detail.hidden=false;detail.textContent=String(error);const retry=document.getElementById('startup-retry')!;retry.hidden=false;retry.onclick=()=>location.reload();}
const slow=setTimeout(()=>{status.textContent=tr('A inicialização está demorando. Aguarde ou reinicie.');const retry=document.getElementById('startup-retry')!;retry.hidden=false;retry.onclick=()=>location.reload();},20000);
try {
 await (await import('./native')).installNativeApi();
 const api=window.ide;
 const native=await (await import('@tauri-apps/api/core')).invoke<any>('ide',{method:'nativeInfo',args:[]});
 async function workbench(){try{await (await import('./window-layout')).workbenchWindow();splash.style.display='grid';status.textContent=tr('Abrindo projeto…');const main=await import('./main');await main.ready;clearTimeout(slow);splash.remove();}catch(error){failed(error);throw error;}}
 const startup=await api.startupInfo();
 if(startup.project){await workbench();if(native.smoke)await (await import('./native-smoke')).nativeSmoke(native);}
 else {const welcome=await import('./welcome');await welcome.showWelcome(api,workbench);splash.style.display='none';clearTimeout(slow);if(native.smoke&&native.startupSmoke)await (await import('./startup-smoke')).startupSmoke(native.startupSmoke);}
} catch(error){failed(error);} finally{clearTimeout(slow);}
