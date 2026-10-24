import type * as Monaco from 'monaco-editor';
import type {IdeApi} from '../../contracts';
/** Trusted window extensions; native/worker permissions are reviewed independently. */
export type WorkbenchContributionName='imagePreview'|'svgPreview'|'webLanguages'|'phpIntelligence'|'database'|'git'|'terminal'|'docker'|'agents';
export type Disposable={dispose():void}|(()=>void);
export interface WorkbenchHost {
 editor:Monaco.editor.IStandaloneCodeEditor;
 path():string|undefined;
 open(path:string,line?:number):Promise<void>;
 status(text:string):void;
 changed():void;
}
export interface WorkbenchSdk {
 /** Only baseline read operations and manifest-declared services are exposed by the host. */
 api:Partial<IdeApi>;
 host:WorkbenchHost;
 monaco:typeof Monaco;
 own<T extends Disposable>(item:T):T;
 provide(name:WorkbenchContributionName,value:unknown):()=>void;
}
export interface WorkbenchController {run?(input:unknown):unknown;dispose?():void;reset?():void}
export type WorkbenchActivate=(sdk:WorkbenchSdk)=>WorkbenchController|void;
