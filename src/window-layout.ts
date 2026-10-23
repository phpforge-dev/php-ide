import {getCurrentWindow,currentMonitor} from '@tauri-apps/api/window';
import {LogicalSize,PhysicalSize,PhysicalPosition} from '@tauri-apps/api/dpi';

const key='php-ide-workbench-window';
/** Session storage survives the reload used by Close Project, without persisting screen coordinates across launches. */
export async function welcomeWindow(){
 const win=getCurrentWindow();
 if(sessionStorage.getItem('php-ide-window-mode')!=='welcome'){
  const size=await win.innerSize(),position=await win.outerPosition();
  sessionStorage.setItem(key,JSON.stringify({width:size.width,height:size.height,x:position.x,y:position.y,maximized:await win.isMaximized(),fullscreen:await win.isFullscreen()}));
 }
 if(await win.isFullscreen())await win.setFullscreen(false);
 if(await win.isMaximized())await win.unmaximize();
 await win.setMinSize(new LogicalSize(760,520));
 await win.setSize(new LogicalSize(960,680));
 await win.center();
 sessionStorage.setItem('php-ide-window-mode','welcome');
}
export async function workbenchWindow(){
 if(sessionStorage.getItem('php-ide-window-mode')!=='welcome')return;
 const win=getCurrentWindow();
 let saved:any;try{saved=JSON.parse(sessionStorage.getItem(key)??'null');}catch{/* Fall back to the default workbench dimensions. */}
 await win.setMinSize(new LogicalSize(1000,650));
 if(saved&&Number.isFinite(saved.width)&&Number.isFinite(saved.height)){
  await win.setSize(new PhysicalSize(saved.width,saved.height));
  const monitor=await currentMonitor();const area=monitor?.workArea;
  if(area&&saved.x>=area.position.x&&saved.y>=area.position.y&&saved.x<area.position.x+area.size.width-100&&saved.y<area.position.y+area.size.height-100)await win.setPosition(new PhysicalPosition(saved.x,saved.y));
  else await win.center();
  if(saved.maximized)await win.maximize();
  if(saved.fullscreen)await win.setFullscreen(true);
 }else{await win.setSize(new LogicalSize(1440,940));await win.center();}
 sessionStorage.setItem('php-ide-window-mode','workbench');
}
