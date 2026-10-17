import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { isSameOriginRequest } from '@/lib/request-security';
import { workspaceError } from '@/lib/api-errors';

const avatarSchema=z.object({avatar_path:z.string().trim().min(1).max(500).nullable()}).strict();
export async function POST(request:Request){
 if(!isSameOriginRequest(request))return NextResponse.json({error:'Invalid origin'},{status:403});
 try{
  const body=avatarSchema.parse(await request.json());const client=await supabase();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return NextResponse.json({error:'Please sign in again.'},{status:401});
  const result=await client.rpc('set_profile_avatar',{p_path:body.avatar_path});
  if(result.error)throw result.error;
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const failure=workspaceError(error);return NextResponse.json({error:failure.message},{status:failure.status});}
}
