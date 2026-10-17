import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import type { Profile } from './types';

export async function finishRequiredPasswordChange(profile:Profile){
 if(!profile.must_change_password)return;
 if(!profile.password_reset_request_id)throw new Error('Password setup needs administrator assistance.');
 const result=await supabaseAdmin().rpc('complete_required_password_change',{p_user:profile.id,p_request:profile.password_reset_request_id});
 if(result.error)throw new Error('Your password was saved, but account setup could not finish. Sign in again or contact your administrator.');
}
