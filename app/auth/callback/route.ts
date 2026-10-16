import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requestOrigin } from '@/lib/request-security';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const client = await supabase();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', requestOrigin(request)));
  }
  return NextResponse.redirect(new URL('/login?auth_error=confirmation_failed', requestOrigin(request)));
}
