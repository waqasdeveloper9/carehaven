import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { supabase } from '@/lib/supabase';
export async function GET(request:Request){
 try{const url=new URL(request.url);const path=url.searchParams.get('path');const kind=url.searchParams.get('kind');if(!path||!['receipt','photo'].includes(kind||''))return NextResponse.json({error:'Invalid file request'},{status:400});
 const client=await supabase();const {data:{user}}=await client.auth.getUser();if(!user)return NextResponse.json({error:'Authentication required'},{status:401});
 const {data,error}=await client.storage.from(kind==='receipt'?config.receiptBucket:config.photoBucket).createSignedUrl(path,60);if(error)throw error;
 return NextResponse.redirect(data.signedUrl,{status:307,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'File unavailable or access denied.'},{status:403});}
}
