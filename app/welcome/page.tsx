import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth-gate';
import { WelcomeSetup } from '@/components/welcome-setup';
import { config } from '@/lib/config';
export const metadata: Metadata = { title: 'Welcome · Set your password', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ token_hash?: string;type?:string }> }) {
  const { token_hash: tokenHash,type } = await searchParams;
  return <AuthLayout><h1>Welcome to {config.name}.</h1><p className="muted">A little care. A lasting impact. Choose your private password and we will take you straight into your account.</p><h2 className="auth-form-title">LET’S GET YOU STARTED</h2><WelcomeSetup tokenHash={tokenHash && tokenHash.length <= 1024 ? tokenHash : undefined} proofType={type==='recovery'?'recovery':'email'}/></AuthLayout>;
}
