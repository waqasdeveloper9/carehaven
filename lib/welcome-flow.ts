import { hasRecentWelcomeProof } from './auth-policy';
import type { Profile } from './types';
import { sessionAuthenticatedSince } from './account-actions';

type WelcomeIdentity={id:string;email:string;claims:{amr?:unknown}};
export type WelcomeDependencies={
 verifyToken:(hash:string,type:'email'|'recovery')=>Promise<void>;
 identity:()=>Promise<WelcomeIdentity|null>;
 profile:(id:string)=>Promise<Profile|null>;
 savePassword:(password:string)=>Promise<void>;
 signOut:(scope:'local'|'global')=>Promise<void>;
 signIn:(email:string,password:string)=>Promise<boolean>;
};
export async function completeWelcomeSetup(input:{token_hash?:string;proof_type:'email'|'recovery';password:string},auth:WelcomeDependencies){
 if(input.token_hash)await auth.verifyToken(input.token_hash,input.proof_type);
 const identity=await auth.identity();
 if(!identity||!hasRecentWelcomeProof(identity.claims)){
  await auth.signOut('local');
  throw new Error('Your welcome link is invalid or expired. Ask your administrator for a new welcome email.');
 }
 const profile=await auth.profile(identity.id);
 if(profile&&!sessionAuthenticatedSince(identity.claims,profile.password_auth_after)){
  await auth.signOut('local');throw new Error('Request a new welcome or recovery link after the administrator password reset.');
 }
 if(!profile||profile.id!==identity.id||!profile.invited_at||!profile.requires_password_setup||profile.status!=='approved'||!['staff_user','donor'].includes(profile.role)){
  await auth.signOut('local');
  throw new Error('This welcome link cannot set up this account. If setup is already complete, sign in with your password.');
 }
 try{await auth.savePassword(input.password);}catch{
  await auth.signOut('local');
  throw new Error('Your password could not be saved. Request a new welcome link and choose a different password.');
 }
 // Revoke the email-link session, then authenticate using the owner's email and chosen password.
 try{await auth.signOut('global');}catch{
  await auth.signOut('local');
  return {ok:true,signedIn:false,redirect:'/login',message:'Your password is saved. Please sign in with your email and new password.'};
 }
 let signedIn=false;
 try{signedIn=await auth.signIn(identity.email,input.password);}catch{signedIn=false;}
 if(!signedIn){
  await auth.signOut('local');
  return {ok:true,signedIn:false,redirect:'/login',message:'Your password is saved. Please sign in with your email and new password.'};
 }
 return {ok:true,signedIn:true,redirect:'/',message:'Your account is ready. Welcome to your workspace.'};
}
