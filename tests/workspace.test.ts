import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Workspace } from '../electron/workspace';
test('salvamento preserva conflito externo e limita acesso ao projeto',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'php-ide-files-')));
 const workspace=new Workspace(root);
 try{
  await writeFile(join(root,'a.php'),'<?php echo 1;');
  const before=await workspace.read('a.php');
  const etag=await workspace.save('a.php','<?php echo 2;',before.etag);
  assert.notEqual(etag,before.etag);
  await assert.rejects(workspace.save('a.php','lost',before.etag),/mudou/);
  assert.equal(await readFile(join(root,'a.php'),'utf8'),'<?php echo 2;');
  await assert.rejects(workspace.path('..'),/fora/);
  await symlink('/etc/hosts',join(root,'escape'));
  await assert.rejects(workspace.read('escape'),/fora/);
 }finally{await rm(root,{recursive:true,force:true});}
});
