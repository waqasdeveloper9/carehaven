'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { permissions } from '@/lib/config';
import { permissionBatchLimit, permissionKey, togglePermission, rebasePermissionChanges, stageBulkPermissions, type BulkPermissionValues, type PermissionChange } from '@/lib/permission-changes';
import type { Workspace } from '@/lib/types';
import { Button } from './ui/button';

type AccessProps={data:Workspace;busy:boolean;draft:PermissionChange[];onDraft:(changes:PermissionChange[])=>void;onSave:(changes:PermissionChange[])=>Promise<{ok:boolean;conflict?:boolean}>;onReload:(ids:string[])=>Promise<Workspace['grants']|null>};

export function AccessPanel({data,busy,draft,onDraft,onSave,onReload}:AccessProps){
 const [query,setQuery]=useState(''),[role,setRole]=useState('all'),[conflict,setConflict]=useState(false);
 const [selected,setSelected]=useState<Set<string>>(()=>new Set()),[bulkOpen,setBulkOpen]=useState(false);
 const saving=useRef(false),selectAll=useRef<HTMLInputElement>(null);
 const pending=useMemo(()=>new Map(draft.map(change=>[permissionKey(change.user_id,change.permission),change])),[draft]);
 const accountIds=useMemo(()=>new Set(draft.map(change=>change.user_id)),[draft]);
 const editable=(profile:Workspace['profile'])=>profile.role!=='admin'&&(profile.role!=='donor'||data.mode==='demo'||!!data.capabilities?.sponsorPermissions);
 const visible=data.profiles.filter(profile=>(role==='all'||profile.role===role)&&`${profile.full_name} ${profile.email}`.toLowerCase().includes(query.toLowerCase()));
 const visibleEditable=visible.filter(editable);
 const eligibleIds=new Set(data.profiles.filter(editable).map(profile=>profile.id));
 const selectedIds=[...selected].filter(id=>eligibleIds.has(id));
 const selectedVisible=visibleEditable.filter(profile=>selected.has(profile.id)).length;
 useEffect(()=>{if(selectAll.current)selectAll.current.indeterminate=selectedVisible>0&&selectedVisible<visibleEditable.length;},[selectedVisible,visibleEditable.length]);
 const hasVisibleEdits=visible.some(profile=>accountIds.has(profile.id));
 async function save(){
  if(saving.current||!draft.length)return;saving.current=true;
  try{const result=await onSave(draft);setConflict(!!result.conflict);if(result.ok)onDraft([]);}finally{saving.current=false;}
 }
 const saveControls=<div className="row-permission-actions" role="region" aria-label="Unsaved permission changes">
  <div><strong>{draft.length} unsaved {draft.length===1?'change':'changes'} across {accountIds.size} {accountIds.size===1?'account':'accounts'}</strong><p>Keep choosing permissions. Save applies every staged change together.</p></div>
  <div className="inline-actions"><Button disabled={busy} onClick={()=>void save()}>{busy?'Saving changes…':'Save all changes'}</Button><Button variant="outline" disabled={busy} onClick={()=>{onDraft([]);setConflict(false);}}>Discard changes</Button>
  {conflict&&<Button variant="outline" disabled={busy} onClick={async()=>{const grants=await onReload([...accountIds]);if(grants){onDraft(rebasePermissionChanges(draft,grants));setConflict(false);}}}>Reload current permissions</Button>}</div>
 </div>;
 return <section className="panel"><div className="panel-heading"><div><h2>Account permissions</h2><p>Change individual switches, or select accounts to stage the same permissions for several people.</p></div></div>
  <div className="access-filters"><label className="field">Search accounts<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Name or email"/></label><label className="field">Account type<select value={role} onChange={event=>setRole(event.target.value)}><option value="all">All users and sponsors</option><option value="admin">Administrators</option><option value="staff_user">Staff users</option><option value="donor">Sponsors</option></select></label></div>
  <div className="bulk-permission-toolbar"><span aria-live="polite">{selectedIds.length} accounts selected</span><div className="inline-actions"><Button variant="outline" disabled={busy||!selectedIds.length} onClick={()=>setBulkOpen(true)}>Set permissions for selected</Button><Button variant="ghost" disabled={!selectedIds.length||busy} onClick={()=>setSelected(new Set())}>Clear selection</Button></div></div>
  <div className="table-wrap"><table className="permission-table"><thead><tr><th className="selection-cell"><input ref={selectAll} type="checkbox" aria-label="Select all editable accounts in this filter" checked={!!visibleEditable.length&&selectedVisible===visibleEditable.length} disabled={busy||!visibleEditable.length} onChange={event=>{const next=new Set(selected);for(const profile of visibleEditable){if(event.target.checked)next.add(profile.id);else next.delete(profile.id);}setSelected(next);}}/></th><th>Account</th><th>Role / status</th>{permissions.map(permission=><th key={permission}>{permission.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{visible.map(profile=><Fragment key={profile.id}>
   <tr className={selected.has(profile.id)&&editable(profile)?'permission-selected':''}><td className="selection-cell"><input type="checkbox" aria-label={`Select ${profile.full_name}`} disabled={busy||!editable(profile)} checked={editable(profile)&&selected.has(profile.id)} onChange={event=>{const next=new Set(selected);if(event.target.checked)next.add(profile.id);else next.delete(profile.id);setSelected(next);}}/></td>
    <td><strong>{profile.full_name}</strong><small>{profile.email}</small>{profile.requires_password_setup&&<small>Password setup pending</small>}<small className="unsaved-label permission-state">{accountIds.has(profile.id)?'Unsaved changes':'\u00a0'}</small></td><td><span className="badge slate">{profile.role==='admin'?'Administrator':profile.role==='donor'?'Sponsor':'Staff user'}</span><small>{profile.status}</small></td>
    {permissions.map(permission=>{const change=pending.get(permissionKey(profile.id,permission));const checked=change?change.enabled:!!data.grants[profile.id]?.[permission];return <td key={permission}>{profile.role==='admin'?<span className="badge green">Full access</span>:<button role="switch" aria-label={`${profile.full_name}: ${permission.replaceAll('_',' ')}`} aria-checked={checked} title={change?'Unsaved change':'Saved permission'} className={`switch ${checked?'on':''} ${change?'permission-dirty':''}`} disabled={busy||(!change&&draft.length>=permissionBatchLimit)||!editable(profile)} onClick={()=>{onDraft(togglePermission(draft,data.grants,profile.id,permission));}}><span/></button>}</td>;})}
   </tr>{accountIds.has(profile.id)&&<tr className="permission-action-row"><td colSpan={permissions.length+3}>{saveControls}</td></tr>}
  </Fragment>)}</tbody></table></div>
  {!!draft.length&&!hasVisibleEdits&&<div className="hidden-permission-actions"><p>The edited accounts are outside this filter.</p>{saveControls}</div>}
  <p className="panel-footnote">Extra grants can expose organization records and actions. Administrators retain full access. Approval and password setup remain required. Saved changes are audited.</p>
  {data.mode==='live'&&!data.capabilities?.sponsorPermissions&&<p className="panel-footnote">Apply the profile and access migration to enable sponsor permission editing.</p>}
  {bulkOpen&&<BulkPermissionDialog count={selectedIds.length} onClose={()=>setBulkOpen(false)} onStage={values=>{const next=stageBulkPermissions(draft,data.grants,selectedIds,values);onDraft(next);setBulkOpen(false);}}/>}
 </section>;
}

function BulkPermissionDialog({count,onClose,onStage}:{count:number;onClose:()=>void;onStage:(values:BulkPermissionValues)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [values,setValues]=useState<BulkPermissionValues>({}),[error,setError]=useState('');
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 return <dialog ref={dialog} className="modal native-dialog" aria-labelledby="bulk-permission-title" onCancel={onClose}><div className="modal-heading"><div><span className="eyebrow">BULK ACCESS EDIT</span><h2 id="bulk-permission-title">Permissions for {count} {count===1?'account':'accounts'}</h2></div><button className="icon-button" aria-label="Close bulk permissions" onClick={onClose}><X size={20}/></button></div><p>Leave unchanged preserves each account’s saved or staged value. Nothing is applied until Save all changes.</p>
  {error&&<div className="error" role="alert">{error}</div>}<form onSubmit={event=>{event.preventDefault();try{onStage(values);}catch(error){setError((error as Error).message);}}}>
  {permissions.map(permission=><label className="bulk-permission-field" key={permission}><span>{permission.replaceAll('_',' ')}</span><select aria-label={`Bulk ${permission.replaceAll('_',' ')}`} value={values[permission]===undefined?'unchanged':values[permission]?'grant':'remove'} onChange={event=>setValues({...values,[permission]:event.target.value==='unchanged'?undefined:event.target.value==='grant'})}><option value="unchanged">Leave unchanged</option><option value="grant">Grant</option><option value="remove">Remove</option></select></label>)}
  <div className="modal-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!Object.values(values).some(value=>value!==undefined)}>Stage selected permissions</Button></div></form></dialog>;
}
