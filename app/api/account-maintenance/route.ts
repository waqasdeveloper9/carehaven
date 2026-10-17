import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { accountMaintenanceSchema } from '@/lib/account-actions';
import { passwordEmailConfigured, sendPasswordUpdated } from '@/lib/account-mail';
import { runAdminPasswordReset, type ResetStage } from '@/lib/admin-password-reset';
import { isSameOriginRequest } from '@/lib/request-security';
import { workspaceError } from '@/lib/api-errors';
import { config } from '@/lib/config';

export async function POST(request:Request){
 if(!isSameOriginRequest(request))return NextResponse.json({error:'Invalid origin'},{status:403});
 try{
  const body=accountMaintenanceSchema.parse(await request.json());const client=await supabase();
  const {data,error}=await client.auth.getClaims();if(error||!data)return NextResponse.json({error:'Please sign in again.'},{status:401});
  const permission=await client.rpc('is_admin');if(permission.error)throw permission.error;
  if(!permission.data)return NextResponse.json({error:'Administrator access required.'},{status:403});
  if(body.action==='edit'){
   const result=await client.rpc('edit_account',{p_user:body.id,p_full_name:body.full_name,p_phone:body.phone});if(result.error)throw result.error;
   return NextResponse.json({ok:true,profile:result.data,message:'Account details updated.'},{headers:{'Cache-Control':'no-store'}});
  }
  if(!passwordEmailConfigured())return NextResponse.json({error:'Password emails need a custom SMTP or Resend sender configured in Vercel. No password was changed.'},{status:503});
  if(!process.env.APP_URL)throw new Error('Configure the permanent application URL before resetting passwords.');
  const loginUrl=new URL('/login',process.env.APP_URL);if(loginUrl.protocol!=='https:')throw new Error('The sign-in URL must use HTTPS.');
  const target=await client.from('profiles').select('*').eq('id',body.id).single();if(target.error)throw target.error;
  if(!['staff_user','donor'].includes(target.data.role)||target.data.status!=='approved')return NextResponse.json({error:'Choose an approved staff or sponsor account.'},{status:400});
  const admin=supabaseAdmin();const actor=data.claims.sub;
  const fingerprint=createHmac('sha256',(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)!).update(`${body.request_id}:${body.id}:${body.password}`).digest('hex');
  const args={p_actor:actor,p_user:body.id,p_request:body.request_id};
  const result=await runAdminPasswordReset({
   begin:async()=>{const result=await admin.rpc('begin_admin_password_reset',{...args,p_fingerprint:fingerprint});if(result.error)throw result.error;return result.data as ResetStage;},
   update:async()=>{const existing=await admin.auth.admin.getUserById(body.id);if(existing.error)throw new Error('The account could not be loaded. No email was sent.');const updated=await admin.auth.admin.updateUserById(body.id,{password:body.password,app_metadata:{...existing.data.user.app_metadata,admin_password_reset_request:body.request_id}});if(updated.error)throw new Error(updated.error.code==='same_password'?'Choose a different password from the current password.':'The password could not be updated. No email was sent.');},
   inspect:async()=>{const result=await admin.from('account_password_resets').select('phase,email_status').eq('request_id',body.request_id).single();if(result.error)throw new Error('Reset status is uncertain. Check the account before starting another reset.');return result.data as ResetStage;},
   fail:async()=>{const result=await admin.rpc('fail_admin_password_reset',args);if(result.error)throw new Error('Reset status could not be recorded. Check the account before retrying.');},
   send:()=>sendPasswordUpdated({name:target.data.full_name,application:config.name,email:target.data.email,password:body.password,loginUrl:loginUrl.toString(),requestId:body.request_id}),
   record:async accepted=>{const result=await admin.rpc('finish_admin_password_reset',{...args,p_success:accepted});if(result.error)throw result.error;},
  });
  const profile=await client.from('profiles').select('*').eq('id',body.id).single();
  return NextResponse.json({ok:true,...result,profile:profile.data||undefined,message:result.emailAccepted?'Password updated. The email provider accepted the temporary-password email. The owner must choose a new password before accessing the app.':'Password updated, but email acceptance could not be confirmed. Retry email in this dialog; it will not reset the password again.'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const failure=workspaceError(error);return NextResponse.json({error:failure.message},{status:failure.status});}
}
