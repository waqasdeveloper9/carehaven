'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { config } from '@/lib/config';
import { PasswordForm } from './account-security';

export function WelcomeSetup({ tokenHash }: { tokenHash?: string }) {
  const [sessionRecovery, setSessionRecovery] = useState(false);
  const [loading, setLoading] = useState(!tokenHash);
  const [error, setError] = useState('');
  useEffect(() => {
    if (tokenHash) return;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const access_token = fragment.get('access_token'), refresh_token = fragment.get('refresh_token');
    if (!access_token || !refresh_token || fragment.get('type') !== 'recovery') { setLoading(false); return; }
    // Supabase's default email template returns tokens in the URL fragment; remove it immediately.
    history.replaceState(null, '', location.pathname);
    const client = createBrowserClient(config.supabaseUrl, config.supabaseKey);
    void client.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) setError('This setup link is invalid or expired. Request a new one.');
      else setSessionRecovery(true);
      setLoading(false);
    }).catch(() => { setError('Could not verify this setup link.'); setLoading(false); });
  }, [tokenHash]);
  if (loading) return <p role="status">Verifying your welcome link…</p>;
  if (tokenHash || sessionRecovery) return <PasswordForm mode="reset" tokenHash={tokenHash} sessionRecovery={sessionRecovery}/>;
  return <div className="reset-link-help">{error && <p role="alert">{error}</p>}<p>Open the setup link from your welcome email. If it has expired, request a new link or ask your administrator to resend it.</p><a className="button primary" href="/forgot-password">Request a new setup link</a><a className="text-button" href="/login">Back to sign in</a></div>;
}
