import test from 'node:test';
import assert from 'node:assert/strict';
import { completeWelcomeSetup, type WelcomeDependencies } from '../lib/welcome-flow';
import { authActionSchema, hasRecentWelcomeProof } from '../lib/auth-policy';
import type { Profile } from '../lib/types';
import { readFile } from 'node:fs/promises';

const input={token_hash:'personal-welcome-token',proof_type:'email' as const,password:'My private welcome passphrase'};
function fixture(overrides:Partial<WelcomeDependencies>={}){
 const calls:string[]=[];
 const profile:Profile={id:'invited-user',full_name:'An Invited Sponsor',email:'sponsor@example.test',role:'donor',status:'approved',requires_password_setup:true,invited_at:'2026-10-17'};
 const auth:WelcomeDependencies={
  verifyToken:async(hash,type)=>{assert.equal(hash,input.token_hash);assert.equal(type,'email');calls.push('verify');},
  identity:async()=>({id:profile.id,email:profile.email,claims:{amr:[{method:'otp',timestamp:Math.floor(Date.now()/1000)}]}}),
  profile:async()=>profile,
  savePassword:async password=>{assert.equal(password,input.password);calls.push('save');},
  signOut:async scope=>{calls.push(`signout:${scope}`);},
  signIn:async(email,password)=>{assert.equal(email,profile.email);assert.equal(password,input.password);calls.push('signin:password');return true;},
  ...overrides,
 };
 return {auth,calls,profile};
}
test('welcome verifies the invitation, saves the password, then signs in with the verified email and chosen password',async()=>{
 const {auth,calls}=fixture();const result=await completeWelcomeSetup(input,auth);
 assert.deepEqual(calls,['verify','save','signout:global','signin:password']);
 assert.equal(result.signedIn,true);assert.equal(result.redirect,'/');
});
test('ordinary password sessions cannot complete welcome setup',async()=>{
 const {auth,calls}=fixture({identity:async()=>({id:'invited-user',email:'sponsor@example.test',claims:{amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]}})});
 await assert.rejects(completeWelcomeSetup(input,auth),/invalid or expired/);
 assert.ok(!calls.includes('save'));assert.ok(!calls.includes('signin:password'));
});
test('welcome cannot change an already-activated account or create a new administrator',async()=>{
 for(const changes of [{requires_password_setup:false},{role:'admin' as const},{status:'rejected' as const},{invited_at:null}]){
  const f=fixture();Object.assign(f.profile,changes);
  await assert.rejects(completeWelcomeSetup(input,f.auth),/cannot set up/);assert.ok(!f.calls.includes('save'));
 }
});
test('expired or invalid invitation proof never reaches a password update',async()=>{
 const f=fixture({verifyToken:async()=>{throw new Error('Expired welcome token');}});
 await assert.rejects(completeWelcomeSetup(input,f.auth),/Expired/);assert.deepEqual(f.calls,[]);
 const now=Math.floor(Date.now()/1000);
 assert.equal(hasRecentWelcomeProof({amr:[{method:'otp',timestamp:now-7200}]}),false);
 assert.equal(hasRecentWelcomeProof({amr:[{method:'magiclink',timestamp:now}]}),true);
});
test('password save failure cannot report success or sign the user in',async()=>{
 const f=fixture({savePassword:async()=>{throw new Error('Provider rejected password');}});
 await assert.rejects(completeWelcomeSetup(input,f.auth),/could not be saved/);assert.ok(!f.calls.includes('signin:password'));
});
test('sign-in failure after password setup provides a safe manual-login fallback',async()=>{
 for(const signIn of [async()=>false,async()=>{throw new Error('Temporary network error');}]){
  const f=fixture({signIn});const result=await completeWelcomeSetup(input,f.auth);
  assert.equal(result.signedIn,false);assert.equal(result.redirect,'/login');assert.match(result.message,/password is saved/);
 }
});
test('welcome input requires one proof, strong password, and matching confirmation',()=>{
 const body={action:'setup_password',...input,confirm_password:input.password};
 assert.equal(authActionSchema.safeParse(body).success,true);
 assert.equal(authActionSchema.safeParse({...body,token_hash:undefined}).success,false);
 assert.equal(authActionSchema.safeParse({...body,session_setup:true}).success,false);
 assert.equal(authActionSchema.safeParse({...body,confirm_password:'different'}).success,false);
 assert.equal(authActionSchema.safeParse({...body,password:'admin',confirm_password:'admin'}).success,false);
});
test('welcome email is branded and personalized, with a setup link and no password-reset wording',async()=>{
 const template=await readFile(new URL('../supabase/email-templates/welcome.html',import.meta.url),'utf8');
 assert.match(template,/\.Data\.full_name/);assert.match(template,/\.Data\.application_name/);
 assert.match(template,/\.RedirectTo.*\.TokenHash/);assert.match(template,/Set up my account/);
 assert.doesNotMatch(template,/reset (your )?password/i);
 assert.doesNotMatch(template,/<script|<iframe|javascript:/i);
});
