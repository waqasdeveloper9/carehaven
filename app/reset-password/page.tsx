import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth-gate';
import { PasswordForm } from '@/components/account-security';
export const metadata:Metadata={title:'Reset password',referrer:'no-referrer',robots:{index:false,follow:false}};
export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<{token_hash?:string;code?:string}>}){
  const {token_hash:tokenHash,code}=await searchParams;
  const validLink=(!!tokenHash!==!!code)&&(!tokenHash||tokenHash.length<=1024)&&(!code||code.length<=2048);
  return <AuthLayout><h1>A fresh start.</h1><p className="muted">Choose a strong password for your care workspace.</p><h2 className="auth-form-title">SET YOUR PASSWORD</h2>{validLink?<PasswordForm mode="reset" tokenHash={tokenHash} recoveryCode={code}/>:<div className="reset-link-help"><p>This page needs a valid link from your password reset email or administrator setup.</p><a className="button primary" href="/forgot-password">Request a new reset link</a><a className="text-button" href="/login">Back to sign in</a></div>}</AuthLayout>;
}
