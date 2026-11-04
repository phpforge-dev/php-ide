// Página do harness WebKit dos agentes (scripts/check-agent-chat.mjs). Carrega o plugin de PLUGIN_AGENTS_DIR.
// @ts-nocheck
import * as monaco from 'monaco-editor';
import {installEditorWorkers} from '/src/editor-workers.ts';
import '/src/style.css'; import '/src/workbench.css'; import '/src/theme-surfaces.css'; import '/src/tool-windows.css';
  
      const {plugin, user: USER} = window.harness;
const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = `/@fs${plugin}/workbench.css`; document.head.append(link);
const {fakeApi} = await import(/* @vite-ignore */ `/@fs${plugin}/tests/fake-api.mjs`);
const {activate} = await import(/* @vite-ignore */ `/@fs${plugin}/workbench.js`);
installEditorWorkers?.();
  document.documentElement.dataset.theme = 'dark';
  document.body.innerHTML = '<div id="app"><main style="display:grid;grid-template-columns:1fr 460px;height:100vh"><section class="code"><div id="editor" style="height:100%"></div></section><aside class="tools" style="display:flex;flex-direction:column;padding:10px;min-height:0;height:100vh;box-sizing:border-box"><div id="agent" style="flex:1;min-height:0"></div></aside></main><footer><span id="status"></span></footer></div>';
  const model = monaco.editor.createModel(USER, 'php', monaco.Uri.file('/project/src/User.php'));
  const editor = monaco.editor.create(document.getElementById('editor'), {model, theme: 'vs-dark', automaticLayout: true});
  window.monaco = monaco; window.editor = editor;
  const options = window.harness.options;
  const services = {};
  if (options.database) services.database = {sqlIntelligence: {entries: new Map([['s1', {session: {id: 's1', label: 'app@localhost', driver: 'postgres'}, model: {label: 'app', database: 'app', defaultSchema: 'public', schemas: [{name: 'public', tables: [{name: 'users', kind: 'table', columns: [{name: 'id', type: 'bigint'}, {name: 'email', type: 'varchar(255)', nullable: false}]}]}]}}]])}};
  const scripts = {
   echo: async (text, extras, emit) => { emit({type: 'message', text: 'Resposta a: ' + text}); },
  };
  const api = fakeApi({script: window.agentScript ?? scripts[options.script ?? 'echo'], commands: options.commands ?? []});
  window.api = api;
  const host = {path: () => 'src/User.php', editor, open: async path => { window.opened = path; }, status: t => { document.getElementById('status').textContent = t; }};
  const statusHook = t => { document.getElementById('status').textContent = t; };
  const sdk = {own: () => {}, provide: (n, v) => { window.contribution = v; }, service: n => services[n], tr: s => s,
   msg: (p, ...a) => typeof p === 'string' ? p : p.reduce((v, s, i) => v + s + (a[i] ?? ''), ''), html: (p, ...a) => typeof p === 'string' ? p : p.reduce((v, s, i) => v + s + (a[i] ?? ''), ''),
   activeLanguage: () => 'pt-BR', host, monaco, keymap: {registerAction: () => () => {}, onChange: () => () => {}, shortcut: () => '', ariaShortcuts: () => ''}, fileIcon: () => '', editorFont: {size: 13, family: 'monospace'}};
  sdk.api = api; activate(sdk);
  const hooks = {context: () => { const s = editor.getSelection(); return {path: 'src/User.php', text: model.getValue(), ...(s && !s.isEmpty() ? {selection: model.getValueInRange(s)} : {})}; }, reload: async () => {}, status: statusHook, language: () => 'php'};
  const panel = window.contribution.mount(api, document.getElementById('agent'), hooks);
  api.connect(e => panel.handle(e));
  window.ready = true;
