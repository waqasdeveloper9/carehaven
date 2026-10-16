import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { demoWorkspace } from '@/lib/demo';
import { permissions, categories, config } from '@/lib/config';
import { z } from 'zod';
import { isSameOriginRequest } from '@/lib/request-security';
const demo = () => process.env.APP_MODE === 'demo' || (process.env.NODE_ENV !== 'production' && !process.env.APP_MODE && !config.supabaseUrl);
export async function GET() {
 if(demo()) return NextResponse.json(demoWorkspace());
 try {
 const client = await supabase(); const {data:{user}} = await client.auth.getUser();
 if(!user) return NextResponse.json({error:'Please sign in.'},{status:401});
 const {data:profile,error} = await client.from('profiles').select('*').eq('id',user.id).single(); if(error) throw error;
 if(profile.status !== 'approved') return NextResponse.json({pending:true,profile},{status:403});
 const results = await Promise.all(['profiles','orphans','donor_child_assignments','financial_ledger','audit_logs','user_permissions'].map(t=>client.from(t).select('*')));
 for(const r of results) if(r.error) throw r.error;
 const [profiles,children,assignments,entries,audits,grants] = results.map(r=>r.data || []);
 return NextResponse.json({mode:'live',profile,profiles,children,assignments,entries,audits,grants:Object.fromEntries(grants.map(g=>[g.user_id,g]))},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load workspace.'},{status:503});}
}
const id = z.uuid(); const amount = z.number().positive().max(9999999999.99).refine(n=>Math.round(n*100)/100===n,'Use no more than two decimal places.');
const actionSchema = z.discriminatedUnion('action',[
 z.object({action:z.literal('child'),full_name:z.string().trim().min(2).max(100),date_of_birth:z.iso.date(),gender:z.enum(['Male','Female','Other'])}),
 z.object({action:z.literal('status'),id,status:z.enum(['active','inactive','graduated','left'])}),
 z.object({action:z.literal('approval'),id,status:z.enum(['approved','rejected'])}),
 z.object({action:z.literal('permission'),id,permission:z.enum(permissions),enabled:z.boolean()}),
 z.object({action:z.literal('assignment'),donor_id:id,orphan_id:id,monthly_spending_limit:amount,amount}),
 z.object({action:z.literal('donation'),donor_id:id,amount,description:z.string().trim().min(2).max(500),request_id:id}),
 z.object({action:z.literal('expense'),donor_id:id,orphan_id:id,amount,category:z.enum(categories),description:z.string().trim().min(2).max(500),verification_status:z.enum(['verified','pending','forced']),audit_notes:z.string().max(2000).optional(),receipt_url:z.string().max(500).optional(),request_id:id}),
]);
export async function POST(request: Request) {
 if(!isSameOriginRequest(request)) return NextResponse.json({error:'Invalid origin'},{status:403});
 if(demo()) return NextResponse.json({error:'Demo changes are stored in this browser only.'},{status:400});
 try {
 const body = actionSchema.parse(await request.json()); const client=await supabase();
 const {data:{user}}=await client.auth.getUser(); if(!user) return NextResponse.json({error:'Authentication required'},{status:401});
 let result;
 switch(body.action){
 case 'child': result=await client.from('orphans').insert({full_name:body.full_name,date_of_birth:body.date_of_birth,gender:body.gender});break;
 case 'status': result=await client.from('orphans').update({status:body.status}).eq('id',body.id);break;
 case 'approval': result=await client.rpc('set_donor_status',{p_id:body.id,p_status:body.status});break;
 case 'permission': result=await client.rpc('set_permission',{p_user:body.id,p_permission:body.permission,p_enabled:body.enabled});break;
 case 'assignment': result=await client.rpc('allocate_sponsorship',{p_donor:body.donor_id,p_child:body.orphan_id,p_limit:body.monthly_spending_limit,p_amount:body.amount});break;
 case 'donation': result=await client.rpc('post_donation',{p_donor:body.donor_id,p_amount:body.amount,p_description:body.description,p_request:body.request_id});break;
 case 'expense': result=await client.rpc('post_expense',{p_donor:body.donor_id,p_child:body.orphan_id,p_amount:body.amount,p_category:body.category,p_description:body.description,p_verification:body.verification_status,p_notes:body.audit_notes||null,p_receipt:body.receipt_url||null,p_request:body.request_id});break;
 }
 if(result.error) throw result.error; return NextResponse.json({ok:true});
 }catch(error){return NextResponse.json({error:error instanceof Error ? error.message : 'Operation failed.'},{status:400});}
}
