'use client';
import { useState, type FormEvent } from 'react';
import { Check, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';
import { passwordPolicy } from '@/lib/auth-policy';

export function PasswordForm({mode,tokenHash,recoveryCode,sessionRecovery=false,proofType='email',demo=false}:{mode:'change'|'reset'|'welcome';tokenHash?:string;recoveryCode?:string;sessionRecovery?:boolean;proofType?:'email'|'recovery';demo?:boolean}){
  const [error,setError]=useState('');const [success,setSuccess]=useState('');const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');const form=event.currentTarget;const values=new FormData(form);
    const password=String(values.get('password'));const confirm=String(values.get('confirm_password'));
    if(password!==confirm){setError('The passwords do not match.');return;}
    setBusy(true);
    try{
      const body=mode==='welcome'
        ?{action:'setup_password',password,confirm_password:confirm,proof_type:proofType,...(tokenHash?{token_hash:tokenHash}:{session_setup:true})}
        :{action:mode==='change'?'change_password':'reset_password',password,confirm_password:confirm,...(mode==='change'?{current_password:values.get('current_password')}:tokenHash?{token_hash:tokenHash}:sessionRecovery?{session_recovery:true}:{code:recoveryCode})};
      const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();
      if(!response.ok)throw new Error(result.error);form.reset();
      if(mode==='welcome'&&result.signedIn&&result.redirect==='/'){window.location.replace('/');return;}
      setSuccess(result.message);
    }catch(error){setError(error instanceof Error?error.message:'Your password could not be updated.');}finally{setBusy(false);}
  }
  if(success)return <div className="password-success" role="status"><Check size={27}/><h3>Password saved</h3><p>{success}</p><Button asChild><a href="/login">Sign in with your new password</a></Button></div>;
  return <form onSubmit={submit} className="password-form">
    {error&&<div className="error" role="alert">{error}</div>}
    {demo&&<p className="muted">Password changes are available in a connected live workspace. Demo accounts do not have real passwords.</p>}
    {mode==='change'&&<label className="field">Current password<input name="current_password" type="password" autoComplete="current-password" required disabled={demo||busy}/></label>}
    <label className="field">New password<input name="password" type="password" autoComplete="new-password" required minLength={passwordPolicy.minimumLength} maxLength={passwordPolicy.maximumLength} disabled={demo||busy}/><small>Use at least {passwordPolicy.minimumLength} characters. A long, unique passphrase works well.</small></label>
    <label className="field">Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" required minLength={passwordPolicy.minimumLength} maxLength={passwordPolicy.maximumLength} disabled={demo||busy}/></label>
    <p className="password-session-note"><ShieldCheck size={15}/>{mode==='welcome'?'Set your password once. We will sign you in and open your workspace.':'After saving, sign in again with your new password.'}</p>
    <Button disabled={demo||busy}><KeyRound size={16}/>{busy?'Saving…':mode==='change'?'Change password':mode==='welcome'?'Set password and get started':'Set new password'}</Button>
  </form>;
}

export function AccountSecurity({demo}:{demo:boolean}){
  return <section className="panel settings-panel account-security"><div className="security-heading"><span className="stat-icon"><ShieldCheck size={23}/></span><div><h2>Account security</h2><p>Keep your account protected with a unique password.</p></div></div><PasswordForm mode="change" demo={demo}/></section>;
}
