import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { passwordEmailConfigured } from '@/lib/account-mail';
import { sessionAuthenticatedSince } from '@/lib/account-actions';
import { demoWorkspace } from '@/lib/demo';
import { permissions, config } from '@/lib/config';
import { z } from 'zod';
import { isSameOriginRequest } from '@/lib/request-security';
import { accountProvisioningConfigured } from '@/lib/supabase-admin';
import { serverConfig } from '@/lib/server-config';
import { expenseSchema, moneySchema } from '@/lib/finance-policy';
import { workspaceError } from '@/lib/api-errors';
const demo = () => process.env.APP_MODE === 'demo' || (process.env.NODE_ENV !== 'production' && !process.env.APP_MODE && !config.supabaseUrl);
export async function GET(request:Request) {
 if(demo()) return NextResponse.json(demoWorkspace());
 try {
 const client = await supabase(); const {data:claims,error:claimsError} = await client.auth.getClaims();
 const userId=!claimsError?claims?.claims.sub:undefined;
 if(!userId) return NextResponse.json({error:'Please sign in.'},{status:401});
 if(new URL(request.url).searchParams.get('section')==='audit'){
  const result=await client.from('audit_logs').select('id,action_type,created_at,details').order('created_at',{ascending:false}).limit(serverConfig.auditHistoryLimit);
  if(result.error)throw result.error;
  return NextResponse.json({audits:result.data},{headers:{'Cache-Control':'no-store'}});
 }
 const {data:profile,error} = await client.from('profiles').select('*').eq('id',userId).single(); if(error) throw error;
 if(profile.must_change_password)return NextResponse.json({forcePasswordChange:true,profile},{status:403});
 if(!sessionAuthenticatedSince(claims!.claims,profile.password_auth_after))return NextResponse.json({error:'Your password changed. Please sign in again.'},{status:401});
 if(profile.requires_password_setup) return NextResponse.json({setupRequired:true,error:'Finish setting your password using the link in your welcome email. Use Forgot password to request another link.'},{status:403});
 if(profile.status !== 'approved') return NextResponse.json({pending:true,profile},{status:403});
 const allRows = async (table:string,columns='*') => {
   const rows:Record<string,unknown>[]=[];
   const pageSize=serverConfig.workspacePageSize;
   const key=['user_permissions','account_invitations'].includes(table)?'user_id':'id';
   let cursor:string|undefined;
   for(;;){
     let query=client.from(table).select(columns).order(key).limit(pageSize);
     if(cursor)query=query.gt(key,cursor);
     const result=await query.overrideTypes<Record<string,unknown>[],{merge:false}>();
     if(result.error)return {data:null,error:result.error};
     rows.push(...result.data);
     if(result.data.length<pageSize)return {data:rows,error:null};
     cursor=String(result.data.at(-1)![key]);
   }
 };
 const [results,auditResult,invitationResult,settings]=await Promise.all([
  Promise.all(['profiles','orphans','donor_child_assignments','financial_ledger','user_permissions'].map(table=>allRows(table))),
  client.from('audit_logs').select('id,action_type,created_at,details').order('created_at',{ascending:false}).limit(serverConfig.auditHistoryLimit),
  profile.role==='admin'?allRows('account_invitations','user_id,delivery_status,send_attempts,last_sent_at,last_error'):Promise.resolve({data:[],error:null}),
  profile.role==='admin'?client.from('app_settings').select('value').eq('key','staff_default_permissions').maybeSingle():Promise.resolve({data:null,error:null}),
 ]);
 for(const result of results)if(result.error)throw result.error;
 if(auditResult.error)throw auditResult.error;
 if(invitationResult.error&&!['42P01','PGRST205'].includes(invitationResult.error.code))throw invitationResult.error;
 if(settings.error)throw settings.error;
 const [profiles,children,assignments,entries,grants]=results.map(result=>result.data||[]);
 entries.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 assignments.sort((a,b)=>String(b.start_date).localeCompare(String(a.start_date)));
 const audits=auditResult.data||[],invitations=invitationResult.data||[];
 const staffDefaultPermissions=Array.isArray(settings.data?.value)?settings.data.value.filter((value:unknown)=>permissions.includes(value as typeof permissions[number])):[];
 return NextResponse.json({mode:'live',profile,profiles,children,assignments,entries,audits,invitations,staffDefaultPermissions,capabilities:{accountMaintenance:'must_change_password' in profile,directPasswordReset:'must_change_password' in profile&&accountProvisioningConfigured()&&passwordEmailConfigured(),profilePhotos:'avatar_path' in profile,sponsorPermissions:'avatar_path' in profile,inviteAccounts:accountProvisioningConfigured()&&'requires_password_setup' in profile},grants:Object.fromEntries(grants.map(g=>[String(g.user_id),g]))},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const failure=workspaceError(error);return NextResponse.json({error:failure.message},{status:failure.status});}
}
const id = z.uuid(); const amount = moneySchema;
const actionSchema = z.discriminatedUnion('action',[
 z.object({action:z.literal('child'),id:id.optional(),full_name:z.string().trim().min(2).max(100),date_of_birth:z.iso.date(),gender:z.enum(['Male','Female','Other']),picture_url:z.string().max(500).nullable().optional()}),
 z.object({action:z.literal('status'),id,status:z.enum(['active','inactive','graduated','left'])}),
 z.object({action:z.literal('approval'),id,status:z.enum(['approved','rejected'])}),
 z.object({action:z.literal('permission'),id,permission:z.enum(permissions),enabled:z.boolean()}),
 z.object({action:z.literal('assignment'),donor_id:id,orphan_id:id,monthly_spending_limit:amount,amount}),
 z.object({action:z.literal('donation'),donor_id:id,amount,description:z.string().trim().min(2).max(500),request_id:id}),
 expenseSchema,
]);
export async function POST(request: Request) {
 if(!isSameOriginRequest(request)) return NextResponse.json({error:'Invalid origin'},{status:403});
 if(demo()) return NextResponse.json({error:'Demo changes are stored in this browser only.'},{status:400});
 try {
 const body = actionSchema.parse(await request.json()); const client=await supabase();
 const {data:claims,error:claimsError}=await client.auth.getClaims(); if(claimsError||!claims) return NextResponse.json({error:'Authentication required'},{status:401});
 let result;
 switch(body.action){
 case 'child': {
 const record={full_name:body.full_name,date_of_birth:body.date_of_birth,gender:body.gender,...(body.picture_url!==undefined?{picture_url:body.picture_url}:{})};
 result=body.id?await client.from('orphans').update(record).eq('id',body.id).select('id').single():await client.from('orphans').insert(record).select('id').single();break;
 }
 case 'status': result=await client.from('orphans').update({status:body.status}).eq('id',body.id);break;
 case 'approval': result=await client.rpc('set_donor_status',{p_id:body.id,p_status:body.status});break;
 case 'permission': result=await client.rpc('set_permission',{p_user:body.id,p_permission:body.permission,p_enabled:body.enabled});break;
 case 'assignment': result=await client.rpc('allocate_sponsorship',{p_donor:body.donor_id,p_child:body.orphan_id,p_limit:body.monthly_spending_limit,p_amount:body.amount});break;
 case 'donation': result=await client.rpc('post_donation',{p_donor:body.donor_id,p_amount:body.amount,p_description:body.description,p_request:body.request_id});break;
 case 'expense': result=await client.rpc('post_expense',{p_donor:body.donor_id,p_child:body.orphan_id,p_amount:body.amount,p_category:body.category,p_description:body.description,p_verification:body.verification_status,p_notes:body.audit_notes||null,p_receipt:body.receipt_url||null,p_request:body.request_id});break;
 }
 if(result.error) throw result.error; return NextResponse.json({ok:true});
 }catch(error){const failure=workspaceError(error);return NextResponse.json({error:failure.message},{status:failure.status});}
}
