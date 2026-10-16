import { NextResponse } from 'next/server';
import { requestOrigin } from '@/lib/request-security';

export async function GET(request: Request) {
  const source = new URL(request.url);
  const hash = source.searchParams.get('token_hash');
  if (source.searchParams.get('type') === 'recovery' && hash && hash.length <= 1024) {
    const destination = new URL('/reset-password', requestOrigin(request));
    destination.searchParams.set('token_hash', hash);
    // The password form consumes the token only on submission, not on an email scanner visit.
    return NextResponse.redirect(destination, { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  return NextResponse.redirect(new URL('/forgot-password?error=invalid_link', requestOrigin(request)));
}
