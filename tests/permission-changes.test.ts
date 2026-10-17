import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { demoWorkspace } from '../lib/demo';
import { permissionBatchSchema, togglePermission, rebasePermissionChanges, mergePermissionRows, stageBulkPermissions, type PermissionChange } from '../lib/permission-changes';

test('multiple switches and accounts form one draft; reverting a switch removes only that edit',()=>{
 const data=demoWorkspace();let changes:PermissionChange[]=[];
 changes=togglePermission(changes,data.grants,'demo-staff','manage_orphans');
 changes=togglePermission(changes,data.grants,'demo-staff','view_financials');
 changes=togglePermission(changes,data.grants,'demo-donor','assign_donors');
 assert.equal(changes.length,3);assert.equal(changes[0].expected,true);assert.equal(changes[0].enabled,false);
 assert.equal(data.grants['demo-staff'].manage_orphans,true,'staging must not change saved grants');
 changes=togglePermission(changes,data.grants,'demo-staff','view_financials');assert.equal(changes.length,2);
 assert.ok(changes.some(change=>change.user_id==='demo-donor'));
});
test('batch validation accepts one or multiple edits and rejects duplicates, no-ops and privilege injection',()=>{
 const change={user_id:randomUUID(),permission:'manage_orphans',expected:false,enabled:true};
 assert.equal(permissionBatchSchema.parse({changes:[change]}).changes.length,1);
 assert.equal(permissionBatchSchema.parse({changes:[change,{...change,permission:'view_financials'}]}).changes.length,2);
 for(const changes of [[],[change,change],[{...change,enabled:false}],[{...change,permission:'role'}],[{...change,enabled:'true'}],[{...change,role:'admin'}]])assert.equal(permissionBatchSchema.safeParse({changes}).success,false);
});
test('conflict reload preserves desired edits, removes already-applied changes, and updates expectations',()=>{
 const data=demoWorkspace();const changes:PermissionChange[]=[{user_id:'demo-staff',permission:'manage_orphans',expected:false,enabled:true},{user_id:'demo-donor',permission:'assign_donors',expected:false,enabled:true}];
 const rebased=rebasePermissionChanges(changes,data.grants);assert.equal(rebased.length,1);assert.equal(rebased[0].user_id,'demo-donor');
 const merged=mergePermissionRows(data.grants,{'demo-donor':{...data.grants['demo-staff'],assign_donors:true}});
 assert.equal(merged['demo-staff'].manage_orphans,true);assert.equal(merged['demo-donor'].assign_donors,true);
});
test('bulk staging changes selected accounts only and preserves leave-unchanged fields',()=>{
 const data=demoWorkspace();const original=togglePermission([],data.grants,'demo-staff','run_audits');
 const result=stageBulkPermissions(original,data.grants,['demo-staff','demo-donor'],{assign_donors:true,view_financials:true});
 assert.equal(result.length,5);assert.ok(result.some(change=>change.permission==='run_audits'));
 assert.ok(result.every(change=>change.user_id!=='demo-pending'));
 assert.equal(data.grants['demo-staff'].assign_donors,false);
 const reverted=stageBulkPermissions(result,data.grants,['demo-staff'],{assign_donors:false});
 assert.equal(reverted.length,4);assert.ok(reverted.some(change=>change.user_id==='demo-donor'&&change.permission==='assign_donors'));
});
test('bulk staging deduplicates selected accounts and fails atomically at the batch limit',()=>{
 const data=demoWorkspace();assert.equal(stageBulkPermissions([],data.grants,['demo-donor','demo-donor'],{assign_donors:true}).length,1);
 const original:PermissionChange[]=[];
 assert.throws(()=>stageBulkPermissions(original,data.grants,Array.from({length:257},(_,index)=>`account-${index}`),{view_financials:true}),/fewer accounts/);
 assert.equal(original.length,0);
});
