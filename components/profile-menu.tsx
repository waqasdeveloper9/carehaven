'use client';
import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Camera, ChevronDown, LogOut, Settings, X } from 'lucide-react';
import { config } from '@/lib/config';
import { photoTypes, validatePhoto } from '@/lib/uploads';
import type { Workspace } from '@/lib/types';
import { Button } from './ui/button';

export function ProfileMenu({data,onProfile,onSettings,onLogout}:{data:Workspace;onProfile:(path:string|null)=>Promise<void>;onSettings:()=>void;onLogout:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null);
 const profile=data.profile;
 const role=profile.role==='admin'?'Administrator':profile.role==='donor'?'Sponsor':'Staff member';
 const source=profile.avatar_path?(data.mode==='demo'?profile.avatar_path:`/api/files?kind=avatar&path=${encodeURIComponent(profile.avatar_path)}`):'';
 const avatar=(large=false)=><span className={`avatar ${large?'profile-photo':'small'}`}>{source?<img src={source} alt={`${profile.full_name}'s profile`}/>:profile.full_name.split(' ').map(part=>part[0]).slice(0,2).join('')}</span>;
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
 useEffect(()=>{if(!editing)return;const node=dialog.current;node?.showModal();return()=>node?.close();},[editing]);
 async function upload(file:File){
  setBusy(true);setError('');
  try{
   validatePhoto(file);let path:string;
   if(data.mode==='demo')path=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read the photo.'));reader.readAsDataURL(file);});
   else{const client=createBrowserClient(config.supabaseUrl,config.supabaseKey);path=`${profile.id}/${crypto.randomUUID()}.${photoTypes[file.type]}`;const result=await client.storage.from(config.avatarBucket).upload(path,file,{contentType:file.type,upsert:false});if(result.error)throw new Error('Profile photo upload failed. Check the profile storage setup and try again.');}
   await onProfile(path);
  }catch(error){setError(error instanceof Error?error.message:'Could not save your photo.');}finally{setBusy(false);}
 }
 async function logout(){setBusy(true);setError('');try{await onLogout();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 return <div ref={root} className="profile-control" onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}}}>
 <button ref={trigger} className="profile-trigger" aria-label="Open account menu" aria-expanded={open} aria-controls="account-dropdown" onClick={()=>{setError('');setOpen(!open);}}>{avatar()}<ChevronDown size={14}/></button>
 {open&&<section id="account-dropdown" className="account-dropdown" aria-label="Your account"><strong>{profile.full_name}</strong><span className="account-email">{profile.email}</span><span className="badge green">{role}</span><small>{profile.status==='approved'?'Active account':profile.status}</small>{error&&<p className="error" role="alert">{error}</p>}<button onClick={()=>{setOpen(false);setEditing(true);setError('');}}><Camera size={17}/>Profile and photo</button><button onClick={()=>{setOpen(false);onSettings();}}><Settings size={17}/>Settings and password</button><button className="logout-action" onClick={()=>void logout()} disabled={busy}><LogOut size={17}/>{busy?'Signing out…':'Log out'}</button></section>}
 {editing&&<dialog ref={dialog} className="modal native-dialog profile-dialog" aria-labelledby="profile-title" onCancel={event=>{if(busy)event.preventDefault();else setEditing(false);}}><div className="modal-heading"><h2 id="profile-title">Your profile</h2><button className="icon-button" aria-label="Close profile" disabled={busy} onClick={()=>setEditing(false)}><X size={20}/></button></div>{avatar(true)}<dl className="profile-details">{([['Name',profile.full_name],['Email',profile.email],['Role',role],['Phone',profile.phone||'Not provided'],['Account status',profile.status]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{error&&<p className="error" role="alert">{error}</p>}
 {data.mode==='demo'||data.capabilities?.profilePhotos?<><label className="upload-field"><Camera size={22}/><strong>{busy?'Saving photo…':'Upload profile photo'}</strong><span>JPEG, PNG or WebP · Up to {config.maxUploadMB} MB</span><input aria-label="Upload profile photo" type="file" accept={Object.keys(photoTypes).join(',')} disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value='';}}/></label>{profile.avatar_path&&<Button variant="ghost" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onProfile(null);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>Remove profile photo</Button>}</>:<p className="setup-note">Profile photo storage needs the latest database migration. Your administrator can finish this setup.</p>}
 <div className="modal-actions"><Button variant="outline" disabled={busy} onClick={()=>setEditing(false)}>Close</Button></div></dialog>}
 </div>;
}
