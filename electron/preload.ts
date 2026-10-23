import { contextBridge, ipcRenderer } from 'electron';
import type { IdeApi, Event, TerminalEvent } from '../shared/contracts';
const invoke = (name: string, ...args: unknown[]) => ipcRenderer.invoke(name, ...args);
const api: IdeApi = {
 terminalCreate: (id,cols,rows) => invoke('terminalCreate',id,cols,rows), terminalWrite: (id,data) => invoke('terminalWrite',id,data),
 terminalResize: (id,cols,rows) => invoke('terminalResize',id,cols,rows), terminalClose: id => invoke('terminalClose',id), terminalAck: (id,size) => invoke('terminalAck',id,size),
 onTerminalEvent: listener => { const handler=(_:unknown,event:TerminalEvent)=>listener(event);ipcRenderer.on('terminal-event',handler);return ()=>ipcRenderer.removeListener('terminal-event',handler); },
 workspace: () => invoke('workspace'), openProject: () => invoke('openProject'),
 gitAccount: () => invoke('gitAccount'), gitSaveAccount: input => invoke('gitSaveAccount',input), gitTestAccount: (remote,token) => invoke('gitTestAccount',remote,token),
 gitStatus: () => invoke('gitStatus'), gitDiff: (path,staged) => invoke('gitDiff',path,staged),
 gitStage: (path,staged,token) => invoke('gitStage',path,staged,token),
 gitCommit: (message,token) => invoke('gitCommit',message,token), gitLog: () => invoke('gitLog'),
 gitBranches: () => invoke('gitBranches'), gitTools: () => invoke('gitTools'),
 gitHistory: hash => invoke('gitHistory',hash), gitHistoryDiff: (hash,path) => invoke('gitHistoryDiff',hash,path),
 gitHunks: (path,staged) => invoke('gitHunks',path,staged), gitApplyHunk: (path,staged,token,hunk) => invoke('gitApplyHunk',path,staged,token,hunk),
 gitOperation: input => invoke('gitOperation',input), gitConflict: path => invoke('gitConflict',path), gitResolve: (path,text,token) => invoke('gitResolve',path,text,token),
 tree: path => invoke('tree', path), read: path => invoke('read', path),
 save: (path,text,etag) => invoke('save',path,text,etag), language: input => invoke('language',input), plugins: () => invoke('plugins'), databaseModel: id => invoke('databaseModel',id), databaseExecute: (id,sql) => invoke('databaseExecute',id,sql), databaseCancel: id => invoke('databaseCancel',id), databaseDdl: (id,schema,table) => invoke('databaseDdl',id,schema,table),
 database: input => invoke('database',input),
 databaseConnect: input => invoke('databaseConnect',input), databaseDisconnect: id => invoke('databaseDisconnect',id),
 databaseTables: (id,schema) => invoke('databaseTables',id,schema), databasePage: (id,schema,table,offset) => invoke('databasePage',id,schema,table,offset),
 agents: () => invoke('agents'), agentStart: id => invoke('agentStart',id), agentPrompt: (text,context) => invoke('agentPrompt',text,context), agentCancel: () => invoke('agentCancel'), agentMode: mode => invoke('agentMode',mode), agentPermission: (id,option) => invoke('agentPermission',id,option), agentKeep: paths => invoke('agentKeep',paths), agentDiscard: paths => invoke('agentDiscard',paths), agentReset: () => invoke('agentReset'),
 onEvent: listener => { const handler = (_: unknown,event: Event) => listener(event); ipcRenderer.on('event',handler); return () => ipcRenderer.removeListener('event',handler); }
};
contextBridge.exposeInMainWorld('ide',api);
