import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSchema, needsOnboardingFollowUp, onboardingStatus } from '../lib/onboarding';
import { validatePhoto } from '../lib/uploads';
import type { Profile } from '../lib/types';

const input={action:'create',request_id:'b58b3f74-367d-4eb1-8854-aa558b3cdcda',role:'donor',full_name:'A Sponsor',email:'owner@example.test'};
test('account validation rejects privilege injection and invalid donations',()=>{
 assert.equal(createAccountSchema.safeParse({...input,role:'admin'}).success,false);
 assert.equal(createAccountSchema.safeParse({...input,permissions:{manage_financials:true}}).success,false);
 assert.equal(createAccountSchema.safeParse({...input,donation:{amount:1.001,description:'A gift'}}).success,false);
 assert.equal(createAccountSchema.safeParse({...input,role:'staff_user',donation:{amount:100,description:'A gift'}}).success,false);
 assert.equal(createAccountSchema.safeParse({...input,donation:{amount:100,description:'A gift'}}).success,true);
});
test('onboarding distinguishes setup from first login',()=>{
 const profile={id:'a',full_name:'A Sponsor',email:'a@example.test',role:'donor',status:'approved',invited_at:'2026-10-16',requires_password_setup:true} satisfies Profile;
 assert.equal(onboardingStatus(profile),'Password setup pending');
 assert.equal(needsOnboardingFollowUp(profile),true);
 const set={...profile,requires_password_setup:false,password_set_at:'2026-10-16'};
 assert.equal(onboardingStatus(set),'Password set · Never logged in');
 assert.equal(needsOnboardingFollowUp(set),true);
 assert.equal(needsOnboardingFollowUp({...set,first_login_at:'2026-10-16'}),false);
});
test('child photos reject executable formats and oversized files',()=>{
 assert.throws(()=>validatePhoto({type:'image/svg+xml',size:100}));
 assert.throws(()=>validatePhoto({type:'image/jpeg',size:1024*1024*1024}));
 assert.doesNotThrow(()=>validatePhoto({type:'image/webp',size:1024}));
});
