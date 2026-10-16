import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function accountProvisioningConfigured() {
  return !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) && !!process.env.APP_URL;
}
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Account invitations need the server-only Supabase secret key in deployment settings.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export function welcomeUrl() {
  if (!process.env.APP_URL) throw new Error('Configure APP_URL with the permanent application address before inviting accounts.');
  const url = new URL('/welcome', process.env.APP_URL);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('APP_URL must use HTTPS.');
  return url.toString();
}
