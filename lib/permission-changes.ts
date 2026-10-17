import { z } from 'zod';
import { permissions, type Permission } from './config';
import type { Workspace } from './types';

export const permissionBatchLimit = 256;
export type PermissionChange = { user_id:string; permission:Permission; expected:boolean; enabled:boolean };
export const permissionBatchSchema = z.object({changes:z.array(z.object({
 user_id:z.uuid(),permission:z.enum(permissions),expected:z.boolean(),enabled:z.boolean(),
}).strict()).min(1).max(permissionBatchLimit)}).strict().superRefine(({changes},ctx)=>{
 const keys=new Set<string>();
 changes.forEach((change,index)=>{
  const key=permissionKey(change.user_id,change.permission);
  if(keys.has(key))ctx.addIssue({code:'custom',message:'Each permission can appear only once.',path:['changes',index]});
  if(change.expected===change.enabled)ctx.addIssue({code:'custom',message:'Include changed permissions only.',path:['changes',index]});
  keys.add(key);
 });
});
export function permissionKey(id:string,permission:Permission){return `${id}:${permission}`;}
export function togglePermission(draft:PermissionChange[],grants:Workspace['grants'],id:string,permission:Permission):PermissionChange[]{
 const current=draft.find(change=>change.user_id===id&&change.permission===permission);
 if(current)return draft.filter(change=>change!==current);
 return [...draft,{user_id:id,permission,expected:!!grants[id]?.[permission],enabled:!grants[id]?.[permission]}];
}
export function mergePermissionRows(grants:Workspace['grants'],rows:Workspace['grants']){
 return {...grants,...rows};
}
export function rebasePermissionChanges(draft:PermissionChange[],grants:Workspace['grants']):PermissionChange[]{
 return draft.flatMap(change=>{const expected=!!grants[change.user_id]?.[change.permission];return expected===change.enabled?[]:[{...change,expected}];});
}
