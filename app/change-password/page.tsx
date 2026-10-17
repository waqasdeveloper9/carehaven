import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { RequiredPasswordChange } from '@/components/auth-gate';

export default async function ChangePasswordPage(){
 const client=await supabase();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login');
 const profile=await client.from('profiles').select('must_change_password').eq('id',user.id).single();
 if(profile.error||!profile.data.must_change_password)redirect('/');
 return <RequiredPasswordChange/>;
}
