/** Bound retained matches and yield between batches so typing/closing can supersede a scan. */
export async function rankFilePaths(paths: readonly string[], query: string, current: () => boolean): Promise<string[]> {
 const lower = query.toLocaleLowerCase();
 let matches: {path: string; exact: number}[] = [];
 const compare = (a: typeof matches[number], b: typeof matches[number]) => a.exact-b.exact || a.path.length-b.path.length || a.path.localeCompare(b.path);
 for(let start=0;start<paths.length;start+=1000){
  if(!current())return [];
  for(const path of paths.slice(start,start+1000)){
   if(path.toLocaleLowerCase().includes(lower))matches.push({path,exact:path.split('/').pop()?.toLocaleLowerCase()===lower?0:1});
  }
  matches.sort(compare);matches=matches.slice(0,100);
  if(start+1000<paths.length)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 return current()?matches.map(item=>item.path):[];
}
