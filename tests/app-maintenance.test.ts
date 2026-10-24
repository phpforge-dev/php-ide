import test from 'node:test';
import assert from 'node:assert/strict';
import {outstanding,type MaintenanceState} from '../shared/app-maintenance';

test('initial installation history and older staged versions do not hide new update notifications',()=>{
 const state:MaintenanceState={preferences:{setupComplete:true,autoUpdateIde:false,autoUpdatePlugins:false,checkUpdates:true},defaults:[],jobs:[{id:'phpforge.git',name:'Git',kind:'install',status:'installed',permissions:[]}],updates:[{id:'phpforge.git',name:'Git',version:'1.0.2',currentVersion:'1.0.1'}],checking:false,errors:[],ideVersion:'0.2.13',ideAutoUpdateAvailable:false};
 assert.equal(outstanding(state),1);
 state.jobs=[{id:'phpforge.git',name:'Git',kind:'update',status:'staged',permissions:[],target:{version:'1.0.2'}}];assert.equal(outstanding(state),0);
 state.updates[0].version='1.0.3';assert.equal(outstanding(state),1);
});
