import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { authActionSchema, hasRecentRecovery, recoveryMessage, resolveLogin } from '@/lib/auth-policy';
import { isSameOriginRequest, requestOrigin } from '@/lib/request-security';

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  try {
    const body = authActionSchema.parse(await request.json());
    const client = await supabase();

    if (body.action === 'forgot_password') {
      // The response does not reveal whether this email belongs to an account.
      const { error } = await client.auth.resetPasswordForEmail(body.email, {
        redirectTo: new URL('/reset-password', process.env.APP_URL || origin).toString(),
      });
      if (error) console.warn('Password recovery delivery failed', { code: error.code, status: error.status });
      return NextResponse.json({ ok: true, message: recoveryMessage }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (body.action === 'login') {
      const email = resolveLogin(body.identifier, process.env.AUTH_ADMIN_USERNAME, process.env.AUTH_ADMIN_EMAIL);
      if (!email) return NextResponse.json({ error: 'Invalid email, username, or password.' }, { status: 400 });
      const { error } = await client.auth.signInWithPassword({ email, password: body.password });
      if (error) throw new Error('Invalid email, username, or password.');
    }

    if (body.action === 'register') {
      const { error } = await client.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: { full_name: body.full_name },
          emailRedirectTo: new URL('/auth/callback', process.env.APP_URL || origin).toString(),
        },
      });
      if (error) throw error;
    }

    if (body.action === 'change_password') {
      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError || !user?.email) return NextResponse.json({ error: 'Please sign in again before changing your password.' }, { status: 401 });
      const { error: checkError } = await client.auth.signInWithPassword({ email: user.email, password: body.current_password });
      if (checkError) return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 });
      const { error } = await client.auth.updateUser({ password: body.password });
      if (error) throw error;
      await client.auth.signOut({ scope: 'global' });
      return NextResponse.json({ ok: true, message: 'Password changed. Please sign in with your new password.' });
    }

    if (body.action === 'reset_password') {
      // Accept both cross-browser TokenHash links and Supabase's default PKCE email flow.
      const verification = body.token_hash
        ? await client.auth.verifyOtp({ token_hash: body.token_hash, type: 'recovery' })
        : await client.auth.exchangeCodeForSession(body.code!);
      if (verification.error) return NextResponse.json({ error: body.code ? 'This reset link is invalid or expired. Open it in the browser where you requested it, or request a new link.' : 'This reset link is invalid or expired. Request a new link.' }, { status: 400 });
      const {data:claimData,error:claimError}=await client.auth.getClaims();
      if(claimError||!claimData||!hasRecentRecovery(claimData.claims)){
        await client.auth.signOut();
        return NextResponse.json({error:'A recent password recovery verification is required. Request a new reset link.'},{status:400});
      }
      const { error } = await client.auth.updateUser({ password: body.password });
      if (error) {
        await client.auth.signOut();
        throw new Error('The password could not be updated. Request a new reset link and try a different password.');
      }
      await client.auth.signOut({ scope: 'global' });
      return NextResponse.json({ ok: true, message: 'Password saved. Please sign in with your new password.' });
    }

    if (body.action === 'logout') {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed.';
    return NextResponse.json({ error: message.startsWith('[') ? 'Check the required fields and password requirements.' : message }, { status: 400 });
  }
}
