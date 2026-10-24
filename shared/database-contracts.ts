import type {DatabaseSession} from './contracts';
import type {SqlItem,SqlModel} from './sql-types';

/** Data-only request/result boundary for independently installed database providers. */
export type SqlCompletion = {from:number;to:number;items:SqlItem[];incomplete:boolean;degraded?:string;parserEntities:number};
export type DatabaseServices = {
 sessions():Promise<{id:string;model:SqlModel}[]>;
 active?(path:string):{id:string;model:SqlModel}|undefined;
 complete?(id:string,text:string,offset:number):Promise<SqlCompletion|null>;
 ddl(id:string,schema:string,table:string):Promise<string>;
};
export type SqlCatalogState = 'Preparing'|'Ready'|'Partial'|'Refreshing'|'Unavailable';
export type SqlCatalogEntry = {
 session:DatabaseSession;model:SqlModel;state:SqlCatalogState;revision:number;generation:number;
 relations:number;columns:number;bytes:number;errors:string[];loading?:Promise<void>;
 schemas:string[];lastRefresh:number;degraded?:string;dirty?:boolean;selectedSchema?:string;
};
/** Optional contribution surface; the host stores no parser, metadata cache or worker. */
export interface SqlCatalogService extends EventTarget {
 readonly entries:Map<string,SqlCatalogEntry>;
 readonly bindings:Map<string,string>;
 readonly limits:{relations:number;columns:number;bytes:number};
 projectDefault?:string;
 refreshInterval:number;
 metadataRequests:number;
 configure(call:(method:string,args:unknown[])=>Promise<any>):void;
 connect(session:DatabaseSession):void;
 bind(path:string,id?:string):void;
 selected(path:string):SqlCatalogEntry|undefined;
 setSchema(id:string,schema:string):void;
 invalidate(id:string):void;
 refresh(id:string,schemas?:string[]):Promise<void>;
 complete(id:string,text:string,offset:number,signal?:AbortSignal):Promise<SqlCompletion|null>;
 disconnect(id:string):void;
 reset():void;
}
