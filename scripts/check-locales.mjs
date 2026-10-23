import {readFile,readdir} from 'node:fs/promises';
const files=(await readdir('src/locales')).filter(file=>file.endsWith('.json'));const ids=new Set();let count=0;
for(const file of files){const catalog=JSON.parse(await readFile('src/locales/'+file,'utf8'));if(!catalog.id||!catalog.name||!catalog.messages)throw Error('Invalid locale: '+file);Intl.getCanonicalLocales(catalog.id);if(ids.has(catalog.id))throw Error('Duplicate locale '+catalog.id);ids.add(catalog.id);
 for(const [key,value]of Object.entries(catalog.messages)){if(typeof value!=='string'||!value.trim())throw Error('Empty translation: '+file+' '+key);const placeholders=s=>(s.match(/\{\d+\}/g)??[]).sort().join(',');if(placeholders(key)!==placeholders(value))throw Error('Mismatched placeholders: '+file+' '+key);count++;}}
if(!ids.has('pt-BR')||!ids.has('en'))throw Error('Required languages missing');console.log(`${files.length} locales; ${count} translations; metadata and placeholders valid.`);
