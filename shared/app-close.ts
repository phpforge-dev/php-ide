type CloseOptions={beforeClose():boolean;applyUpdate():Promise<unknown>;close():Promise<unknown>;closeWithoutUpdate(error:unknown):boolean;pending(value:boolean):void;error(error:unknown):void};
/** Serialize repeated close requests and keep both the buffer guard and update completion authoritative. */
export function protectClose(options:CloseOptions){
 let approved=false;let pending=false;
 return async(event:{preventDefault():void})=>{
  if(approved)return;
  event.preventDefault();if(pending||!options.beforeClose())return;
  pending=true;options.pending(true);
  try{
   try{await options.applyUpdate();}catch(error){if(!options.closeWithoutUpdate(error))return;}
   if(!options.beforeClose())return;
   approved=true;
   try{await options.close();}catch(error){approved=false;options.error(error);}
  }finally{pending=false;options.pending(false);}
 };
}
