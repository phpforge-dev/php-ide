import { isBashPath } from '../shared/bash-document';
import { isDockerfilePath, isComposePath } from '../shared/docker-document';
// The imported JetBrains SVGs each carry their own Apache-2.0 notice.
import { phpFileKind } from '../shared/php-file-kind';
const assets=import.meta.glob<string>('./assets/jetbrains-icons/**/*.svg',{query:'?url',import:'default',eager:true});
const originals=import.meta.glob<string>('./assets/original-icons/*.svg',{query:'?url',import:'default',eager:true});
export function iconName(path:string,directory=false):string{
 const name=path.replaceAll('\\','/').split('/').pop()!.toLowerCase();
 if(directory){if(name==='vendor')return 'nodes/libraryFolder';if(['src','app'].includes(name))return 'nodes/sourceRoot';if(['tests','test'].includes(name))return 'nodes/testRoot';if(['resources','assets','public'].includes(name))return 'nodes/resourcesRoot';if(name==='.github')return 'nodes/folderGithub';return 'nodes/folder';}
 if(name.endsWith('.php')||name.endsWith('.phtml'))return 'original/php';
 if(isDockerfilePath(path)||isComposePath(path))return 'fileTypes/docker';
 if(isBashPath(path))return 'fileTypes/shell';
 if(name==='.editorconfig')return 'fileTypes/editorConfig';
 if(name.startsWith('.env')||['.gitignore','.gitattributes','.htaccess'].includes(name))return 'fileTypes/config';
 const extension=name.split('.').pop()!;
 const map:Record<string,string>={json:'json',jsonc:'json',js:'javaScript',jsx:'javaScript',mjs:'javaScript',cjs:'javaScript',ts:'typeScript',tsx:'typeScript',css:'css',scss:'css',sass:'css',less:'css',html:'html',htm:'html',md:'markdown',mdx:'markdown',markdown:'markdown',yaml:'yaml',yml:'yaml',xml:'xml',svg:'image',png:'image',jpg:'image',jpeg:'image',gif:'image',webp:'image',ico:'image',sql:'sql',sh:'shell',bash:'shell',zsh:'shell',toml:'toml',csv:'csv',zip:'archive',gz:'archive',tar:'archive',phar:'archive',txt:'text',log:'text',ini:'config',conf:'config',lock:'config'};
 return 'fileTypes/'+(map[extension]??'anyType');
}
export function fileIcon(path:string,directory=false,text?:string):HTMLElement{
 const declaration=!directory&&text!==undefined?phpFileKind(path,text):undefined;
 const kind=declaration?'original/php-'+declaration:iconName(path,directory);const original=kind.startsWith('original/');const name=kind.replace('original/','');
 const source=(dark:boolean)=>original?originals[`./assets/original-icons/${name}${dark?'_dark':''}.svg`]:assets[`./assets/jetbrains-icons/${kind}${dark?'_dark':''}.svg`];
 const icon=document.createElement('span');icon.className='resource-icon';icon.dataset.icon=kind;icon.setAttribute('aria-hidden','true');
 for(const dark of [false,true]){const img=document.createElement('img');img.className=dark?'icon-dark':'icon-light';img.src=source(dark);img.alt='';img.width=16;img.height=16;img.draggable=false;icon.append(img);}
 return icon;
}
