import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.AUTH_ADMIN_EMAIL;
const appUrl = process.env.APP_URL;

async function setup() {
  if (!url || !secret || !email || !appUrl) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, AUTH_ADMIN_EMAIL, and APP_URL in your ignored .env.local file. Never put the server secret in NEXT_PUBLIC variables.');
  const origin = new URL(appUrl);
  if (origin.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(origin.hostname)) throw new Error('APP_URL must use HTTPS, except for local development.');
  const client = createClient(url, secret, { auth: {persistSession:false,autoRefreshToken:false} });
  const {data:admins,error:adminError}=await client.from('profiles').select('id,email').eq('role','admin');
  if(adminError)throw new Error('Database setup is not ready. Apply the core migration and admin bootstrap migration first.');
  if(admins.some(admin=>admin.email.toLowerCase()!==email.toLowerCase()))throw new Error('An administrator already exists. First-time setup cannot add another administrator.');
  if(!admins.length){
    const {error:probeError}=await client.rpc('bootstrap_first_admin',{p_user:null});
    if(probeError?.message!=='A confirmed authentication account is required')throw new Error('First-admin database setup is not ready. Run migrations/202610160002_admin_bootstrap.sql in the Supabase SQL Editor before creating the account.');
  }
  const {data:existing,error:profileError}=await client.from('profiles').select('id,email,role').eq('email',email).maybeSingle();
  if(profileError)throw profileError;
  let userId=existing?.id;
  if(!userId){
    // A unique random initial password is never printed or saved; the owner chooses their password through the setup link.
    const {data,error}=await client.auth.admin.createUser({email,password:crypto.randomBytes(36).toString('base64url'),email_confirm:true,user_metadata:{full_name:process.env.ADMIN_SETUP_NAME||'Administrator'}});
    if(error)throw error;
    userId=data.user.id;
  }
  if(!admins.length){
    const {error}=await client.rpc('bootstrap_first_admin',{p_user:userId});
    if(error)throw new Error('Administrator promotion failed: '+error.message+'. The account remains without administrator privileges until trusted setup succeeds.');
  }
  const {data:verified,error:verifyError}=await client.from('profiles').select('id,role,status').eq('id',userId).single();
  if(verifyError||verified.role!=='admin'||verified.status!=='approved')throw new Error('Administrator status could not be verified.');
  const {data:link,error:linkError}=await client.auth.admin.generateLink({type:'recovery',email});
  if(linkError)throw linkError;
  const setupUrl=new URL('/reset-password',origin.origin);
  setupUrl.searchParams.set('token_hash',link.properties.hashed_token);
  const folder=path.resolve('.tmp-tests');fs.mkdirSync(folder,{recursive:true});
  const destination=path.join(folder,'first-admin-setup-link.txt');
  fs.writeFileSync(destination,`Private one-time administrator password setup link\n\n${setupUrl}\n\nOpen this link privately and choose your password. The link expires according to your Supabase recovery-token settings. Do not share or commit this file.\n`,{mode:0o600});
  console.log('Verified approved administrator: '+email);
  console.log('A private password setup link was saved to: '+destination);
  console.log('The initial random password was not printed or stored. No email was sent.');
}
setup().catch(error=>{console.error(error.message);process.exitCode=1;});
