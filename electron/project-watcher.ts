import { watch, type FSWatcher } from 'chokidar';
export async function watchProject(root: string, changed: (path: string, type: 1 | 2 | 3) => void): Promise<FSWatcher> {
 const watcher = watch(root, {
  ignoreInitial: true, followSymlinks: false,
  ignored: /(^|[/\\])(\.git|\.idea|node_modules|\.tools)([/\\]|$)/,
  awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 }
 });
 watcher.on('all', (event,path) => {
  if(event === 'add') changed(path,1);
  else if(event === 'change') changed(path,2);
  else if(event === 'unlink') changed(path,3);
 });
 await new Promise<void>((resolve,reject) => {
  watcher.once('ready',resolve); watcher.once('error',reject);
 });
 return watcher;
}
