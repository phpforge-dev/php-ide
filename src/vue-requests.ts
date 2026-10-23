import ts from 'typescript';
import {URI} from 'vscode-uri';
import type {WorkerLanguageService} from '@volar/monaco/worker';
import type {Requests} from '@vue/typescript-plugin/lib/requests';
import {getComponentNames} from '@vue/typescript-plugin/lib/requests/getComponentNames';
import {getComponentProps} from '@vue/typescript-plugin/lib/requests/getComponentProps';
import {getComponentSlots} from '@vue/typescript-plugin/lib/requests/getComponentSlots';
import {getComponentDirectives} from '@vue/typescript-plugin/lib/requests/getComponentDirectives';
import {getElementAttrs} from '@vue/typescript-plugin/lib/requests/getElementAttrs';
import {getElementNames} from '@vue/typescript-plugin/lib/requests/getElementNames';
import {resolveModuleName} from '@vue/typescript-plugin/lib/requests/resolveModuleName';
import {getImportPathForFile} from '@vue/typescript-plugin/lib/requests/getImportPathForFile';
import {isRefAtPosition} from '@vue/typescript-plugin/lib/requests/isRefAtPosition';

/** Connect Vue's template queries to the same local TypeScript program used by Volar. */
export function createVueRequests(service:()=>WorkerLanguageService):Requests{
 return new Proxy({} as Requests,{get(_target,key){return(file:string,...args:any[])=>{
  const context=service()?.languageService.context;if(!context)return;
  const source=context.language.scripts.get(URI.file(file));const virtual=source?.generated?.root as any;
  const languageService=context.inject('typescript/languageService') as ts.LanguageService|undefined;
  const host=context.inject('typescript/languageServiceHost') as ts.LanguageServiceHost|undefined;
  const program=languageService?.getProgram();if(!program||!languageService||!host)return;
  switch(key){
   case 'getComponentNames':return virtual?getComponentNames(ts,program,virtual):[];
   case 'getComponentProps':return virtual&&source?getComponentProps(ts,languageService,program,context.language as any,source as any,virtual,args[0]):[];
   case 'getComponentSlots':return virtual?getComponentSlots(ts,program,virtual):[];
   case 'getComponentDirectives':return getComponentDirectives(ts,program,file);
   case 'getElementAttrs':return getElementAttrs(ts,program,file,args[0]);
   case 'getElementNames':return getElementNames(ts,program,file);
   case 'resolveModuleName':return resolveModuleName(ts,host,file,args[0],args[1]);
   case 'getImportPathForFile':return getImportPathForFile(ts,host,program,file,args[0],{});
   case 'isRefAtPosition':return virtual&&source?isRefAtPosition(ts,context.language as any,program,source as any,virtual,args[0]):false;
  }
 };}});
}
