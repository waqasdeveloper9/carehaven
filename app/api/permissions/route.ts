import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { isSameOriginRequest } from '@/lib/request-security';
import { permissionBatchSchema, permissionBatchLimit } from '@/lib/permission-changes';
import { workspaceError } from '@/lib/api-errors';
import { permissions } from '@/lib/config';

export async function GET(request:Request){
 try{
  const ids=z.array(z.uuid()).min(1).max(permissionBatchLimit).parse((new URL(request.url).searchParams.get('ids')||'').split(','));
  const client=await supabase();const {data,error}=await client.auth.getClaims();
  if(error||!data)return NextResponse.json({error:'Please sign in again.'},{status:401});
  const allowed=await client.rpc('is_admin');
  if(allowed.error)throw allowed.error;
  if(!allowed.data)return NextResponse.json({error:'Administrator access required.'},{status:403});
  const result=await client.from('user_permissions').select('*').in('user_id',ids);
  if(result.error)throw result.error;
  const grants=Object.fromEntries(ids.map(id=>[id,Object.fromEntries(permissions.map(permission=>[permission,false]))]));
  for(const row of result.data)grants[row.user_id]=row;
  return NextResponse.json({grants},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const failure=workspaceError(error);return NextResponse.json({error:failure.message},{status:failure.status});}
}

export async function POST(request:Request){
 if(!isSameOriginRequest(request))return NextResponse.json({error:'Invalid origin'},{status:403});
 const started=performance.now();
 try{
  const {changes}=permissionBatchSchema.parse(await request.json());
  const client=await supabase();
  const {data,error}=await client.auth.getClaims();
  if(error||!data)return NextResponse.json({error:'Please sign in again.'},{status:401});
  // The RPC checks the administrator's current database role and applies the entire batch atomically.
  const result=await client.rpc('set_permissions_batch',{p_changes:changes});
  if(result.error){
   if(result.error.message.includes('changed since you opened'))return NextResponse.json({error:'Permissions changed since you opened this editor. Your selections are kept. Reload the current permissions and review them before saving again.',conflict:true},{status:409});
   if(['PGRST202','42883'].includes(result.error.code))return NextResponse.json({error:'Batch permission saves need database migration 202610170005. Your selections are kept; ask your administrator to apply it.'},{status:503});
   throw result.error;
  }
  return NextResponse.json({ok:true,grants:result.data},{headers:{'Cache-Control':'no-store','Server-Timing':`permissions;dur=${(performance.now()-started).toFixed(1)}`}});
 }catch(error){const failure=workspaceError(error);return NextResponse.json({error:failure.message},{status:failure.status});}
}
