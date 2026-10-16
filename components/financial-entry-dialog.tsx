'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, LoaderCircle, Receipt, X } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from './ui/button';
import { categories, config } from '@/lib/config';
import { cents, validateExpense } from '@/lib/domain';
import { createFinancialDraft, financePolicy, financialPayload, type FinancialDraft, type FinancialEntryKind } from '@/lib/finance-policy';
import type { Workspace } from '@/lib/types';

const receiptTypes:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
const titles:Record<FinancialEntryKind,string>={donation:'Record a donation',expense:'Log a care expense',assignment:'Assign sponsorship'};

export function FinancialEntryDialog({kind,data,busy,error,onClose,onSubmit,onClearError}:{
 kind:FinancialEntryKind;data:Workspace;busy:boolean;error:string;onClose:()=>void;
 onSubmit:(body:Record<string,unknown>)=>Promise<boolean>;onClearError:()=>void;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 const errorBox=useRef<HTMLDivElement>(null);
 const [requestId]=useState(()=>crypto.randomUUID());
 const [draft,setDraft]=useState(createFinancialDraft);
 const [receipt,setReceipt]=useState<File|null>(null);
 const [step,setStep]=useState<'details'|'review'>('details');
 const [verification,setVerification]=useState<'pending'|'forced'>('pending');
 const [localError,setLocalError]=useState('');
 const [uploading,setUploading]=useState(false);
 const inFlight=useRef(false);
 const uploadedReceipt=useRef<{file:File;path:string}|null>(null);
 const locked=busy||uploading;
 const selectedAssignment=data.assignments.find(assignment=>assignment.donor_id===draft.donor_id&&assignment.orphan_id===draft.orphan_id&&assignment.status==='active');

 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 useEffect(()=>{dialog.current?.scrollTo({top:0});dialog.current?.querySelector<HTMLElement>('form select, form input, form textarea')?.focus({preventScroll:true});},[step]);
 useEffect(()=>{if(localError||error){dialog.current?.scrollTo({top:0});errorBox.current?.focus({preventScroll:true});}},[localError,error]);
 function clearError(){setLocalError('');onClearError();}
 function change<K extends keyof FinancialDraft>(key:K,value:FinancialDraft[K]){setDraft(current=>({...current,[key]:value}));clearError();}
 function close(){if(!locked)onClose();}
 function validateDetails(){
  cents(Number(draft.amount));
  if(!draft.donor_id)throw new Error('Select an approved sponsor.');
  if(kind==='assignment'){
   if(!draft.orphan_id)throw new Error('Select an active child.');
   cents(Number(draft.monthly_spending_limit));
  }else if(draft.description.trim().length<financePolicy.minimumDescriptionLength)throw new Error('Enter a description for this transaction.');
  if(kind==='expense')validateExpense(data,draft.donor_id,draft.orphan_id,Number(draft.amount));
 }
 async function save(body:Record<string,unknown>){
  if(inFlight.current)return;
  inFlight.current=true;
  try{await onSubmit(body);}catch(error){setLocalError(error instanceof Error?error.message:'The expense could not be saved. Your details have been kept.');}
  finally{inFlight.current=false;}
 }
 async function details(event:FormEvent<HTMLFormElement>){
  event.preventDefault();clearError();
  try{
   validateDetails();
   if(kind==='expense'&&!receipt){setStep('review');return;}
   const body:Record<string,unknown>=financialPayload(kind,draft,requestId);
   if(kind==='expense'&&receipt){
    if(!receiptTypes[receipt.type])throw new Error('Upload a JPEG, PNG, WebP, or PDF receipt.');
    if(receipt.size>config.maxUploadMB*1024*1024)throw new Error(`Maximum upload size is ${config.maxUploadMB} MB.`);
    setUploading(true);
    if(data.mode==='live'){
     if(uploadedReceipt.current?.file!==receipt){
      const client=createBrowserClient(config.supabaseUrl,config.supabaseKey);
      const path=`${data.profile.id}/${crypto.randomUUID()}.${receiptTypes[receipt.type]}`;
      const uploaded=await client.storage.from(config.receiptBucket).upload(path,receipt,{upsert:false,contentType:receipt.type});
      if(uploaded.error)throw new Error(uploaded.error.message);
      uploadedReceipt.current={file:receipt,path};
     }
     body.receipt_url=uploadedReceipt.current!.path;
    }else body.receipt_url=`demo-attachment:${receipt.name}`;
    body.verification_status='verified';
   }
   await save(body);
  }catch(error){setLocalError(error instanceof Error?error.message:'Check the expense details.');}
  finally{setUploading(false);}
 }
 async function review(event:FormEvent<HTMLFormElement>){
  event.preventDefault();clearError();
  try{
   validateDetails();
   if(verification==='forced'&&draft.audit_notes.trim().length<financePolicy.minimumAuditNoteLength)throw new Error(`Provide at least ${financePolicy.minimumAuditNoteLength} characters explaining approval without a receipt.`);
   await save({...financialPayload(kind,draft,requestId),verification_status:verification,audit_notes:draft.audit_notes.trim()});
  }catch(error){setLocalError(error instanceof Error?error.message:'Check the expense details.');}
 }

 return <dialog ref={dialog} className="modal native-dialog" aria-labelledby="financial-dialog-title" onCancel={event=>{if(locked)event.preventDefault();else onClose();}}>
  <div className="modal-heading"><div><span className="eyebrow">CARE, RECORDED</span><h2 id="financial-dialog-title">{step==='review'?'Missing receipt':titles[kind]}</h2></div><button className="icon-button" aria-label="Close dialog" disabled={locked} onClick={close}><X size={20}/></button></div>
  {(localError||error)&&<div ref={errorBox} className="error" role="alert" tabIndex={-1}>{localError||error}</div>}
  {step==='review'?<form key="review" onSubmit={review}>
   <div className="receipt-warning"><AlertTriangle size={25}/><p>No receipt is attached. Save as Pending Verification, or approve with an audit justification.</p></div>
   <div className="expense-summary"><strong>{draft.description}</strong><span>{data.profiles.find(profile=>profile.id===draft.donor_id)?.full_name} · {data.children.find(child=>child.id===draft.orphan_id)?.full_name}</span><span>{config.currency} {draft.amount} · {draft.category}</span></div>
   <label className="field">Verification decision<select value={verification} disabled={locked} onChange={event=>{setVerification(event.target.value as typeof verification);clearError();}}><option value="pending">Save as Pending Verification</option><option value="forced">Force approve with justification</option></select></label>
   {verification==='forced'&&<label className="field">Mandatory audit justification<textarea name="audit_notes" value={draft.audit_notes} onChange={event=>change('audit_notes',event.target.value)} disabled={locked} required minLength={financePolicy.minimumAuditNoteLength} maxLength={financePolicy.maximumAuditNoteLength} placeholder="Explain why this expense is being approved without a receipt."/></label>}
   <p className="muted">The expense deducts from this sponsorship’s allocation immediately. Its verification status and justification are retained in the audit trail.</p>
   <div className="modal-actions"><Button type="button" variant="outline" disabled={locked} onClick={()=>setStep('details')}>Back</Button><Button disabled={locked}>{locked?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Save expense</Button></div>
  </form>:<form key="details" onSubmit={details}>
   <label className="field">Sponsor<select name="donor_id" required value={draft.donor_id} disabled={locked} onChange={event=>change('donor_id',event.target.value)}><option value="" disabled>Select an approved sponsor</option>{data.profiles.filter(profile=>profile.role==='donor'&&profile.status==='approved').map(profile=><option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>
   {(kind==='expense'||kind==='assignment')&&<label className="field">Child<select name="orphan_id" required value={draft.orphan_id} disabled={locked} onChange={event=>change('orphan_id',event.target.value)}><option value="" disabled>Select an active child</option>{data.children.filter(child=>child.status==='active').map(child=><option key={child.id} value={child.id}>{child.full_name}</option>)}</select></label>}
   <label className="field">{kind==='assignment'?'Initial allocation':'Amount'} ({config.currency})<input name="amount" type="number" required min="0.01" step="0.01" max={financePolicy.maximumAmount} value={draft.amount} onChange={event=>change('amount',event.target.value)} disabled={locked} placeholder="0.00"/></label>
   {kind==='assignment'?<label className="field">Monthly spending cap ({config.currency})<input name="monthly_spending_limit" type="number" required min="0.01" step="0.01" max={financePolicy.maximumAmount} value={draft.monthly_spending_limit} onChange={event=>change('monthly_spending_limit',event.target.value)} disabled={locked}/></label>:<label className="field">Description<textarea name="description" required minLength={financePolicy.minimumDescriptionLength} maxLength={financePolicy.maximumDescriptionLength} value={draft.description} onChange={event=>change('description',event.target.value)} disabled={locked} placeholder="What is this contribution or expense for?"/></label>}
   {kind==='expense'&&<>
    <label className="field">Category<select name="category" value={draft.category} onChange={event=>change('category',event.target.value)} disabled={locked}>{categories.map(category=><option key={category}>{category}</option>)}</select></label>
    {draft.donor_id&&draft.orphan_id&&<p className="muted">{selectedAssignment?`Sponsorship allocation: ${config.currency} ${selectedAssignment.allocated_balance}. Monthly cap: ${config.currency} ${selectedAssignment.monthly_spending_limit}.`:'Assign this sponsor to the selected child before recording an expense.'}</p>}
    <label className="upload-field"><Receipt size={24}/><strong>{receipt?.name||'Attach a receipt'}</strong><span>JPEG, PNG, WebP, PDF · Up to {config.maxUploadMB} MB</span><input type="file" accept={Object.keys(receiptTypes).join(',')} disabled={locked} onChange={event=>{setReceipt(event.target.files?.[0]||null);uploadedReceipt.current=null;clearError();}}/></label>
    {receipt&&<Button type="button" variant="ghost" disabled={locked} onClick={()=>{setReceipt(null);uploadedReceipt.current=null;clearError();}}>Remove receipt</Button>}
   </>}
   <div className="modal-actions"><Button type="button" variant="outline" disabled={locked} onClick={close}>Cancel</Button><Button disabled={locked}>{locked?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Save {kind}</Button></div>
  </form>}
 </dialog>;
}
