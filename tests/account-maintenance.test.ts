import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { accountMaintenanceSchema, generateTemporaryPassword, passwordUpdatedEmail, sessionAuthenticatedSince } from '../lib/account-actions';
import { runAdminPasswordReset } from '../lib/admin-password-reset';

test('admin reset requires matching strong passwords and explicit confirmation; edits cannot change identity or role',()=>{
 const body={action:'reset_password',id:randomUUID(),request_id:randomUUID(),password:'Fictional-temp-password!',confirm_password:'Fictional-temp-password!',confirmed:true};
 assert.equal(accountMaintenanceSchema.safeParse(body).success,true);
 for(const patch of [{confirm_password:'different'},{confirmed:false},{password:'short',confirm_password:'short'},{email:'different@example.test'}])assert.equal(accountMaintenanceSchema.safeParse({...body,...patch}).success,false);
 assert.equal(accountMaintenanceSchema.safeParse({action:'edit',id:body.id,full_name:'Edited Name',phone:'',role:'admin'}).success,false);
});
test('generated passwords use browser cryptography and messages escape HTML without password metadata',()=>{
 const passwords=new Set(Array.from({length:30},()=>generateTemporaryPassword(webcrypto as unknown as Crypto)));
 assert.equal(passwords.size,30);assert.ok([...passwords].every(password=>password.length>=24));
 const email=passwordUpdatedEmail({name:'<Someone>',application:'CareHaven',email:'owner@example.test',password:'Fictional<&>password',loginUrl:'https://example.test/login'});
 assert.ok(email.html.includes('&lt;Someone&gt;'));assert.ok(email.html.includes('Fictional&lt;&amp;&gt;password'));assert.ok(email.text.includes('must change'));
 assert.equal(sessionAuthenticatedSince({amr:[{method:'password',timestamp:10}]},20),false);assert.equal(sessionAuthenticatedSince({amr:[{method:'password',timestamp:20}]},20),true);
});
test('retrying failed email does not reset the password again and provider failure is reported honestly',async()=>{
 let updates=0;const result=await runAdminPasswordReset({begin:async()=>({phase:'password_set',email_status:'failed'}),update:async()=>{updates++;},inspect:async()=>({phase:'password_set',email_status:'failed'}),fail:async()=>{},send:async()=>{throw new Error('Provider unavailable');},record:async accepted=>assert.equal(accepted,false)});
 assert.equal(updates,0);assert.equal(result.reset,true);assert.equal(result.emailAccepted,false);
});
test('ambiguous Auth response is reconciled; inactive reset cannot send stale credentials',async()=>{
 let sent=0;const deps={begin:async()=>({phase:'claimed',email_status:'queued'}),update:async()=>{throw new Error('Lost response');},inspect:async()=>({phase:'password_set',email_status:'queued'}),fail:async()=>{throw new Error('Should not fail a committed reset');},send:async()=>{sent++;},record:async()=>{}};
 assert.equal((await runAdminPasswordReset(deps)).emailAccepted,true);assert.equal(sent,1);
 await assert.rejects(runAdminPasswordReset({...deps,begin:async()=>({phase:'completed',email_status:'accepted_by_provider'})}),/no longer active/);assert.equal(sent,1);
});
