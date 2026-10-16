import type { Metadata } from 'next';
import { AuthLayout } from '@/components/auth-gate';
import { WelcomeSetup } from '@/components/welcome-setup';
import { config } from '@/lib/config';
export const metadata: Metadata = { title: 'Welcome · Set your password', referrer: 'no-referrer', robots: { index: false, follow: false } };
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  const { token_hash: tokenHash } = await searchParams;
  return <AuthLayout><h1>Welcome to {config.name}.</h1><p className="muted">Your account is ready. Set your own private password to finish joining, then sign in with your email.</p><h2 className="auth-form-title">MAKE YOUR ACCOUNT YOURS</h2><WelcomeSetup tokenHash={tokenHash && tokenHash.length <= 1024 ? tokenHash : undefined}/></AuthLayout>;
}
