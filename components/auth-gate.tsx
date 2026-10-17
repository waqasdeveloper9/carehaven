'use client';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { AuthStory, BrandMark } from './brand-ui';
import { Button } from './ui/button';
import { PasswordForm } from './account-security';
import { config } from '@/lib/config';
import { passwordPolicy, recoveryMessage } from '@/lib/auth-policy';

export type AuthGateState = { pending?: boolean; forcePasswordChange?: boolean; profile?: {full_name:string;status:string}; error?:string };

export function AuthLayout({children}: {children:React.ReactNode}) {
  return <main className="auth-screen"><div className="auth-layout"><AuthStory/><section className="auth-card"><div className="auth-form-brand"><BrandMark/><strong>{config.name}</strong></div><span className="eyebrow">YOUR CARE WORKSPACE</span>{children}<div className="auth-form-footer"><ShieldCheck size={16}/><span>Private care records. Secure access.</span></div></section></div></main>;
}

export function AuthGate({gate,onReady,initialMode='login'}:{gate:AuthGateState;onReady:()=>Promise<void>;initialMode?:'login'|'forgot'}) {
  const [mode,setMode]=useState<'login'|'register'|'forgot'>(initialMode);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  function changeMode(next:typeof mode){setMode(next);setError('');setMessage('');}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      const form=new FormData(event.currentTarget);
      const body=mode==='forgot'?{action:'forgot_password',email:form.get('email')}:mode==='register'?{action:'register',email:form.get('email'),password:form.get('password'),full_name:form.get('full_name')}:{action:'login',identifier:form.get('identifier'),password:form.get('password')};
      const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      if(mode==='forgot')setMessage(recoveryMessage);
      else if(mode==='register')setMessage('Check your email to confirm your account. An administrator will review your application.');
      else if(result.forcePasswordChange)window.location.assign('/change-password');
      else await onReady();
    }catch(error){setError(error instanceof Error?error.message:'The request could not be completed.');}finally{setBusy(false);}
  }
  if(gate.forcePasswordChange)return <RequiredPasswordChange/>;
  return <AuthLayout><h1>{gate.pending?'Care starts with trust.':mode==='forgot'?'A fresh start.':mode==='register'?'Make a lasting difference.':'Welcome back.'}</h1><p className="muted">{gate.pending?'Your account is one step closer to a brighter tomorrow.':mode==='forgot'?'We’ll help you get back to your care workspace.':mode==='register'?'Join a community that puts children first.':'Sign in to care, connect, and create possibility.'}</p>
    {gate.pending?<><ShieldCheck size={45} className="gate-icon"/><h2>{gate.profile?.status==='rejected'?'Application not approved':'Your application is under review'}</h2><p>Welcome, {gate.profile?.full_name}. Please contact your organization’s administrator about account access.</p><Button variant="outline" onClick={async()=>{await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});location.assign('/login');}}>Sign out</Button></>:<>
      <h2 className="auth-form-title">{mode==='forgot'?'RESET YOUR PASSWORD':mode==='register'?'CREATE YOUR SPONSOR ACCOUNT':'SIGN IN TO YOUR ACCOUNT'}</h2>
      {gate.error&&gate.error!=='Please sign in.'&&<div className="error" role="alert">{gate.error}</div>}
      {error&&<div className="error" role="alert">{error}</div>}
      {message&&<div className="auth-feedback" role="status"><Mail size={20}/><p>{message}</p></div>}
      <form onSubmit={submit}>
        {mode==='register'&&<label className="field">Full name<input name="full_name" required minLength={2} maxLength={100} autoComplete="name"/></label>}
        <label className="field">{mode==='login'?'Email or username':'Email'}<input name={mode==='login'?'identifier':'email'} type={mode==='login'?'text':'email'} required autoComplete={mode==='login'?'username':'email'} maxLength={254}/></label>
        {mode!=='forgot'&&<label className="field">Password<input name="password" type="password" required minLength={mode==='register'?passwordPolicy.minimumLength:1} maxLength={passwordPolicy.maximumLength} autoComplete={mode==='register'?'new-password':'current-password'}/>{mode==='register'&&<small>Use at least {passwordPolicy.minimumLength} characters.</small>}</label>}
        {mode==='login'&&<div className="auth-password-link"><button type="button" onClick={()=>changeMode('forgot')}>Forgot password?</button></div>}
        <Button disabled={busy}>{mode==='forgot'?<Mail size={16}/>:<KeyRound size={16}/>} {busy?'Please wait…':mode==='forgot'?'Send reset link':mode==='register'?'Create account':'Sign in'}<ArrowRight size={16}/></Button>
      </form>
      <div className="auth-mode-links">{mode==='forgot'?<button className="text-button" onClick={()=>changeMode('login')}><ArrowLeft size={14}/>Back to sign in</button>:<button className="text-button" onClick={()=>changeMode(mode==='login'?'register':'login')}>{mode==='register'?'Already have an account? Sign in':'New here? Register as a sponsor'}</button>}</div>
    </>}
  </AuthLayout>;
}

export function RequiredPasswordChange(){return <AuthLayout><h1>Choose your own password.</h1><p className="muted">Your administrator set a temporary password. You must replace it before accessing your workspace.</p><PasswordForm mode="change"/><p><a href="/forgot-password">Forgot your temporary password?</a></p><button className="text-button" onClick={async()=>{const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});if(response.ok)window.location.replace('/login');}}>Sign out</button></AuthLayout>;}
