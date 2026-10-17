'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, KeyRound, MoreVertical, Pencil, RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';
import { generateTemporaryPassword } from '@/lib/account-actions';
import { passwordPolicy } from '@/lib/auth-policy';
import type { Profile, Workspace } from '@/lib/types';

export function AccountRowActions({profile,onEdit,onReset}:{profile:Profile;onEdit:()=>void;onReset:()=>void}){
 const [position,setPosition]=useState<{top:number;left:number}|null>(null);const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!position)return;const close=(event:PointerEvent)=>{if(!trigger.current?.contains(event.target as Node)&&!menu.current?.contains(event.target as Node))setPosition(null);};const hide=()=>setPosition(null);document.addEventListener('pointerdown',close);window.addEventListener('resize',hide);window.addEventListener('scroll',hide,true);menu.current?.querySelector('button')?.focus();return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',hide);window.removeEventListener('scroll',hide,true);};},[position]);
 return <><button ref={trigger} className="icon-button" aria-label={`Actions for ${profile.full_name}`} aria-expanded={!!position} aria-haspopup="menu" onClick={()=>{if(position){setPosition(null);return;}const rect=trigger.current!.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(rect.right-230,window.innerWidth-238)),top:rect.bottom+130>window.innerHeight?Math.max(8,rect.top-125):rect.bottom+6});}}><MoreVertical size={20}/></button>
 {position&&createPortal(<div ref={menu} style={position} className="account-row-menu" role="menu" aria-label={`Actions for ${profile.full_name}`} onKeyDown={event=>{if(event.key==='Escape'){setPosition(null);trigger.current?.focus();}}}><button role="menuitem" onClick={()=>{setPosition(null);onEdit();}}><Pencil size={16}/>Edit {profile.role==='donor'?'sponsor':'user'}</button><button role="menuitem" disabled={profile.status!=='approved'} onClick={()=>{setPosition(null);onReset();}}><KeyRound size={16}/>Reset password</button></div>,document.body)}</>;
}

export function AccountMaintenanceDialog({profile,mode,data,onClose,onSaved}:{profile:Profile;mode:'edit'|'reset';data:Workspace;onClose:()=>void;onSaved:(profile:Profile|undefined,message:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false);const [requestId]=useState(()=>crypto.randomUUID());
 const [name,setName]=useState(profile.full_name),[phone,setPhone]=useState(profile.phone||''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[show,setShow]=useState(false);
 const [confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[passwordChanged,setPasswordChanged]=useState(false),[emailAccepted,setEmailAccepted]=useState(false);
 const configured=data.mode==='demo'||(mode==='edit'?data.capabilities?.accountMaintenance:data.capabilities?.directPasswordReset);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 function close(){setPassword('');setConfirm('');onClose();}
 async function submit(event?:FormEvent){
  event?.preventDefault();if(inFlight.current)return;setError('');
  if(mode==='reset'&&(password!==confirm||password.length<passwordPolicy.minimumLength||password.length>passwordPolicy.maximumLength)){setError(password!==confirm?'The passwords do not match.':`Use ${passwordPolicy.minimumLength}–${passwordPolicy.maximumLength} characters.`);return;}
  if(mode==='reset'&&!confirming&&!passwordChanged){setConfirming(true);return;}
  inFlight.current=true;setBusy(true);
  try{
   if(data.mode==='demo'){setMessage('Demo preview only. No real password or email was changed.');return;}
   const body=mode==='edit'?{action:'edit',id:profile.id,full_name:name,phone}:{action:'reset_password',id:profile.id,request_id:requestId,password,confirm_password:confirm,confirmed:true};
   const response=await fetch('/api/account-maintenance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error);
   onSaved(result.profile,result.message);
   if(mode==='edit'){close();return;}
   setPasswordChanged(true);setEmailAccepted(!!result.emailAccepted);setMessage(result.message);setConfirming(false);
  }catch(error){setError(error instanceof Error?error.message:'The account operation failed.');}finally{inFlight.current=false;setBusy(false);}
 }
 const title=mode==='edit'?`Edit ${profile.role==='donor'?'sponsor':'user'}`:'Reset account password';
 return <dialog ref={dialog} className="modal native-dialog" aria-labelledby="account-maintenance-title" onCancel={event=>{if(busy)event.preventDefault();else close();}}><div className="modal-heading"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2 id="account-maintenance-title">{title}</h2><p>{profile.full_name} · {profile.email}</p></div><button className="icon-button" aria-label="Close account dialog" disabled={busy} onClick={close}><X size={20}/></button></div>
 {error&&<div className="error" role="alert">{error}</div>}{message&&<div className="setup-note" role="status">{message}</div>}
 {!configured&&<p className="setup-note">{mode==='edit'?'Apply the account-maintenance migration to enable editing.':'Temporary-password emails require the account-maintenance migration and a custom SMTP or Resend sender. No password will change while this setup is incomplete.'}</p>}
 {confirming?<div className="password-reset-warning"><AlertTriangle size={30}/><h3>Reset password for {profile.full_name}?</h3><p>The current password will stop working. Existing workspace sessions will be blocked. The new temporary password will be emailed to <strong>{profile.email}</strong>, and the owner must replace it before using the app.</p><div className="modal-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirming(false)}>Back</Button><Button disabled={busy||!configured} onClick={()=>void submit()}>{busy?'Resetting…':'Confirm reset and email'}</Button></div></div>:
 <form onSubmit={submit}>{mode==='edit'?<><label className="field">Full name<input value={name} onChange={event=>setName(event.target.value)} required minLength={2} maxLength={100} disabled={busy}/></label><label className="field">Email<input value={profile.email} type="email" readOnly/><small>This remains the verified sign-in identity.</small></label><label className="field">Phone<input value={phone} onChange={event=>setPhone(event.target.value)} maxLength={40} disabled={busy}/></label></>:<>
 <label className="field">New temporary password<input value={password} onChange={event=>setPassword(event.target.value)} type={show?'text':'password'} autoComplete="new-password" required minLength={passwordPolicy.minimumLength} maxLength={passwordPolicy.maximumLength} disabled={busy||passwordChanged}/><small>Use at least {passwordPolicy.minimumLength} characters.</small></label><label className="field">Retype temporary password<input value={confirm} onChange={event=>setConfirm(event.target.value)} type={show?'text':'password'} autoComplete="new-password" required disabled={busy||passwordChanged}/></label>
 <div className="inline-actions"><Button type="button" variant="outline" disabled={busy||passwordChanged} onClick={()=>{const next=generateTemporaryPassword();setPassword(next);setConfirm(next);setError('');}}><RefreshCw size={16}/>Generate password</Button><label className="checkbox-field"><input type="checkbox" checked={show} onChange={event=>setShow(event.target.checked)}/>Show password</label></div></>}
 <div className="modal-actions"><Button type="button" variant="outline" disabled={busy} onClick={close}>{passwordChanged?'Close':'Cancel'}</Button>{(!passwordChanged||!emailAccepted)&&<Button disabled={busy||!configured}>{busy?'Saving…':mode==='edit'?'Save account':passwordChanged?'Retry email':'Review password reset'}</Button>}</div></form>}
 </dialog>;
}
