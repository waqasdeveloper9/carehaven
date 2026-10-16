import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
export async function GET(request: Request) { const url = new URL(request.url); const code = url.searchParams.get('code'); if(code) { const client = await supabase(); const {error} = await client.auth.exchangeCodeForSession(code); if(!error) return NextResponse.redirect(new URL('/',url)); } return NextResponse.redirect(new URL('/?auth_error=confirmation_failed',url)); }
