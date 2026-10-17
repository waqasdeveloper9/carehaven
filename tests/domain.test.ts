import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cents, can, validateExpense, scopeDemo } from '../lib/domain';
import { demoWorkspace } from '../lib/demo';
test('permissions require approval and staff grants',()=>{const d=demoWorkspace();assert.equal(can(d,'manage_financials'),true);d.profile=d.profiles.find(p=>p.id==='demo-staff')!;assert.equal(can(d,'manage_orphans'),true);assert.equal(can(d,'manage_financials'),false);d.profile.status='pending';assert.equal(can(d,'manage_orphans'),false);});
test('money rejects negative, zero, non-finite and fractional cents',()=>{for(const n of [-1,0,NaN,Infinity,0.001])assert.throws(()=>cents(n));assert.equal(cents(0.29),29);assert.equal(cents(1.01),101);});
test('expense enforces sponsorship, active child, allocation and monthly cap',()=>{const d=demoWorkspace();assert.equal(validateExpense(d,'demo-donor','child-1',1).id,'assignment-1');assert.throws(()=>validateExpense(d,'demo-donor','child-3',1),/sponsorship/);assert.throws(()=>validateExpense(d,'demo-donor','child-4',1),/active child/);assert.throws(()=>validateExpense(d,'demo-donor','child-1',22001),/allocated/);assert.throws(()=>validateExpense(d,'demo-donor','child-1',15001),/monthly/);});
test('monthly caps include pending and forced expenses',()=>{const d=demoWorkspace();d.entries=d.entries.filter(e=>e.type==='DONATION_RECEIVED');d.entries.push({id:'pending',donor_id:'demo-donor',orphan_id:'child-1',type:'EXPENSE_SPENT',category:'Education',amount_in:0,amount_out:14999,description:'Pending expense',verification_status:'pending',created_at:new Date().toISOString()});assert.throws(()=>validateExpense(d,'demo-donor','child-1',2),/monthly/);assert.doesNotThrow(()=>validateExpense(d,'demo-donor','child-1',1));});
test('donor preview excludes unrelated children and other users',()=>{const d=demoWorkspace();d.profile=d.profiles.find(p=>p.role==='donor'&&p.status==='approved')!;const scoped=scopeDemo(d);assert.equal(scoped.children.length,2);assert.equal(scoped.profiles.length,1);assert.equal(scoped.audits.length,0);assert.ok(scoped.entries.every(e=>e.donor_id===d.profile.id));assert.equal(d.children.length,4);});
test('staff preview does not expose financial data without grants',()=>{const d=demoWorkspace();d.profile=d.profiles.find(p=>p.role==='staff_user')!;const scoped=scopeDemo(d);assert.equal(scoped.entries.length,0);assert.equal(scoped.assignments.length,0);assert.equal(scoped.audits.length,0);assert.equal(scoped.children.length,4);});

test('sponsor organization access requires an explicit grant and remains gated by setup',()=>{
 const data=demoWorkspace();data.profile=data.profiles.find(profile=>profile.id==='demo-donor')!;
 assert.equal(can(data,'manage_orphans'),false);
 data.grants[data.profile.id]={manage_orphans:true,assign_donors:false,view_financials:false,manage_financials:false,approve_donors:false,run_audits:false};
 assert.equal(can(data,'manage_orphans'),true);assert.equal(scopeDemo(data).children.length,4);
 assert.equal(scopeDemo(data).profiles.length,1,'child management does not disclose other account profiles');
 data.profile.requires_password_setup=true;assert.equal(can(data,'manage_orphans'),false);
});
