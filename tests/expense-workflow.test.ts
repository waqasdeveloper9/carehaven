import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseSchema, createFinancialDraft, financialPayload } from '../lib/finance-policy';
import { workspaceError } from '../lib/api-errors';

const expense={action:'expense',request_id:'74787862-26d4-4f3b-94b3-d929388f5ccd',donor_id:'4261e829-9438-4cd8-9967-34b0ad20113a',orphan_id:'d82bd683-c8b2-437a-bff6-f3095d36ad3b',amount:150,category:'Education',description:'School supplies'};
test('missing receipts can be saved pending, and forced approval requires a meaningful justification',()=>{
 assert.equal(expenseSchema.safeParse({...expense,verification_status:'pending'}).success,true);
 assert.equal(expenseSchema.safeParse({...expense,verification_status:'forced',audit_notes:'Receipt was lost; purchase confirmed.'}).success,true);
 assert.equal(expenseSchema.safeParse({...expense,verification_status:'forced',audit_notes:'          '}).success,false);
 assert.equal(expenseSchema.safeParse({...expense,verification_status:'verified'}).success,false);
 assert.equal(expenseSchema.safeParse({...expense,verification_status:'verified',receipt_url:'owner/receipt.webp'}).success,true);
});
test('transaction draft retains the submitted values and retry ID when moving through receipt review',()=>{
 const draft={...createFinancialDraft(),donor_id:expense.donor_id,orphan_id:expense.orphan_id,amount:'150.00',category:expense.category,description:expense.description,audit_notes:'Receipt was lost; purchase confirmed.'};
 const before=structuredClone(draft);
 const pending={...financialPayload('expense',draft,expense.request_id),verification_status:'pending'};
 const forced={...financialPayload('expense',draft,expense.request_id),verification_status:'forced',audit_notes:draft.audit_notes};
 assert.deepEqual(draft,before);
 assert.equal(pending.request_id,forced.request_id);
 assert.equal(pending.donor_id,expense.donor_id);
 assert.equal(pending.amount,150);
 assert.equal(expenseSchema.safeParse(pending).success,true);
 assert.equal(expenseSchema.safeParse(forced).success,true);
});
test('plain database errors preserve actionable expense failures instead of returning Operation failed',()=>{
 assert.match(workspaceError({code:'P0001',message:'Active sponsorship required'}).message,/Assign this sponsor/);
 assert.match(workspaceError({code:'P0001',message:'Insufficient allocated funds'}).message,/enough allocated funds/);
 assert.match(workspaceError({code:'P0001',message:'Monthly cap exceeded'}).message,/monthly spending limit/);
 assert.equal(workspaceError({code:'42501',message:'permission denied for table financial_ledger'}).status,403);
 assert.match(workspaceError({code:'P0001',message:'A specific business rule failed'}).message,/specific business rule/);
 assert.doesNotMatch(workspaceError({code:'XX000',message:'internal SQL detail'}).message,/internal SQL detail/);
});
