export type AppPreferences = {setupComplete:boolean;autoUpdatePlugins:boolean;autoUpdateIde:boolean;checkUpdates:boolean};
export type PluginChoice = {id:string;name:string;description:string;permissions:string[]};
export type PluginJob = {id:string;name:string;kind:'install'|'update';status:'queued'|'downloading'|'installed'|'failed'|'review'|'staged';error?:string;permissions:string[];target?:{version:string}};
export type PluginUpdate = {id:string;name:string;version:string;currentVersion:string};
export type MaintenanceState = {
 preferences:AppPreferences;defaults:PluginChoice[];jobs:PluginJob[];updates:PluginUpdate[];
 checking:boolean;checkedAt?:number;errors:string[];ideVersion:string;
 ide?:{version:string;notes?:string;signed:boolean};ideAutoUpdateAvailable:boolean;
 ideProgress?:{status:'downloading'|'ready'|'failed'|'installed';bytes?:number;total?:number;error?:string};
};
export const essentialPlugins=['phpforge.php-intelligence','phpforge.php-formatter','phpforge.composer','phpforge.php-tests','phpforge.git','phpforge.terminal'];
export function coversUpdate(job:PluginJob,update:PluginUpdate):boolean {return job.id===update.id&&job.kind==='update'&&job.target?.version===update.version;}
export function outstanding(state:MaintenanceState):number {
 return state.updates.filter(update=>!state.jobs.some(job=>coversUpdate(job,update)&&['installed','staged'].includes(job.status))).length+(state.ide?1:0);
}
export function hasBackgroundWork(state:MaintenanceState):boolean {
 return state.jobs.some(job=>['queued','downloading'].includes(job.status))||state.ideProgress?.status==='downloading';
}
