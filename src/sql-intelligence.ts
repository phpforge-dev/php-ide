import {pluginService} from './plugin-services';
import type {SqlCatalogService} from '../shared/database-contracts';
const empty={entries:new Map(),bindings:new Map(),metadataRequests:0,selected:()=>undefined,reset:()=>{},configure:()=>{},complete:async()=>null};
/** Optional SQL contribution; no parser, catalog or worker is loaded by the core. */
export const sqlIntelligence=new Proxy({} as SqlCatalogService,{
 get:(_target,key)=>{const service=pluginService('database')?.sqlIntelligence;const value=service?.[key]??(empty as any)[key];return typeof value==='function'?value.bind(service??empty):value;},
 set:(_target,key,value)=>{const service=pluginService('database')?.sqlIntelligence;if(service)service[key]=value;return true;}
});
