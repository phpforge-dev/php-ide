import { defineConfig } from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'./',resolve:{alias:['beautify/beautify-html.js','utils/strings.js'].map(path=>({
 // Vue's formatter imports the UMD entries explicitly; use their published browser ESM equivalents.
 find:'vscode-html-languageservice/lib/umd/'+path,replacement:fileURLToPath(new URL('./node_modules/vscode-html-languageservice/lib/esm/'+path,import.meta.url)),
}))},server:{host:'127.0.0.1',hmr:process.env.PHP_IDE_NATIVE_SMOKE_RUN!=='1'},optimizeDeps:{include:[
 'yaml','monaco-editor','@volar/monaco','@volar/monaco/worker','@volar/language-service/lib/types',
 '@vue/language-core','@vue/language-service','volar-service-typescript','typescript','vscode-uri',
 ...['getComponentNames','getComponentProps','getComponentSlots','getComponentDirectives','getElementAttrs','getElementNames','resolveModuleName','getImportPathForFile','isRefAtPosition'].map(name=>'@vue/typescript-plugin/lib/requests/'+name),
]}});
