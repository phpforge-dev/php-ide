import {invoke} from '@tauri-apps/api/core';
import { t as tr } from './i18n';
import './theme';
document.querySelectorAll<HTMLElement>('#startup-splash [data-i18n]').forEach(el=>el.textContent=tr(el.textContent??''));
const splash=document.getElementById('startup-splash')!;
const status=document.getElementById('startup-status')!;
async function reveal(){await invoke('startup_ready');}
function failed(error:unknown){void invoke<{smoke:boolean}>('ide',{method:'nativeInfo',args:[]}).then(info=>{if(info.smoke)return invoke('ide',{method:'nativeSmokeReport',args:[{ok:false,runtime:'tauri',checks:[],failures:['Startup: '+String(error instanceof Error?error.stack:error)]}]});}).catch(console.error);void reveal().catch(console.error);splash.style.display='grid';status.textContent=tr('Não foi possível iniciar a IDE.');const detail=document.getElementById('startup-error')!;detail.hidden=false;detail.textContent=String(error);const retry=document.getElementById('startup-retry')!;retry.hidden=false;retry.onclick=()=>location.reload();}
const slow=setTimeout(()=>{void reveal().catch(console.error);status.textContent=tr('A inicialização está demorando. Aguarde ou reinicie.');const retry=document.getElementById('startup-retry')!;retry.hidden=false;retry.onclick=()=>location.reload();},20000);
try {
 await (await import('./native')).installNativeApi();
 const api=window.ide;
 const native=await (await import('@tauri-apps/api/core')).invoke<any>('ide',{method:'nativeInfo',args:[]});
 async function workbench(){try{await (await import('./window-layout')).workbenchWindow();splash.style.display='grid';status.textContent=tr('Abrindo projeto…');const main=await import('./main');await main.ready;clearTimeout(slow);splash.remove();await reveal();}catch(error){failed(error);throw error;}}
 const maintenance=await (await import('./app-maintenance')).mountAppMaintenance(api);
 // Show the one-time setup before restoring a workspace; downloads are owned by Rust.
 splash.style.display='none';clearTimeout(slow);await reveal();
 const setupTask=maintenance.setup();
 const firstRunChecks=native.smoke&&native.startupSmoke?await (await import('./startup-smoke')).firstRunSmoke():[];
 await setupTask;
 maintenance.start();
 const startup=await api.startupInfo();
 if(startup.project){await workbench();if(native.smoke)await (await import('./native-smoke')).nativeSmoke(native);}
 else {const welcome=await import('./welcome');await welcome.showWelcome(api,workbench);splash.style.display='none';clearTimeout(slow);await reveal();if(native.smoke&&native.startupSmoke)await (await import('./startup-smoke')).startupSmoke(native.startupSmoke,firstRunChecks);}
} catch(error){failed(error);} finally{clearTimeout(slow);}
