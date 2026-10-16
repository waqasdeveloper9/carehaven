import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authActionSchema, resolveLogin, passwordPolicy,hasRecentRecovery } from '../lib/auth-policy';

test('administrator alias resolves only when explicitly configured',()=>{
  assert.equal(resolveLogin('admin'),null);
  assert.equal(resolveLogin('ADMIN','admin','owner@example.test'),'owner@example.test');
  assert.equal(resolveLogin('another-user','admin','owner@example.test'),null);
  assert.equal(resolveLogin('donor@example.test','admin','owner@example.test'),'donor@example.test');
});
test('login accepts existing passwords without applying new-password policy',()=>{
  assert.equal(authActionSchema.safeParse({action:'login',identifier:'admin',password:'existing'}).success,true);
  assert.equal(authActionSchema.safeParse({action:'register',email:'owner@example.test',full_name:'Administrator',password:'admin'}).success,false);
});
test('password changes require the current password and matching new passwords',()=>{
  const body={action:'change_password',current_password:'Old password phrase',password:'New password phrase',confirm_password:'New password phrase'};
  assert.equal(authActionSchema.safeParse(body).success,true);
  assert.equal(authActionSchema.safeParse({...body,current_password:''}).success,false);
  assert.equal(authActionSchema.safeParse({...body,confirm_password:'Different password phrase'}).success,false);
  assert.equal(authActionSchema.safeParse({...body,current_password:body.password}).success,false);
});
test('password resets require a recovery token, a strong password, and confirmation',()=>{
  const body={action:'reset_password',token_hash:'valid-recovery-token',password:'A fresh password phrase',confirm_password:'A fresh password phrase'};
  assert.equal(authActionSchema.safeParse(body).success,true);
  assert.equal(authActionSchema.safeParse({...body,token_hash:undefined}).success,false);
  assert.equal(authActionSchema.safeParse({...body,password:'x'.repeat(passwordPolicy.minimumLength-1)}).success,false);
});
test('public signup cannot request administrator privileges',()=>{
  const result=authActionSchema.parse({action:'register',email:'donor@example.test',password:'A strong password phrase',full_name:'New donor',role:'admin',status:'approved'});
  assert.equal('role' in result,false);assert.equal('status' in result,false);
});
test('default email recovery codes are accepted, ambiguous recovery credentials are rejected',()=>{
  const body={action:'reset_password',code:'provider-recovery-code',password:'A fresh password phrase',confirm_password:'A fresh password phrase'};
  assert.equal(authActionSchema.safeParse(body).success,true);
  assert.equal(authActionSchema.safeParse({...body,token_hash:'a-second-token'}).success,false);
});
test('normal login sessions cannot substitute for recent password recovery',()=>{
  const now=1800000000;
  assert.equal(hasRecentRecovery({amr:[{method:'recovery',timestamp:now-10}]},now),true);
  assert.equal(hasRecentRecovery({amr:[{method:'password',timestamp:now-10}]},now),false);
  assert.equal(hasRecentRecovery({amr:[{method:'recovery',timestamp:now-7200}]},now),false);
  assert.equal(hasRecentRecovery({amr:[{method:'recovery',timestamp:now+7200}]},now),false);
  assert.equal(hasRecentRecovery({amr:[]},now),false);
});
