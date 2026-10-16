import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { demoWorkspace } from '@/lib/demo';
import { permissions, config } from '@/lib/config';
import { z } from 'zod';
import { isSameOriginRequest } from '@/lib/request-security';
import { accountProvisioningConfigured } from '@/lib/supabase-admin';
import { serverConfig } from '@/lib/server-config';
import { expenseSchema, moneySchema } from '@/lib/finance-policy';
import { workspaceError } from '@/lib/api-errors';
const demo = () => process.env.APP_MODE === 'demo' || (process.env.NODE_ENV !== 'production' && !process.env.APP_MODE && !config.supabaseUrl);
export async function GET() {
 if(demo()) return NextResponse.json(demoWorkspace());
 try {
 const client = await supabase(); const {data:{user}} = await client.auth.getUser();
 if(!user) return NextResponse.json({error:'Please sign in.'},{status:401});
 const {data:profile,error} = await client.from('profiles').select('*').eq('id',user.id).single(); if(error) throw error;
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
 const results = await Promise.all(['profiles','orphans','donor_child_assignments','financial_ledger','user_permissions'].map(table=>allRows(table)));
 for(const r of results) if(r.error) throw r.error;
 const [profiles,children,assignments,entries,grants] = results.map(r=>r.data || []);
 entries.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 assignments.sort((a,b)=>String(b.start_date).localeCompare(String(a.start_date)));
 const {data:audits,error:auditError}=await client.from('audit_logs').select('id,action_type,created_at,details').order('created_at',{ascending:false}).limit(serverConfig.auditHistoryLimit);
 if(auditError)throw auditError;
 let invitations:unknown[]=[];let staffDefaultPermissions:string[]=[];
 if(profile.role==='admin'){
   const result=await allRows('account_invitations','user_id,delivery_status,send_attempts,last_sent_at,last_error');
   // Older installations remain usable while the additive migration is being applied.
   if(result.error && !['42P01','PGRST205'].includes(result.error.code))throw result.error;
   invitations=result.data||[];
   const settings=await client.from('app_settings').select('value').eq('key','staff_default_permissions').maybeSingle();
   if(settings.error)throw settings.error;
   staffDefaultPermissions=Array.isArray(settings.data?.value)?settings.data.value.filter((value:unknown)=>permissions.includes(value as typeof permissions[number])):[];
 }
 return NextResponse.json({mode:'live',profile,profiles,children,assignments,entries,audits,invitations,staffDefaultPermissions,capabilities:{inviteAccounts:accountProvisioningConfigured()&&'requires_password_setup' in profile},grants:Object.fromEntries(grants.map(g=>[String(g.user_id),g]))},{headers:{'Cache-Control':'no-store'}});
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
 const {data:{user}}=await client.auth.getUser(); if(!user) return NextResponse.json({error:'Authentication required'},{status:401});
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
