import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin, welcomeUrl } from '@/lib/supabase-admin';
import { accountActionSchema } from '@/lib/onboarding';
import { isSameOriginRequest } from '@/lib/request-security';
import { config } from '@/lib/config';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  try {
    const body = accountActionSchema.parse(await request.json());
    const client = await supabase();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { data: allowed, error: permissionError } = await client.rpc('is_admin');
    if (permissionError || !allowed) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
    const redirectTo = welcomeUrl();
    const admin = supabaseAdmin();
    let userId: string;
    if (body.action === 'create') {
      const contextArgs = { p_actor: user.id, p_request: body.request_id, p_email: body.email };
      const context = await admin.rpc('provisioning_context', contextArgs);
      if (context.error) throw context.error;
      userId = context.data;
      if (!userId) {
        const created = await admin.auth.admin.createUser({
          email: body.email, password: randomBytes(48).toString('base64url'), email_confirm: true,
          user_metadata: { full_name: body.full_name, application_name:config.name },
          app_metadata: { provisioning_request: body.request_id, provisioned_by: user.id },
        });
        if (created.error) {
          // A concurrent retry can create the Auth record first. Recover only this same request.
          const retry = await admin.rpc('provisioning_context', contextArgs);
          if (retry.error || !retry.data) throw new Error('Account creation failed. Check whether this email already has an account, then retry.');
          userId = retry.data;
        } else userId = created.data.user.id;
      }
      const { action: _action, request_id: _request, ...payload } = body;
      const provisioned = await admin.rpc('provision_account', { p_actor: user.id, p_user: userId, p_request: body.request_id, p_payload: payload });
      if (provisioned.error) throw provisioned.error;
    } else userId = body.id;

    const queued = await admin.from('account_invitations').select('user_id').eq('user_id',userId).maybeSingle();
    if(queued.error)throw queued.error;
    if(!queued.data)throw new Error('This account was not fully provisioned. Retry its original creation form to finish setup before sending an invitation.');

    const { data: lease, error: leaseError } = await admin.rpc('claim_account_invitation', { p_actor: user.id, p_user: userId });
    if (leaseError) throw leaseError;
    if (!lease) return NextResponse.json({ ok: true, message: 'Account saved. An invitation was recently attempted or password setup is already complete. Check its onboarding status.' });
    const { data: target, error: targetError } = await admin.from('profiles').select('email,full_name').eq('id', userId).single();
    // Use a separate client: generating email must never replace the administrator's session.
    const mailClient = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let accepted = false;
    if (!targetError && target) {
      try {
        const metadata=await admin.auth.admin.updateUserById(userId,{user_metadata:{full_name:target.full_name,application_name:config.name}});
        if(metadata.error)throw metadata.error;
        // The dedicated Magic Link template carries the branded welcome email. Recovery remains separate.
        const {error}=await mailClient.auth.signInWithOtp({email:target.email,options:{shouldCreateUser:false,emailRedirectTo:redirectTo}});
        accepted=!error;
      }
      catch { accepted = false; }
    }
    const finished = await admin.rpc('finish_account_invitation', { p_actor: user.id, p_user: userId, p_lease: lease, p_success: accepted });
    return NextResponse.json({ ok: true, message: finished.error
      ? 'Account saved. Email status could not be recorded; check onboarding before retrying.'
      : accepted ? 'Account saved. The email provider accepted the welcome/password setup email. Delivery and first login are tracked separately.'
      : 'Account saved, but the welcome email failed. Check Supabase email settings and use Resend setup email.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Account operation failed.';
    return NextResponse.json({ error: message.startsWith('[') ? 'Check the account fields and donation amount.' : message }, { status: 400 });
  }
}
