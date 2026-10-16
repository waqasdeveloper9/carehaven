'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Camera, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { config } from '@/lib/config';
import { photoTypes, validatePhoto } from '@/lib/uploads';
import type { Child, Workspace } from '@/lib/types';

export function ChildEditor({ child, data, busy, error, onClose, onSubmit }: {
 child?:Child; data:Workspace; busy:boolean; error:string; onClose:()=>void; onSubmit:(body:Record<string,unknown>)=>Promise<boolean>;
}) {
 const [photo,setPhoto]=useState<File|null>(null),[preview,setPreview]=useState(''),[remove,setRemove]=useState(false),[localError,setError]=useState(''),[uploading,setUploading]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const uploadedPhoto=useRef<{file:File;path:string}|null>(null);
 useEffect(()=>{dialog.current?.showModal();const node=dialog.current;return()=>node?.close();},[]);
 useEffect(()=>{if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');setUploading(true);
  const values=new FormData(event.currentTarget);
  const body:Record<string,unknown>={action:'child',...(child?{id:child.id}:{}),full_name:values.get('full_name'),date_of_birth:values.get('date_of_birth'),gender:values.get('gender')};
  try{
   if(photo){validatePhoto(photo);
    if(data.mode==='live'){
     const client=createBrowserClient(config.supabaseUrl,config.supabaseKey);
     if(uploadedPhoto.current?.file!==photo){
      const path=`${data.profile.id}/${crypto.randomUUID()}.${photoTypes[photo.type]}`;
      const uploaded=await client.storage.from(config.photoBucket).upload(path,photo,{upsert:false,contentType:photo.type});
      if(uploaded.error)throw new Error(uploaded.error.message);
      uploadedPhoto.current={file:photo,path};
     }
     body.picture_url=uploadedPhoto.current!.path;
    }else{
     body.picture_url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(photo);});
    }
   }else if(remove)body.picture_url=null;
   await onSubmit(body);
  }catch(error){setError(error instanceof Error?error.message:'The photo could not be saved.');}finally{setUploading(false);}
 }
 const locked=busy||uploading;
 const current=preview||(!remove&&child?.picture_url?(data.mode==='demo'?child.picture_url:`/api/files?kind=photo&path=${encodeURIComponent(child.picture_url)}`):'');
 return <dialog ref={dialog} className="modal native-dialog" aria-labelledby="child-editor-title" onCancel={event=>{if(locked)event.preventDefault();else onClose();}}><div className="modal-heading"><div><span className="eyebrow">CARE, RECORDED</span><h2 id="child-editor-title">{child?'Edit child':'Add a child'}</h2></div><button className="icon-button" aria-label="Close dialog" disabled={locked} onClick={onClose}><X size={20}/></button></div>{(error||localError)&&<div className="error" role="alert">{error||localError}</div>}
 <form onSubmit={submit}><label className="upload-field photo-upload">{current?<img src={current} alt="Child photo preview"/>:<Camera size={28}/>}<strong>{photo?.name||'Add or replace photo'}</strong><span>Private photo · JPEG, PNG, WebP · Up to {config.maxUploadMB} MB</span><input type="file" accept={Object.keys(photoTypes).join(',')} disabled={locked} onChange={event=>{const file=event.target.files?.[0]||null;try{if(file)validatePhoto(file);setPhoto(file);setRemove(false);setError('');}catch(error){setError((error as Error).message);event.target.value='';}}}/></label>
 {current&&<Button type="button" variant="ghost" disabled={locked} onClick={()=>{setPhoto(null);setRemove(true);}}>Remove photo</Button>}
 <label className="field">Full name<input name="full_name" required minLength={2} maxLength={100} defaultValue={child?.full_name} autoFocus disabled={locked}/></label><div className="form-grid"><label className="field">Date of birth<input type="date" name="date_of_birth" required max={new Date().toISOString().slice(0,10)} defaultValue={child?.date_of_birth} disabled={locked}/></label><label className="field">Gender<select name="gender" defaultValue={child?.gender||'Female'} disabled={locked}>{['Female','Male','Other'].map(value=><option key={value}>{value}</option>)}</select></label></div>
 <div className="modal-actions"><Button type="button" variant="outline" onClick={onClose} disabled={locked}>Cancel</Button><Button disabled={locked}><Check size={16}/>{locked?'Saving…':'Save child'}</Button></div></form></dialog>;
}
