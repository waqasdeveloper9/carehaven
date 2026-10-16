import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';
export async function POST(request: Request) {
 if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Invalid origin'}, {status:403});
 try {
 const body = z.object({ action: z.enum(['login','register','logout']), email:z.email().optional(), password:z.string().min(12).max(128).optional(), full_name:z.string().min(2).max(100).optional() }).parse(await request.json());
 const client = await supabase();
 if(body.action === 'logout') { const {error} = await client.auth.signOut(); if(error) throw error; }
 else { if(!body.email || !body.password) throw new Error('Email and password are required.');
 const result = body.action === 'register' ? await client.auth.signUp({email:body.email,password:body.password,options:{data:{full_name:body.full_name},emailRedirectTo:new URL('/auth/callback',request.url).toString()}}) : await client.auth.signInWithPassword({email:body.email,password:body.password});
 if(result.error) throw result.error; }
 return NextResponse.json({ok:true});
 } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : 'Authentication failed'}, {status:400}); }
}
