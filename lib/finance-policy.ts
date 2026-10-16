import { z } from 'zod';
import { categories } from './config';

export const financePolicy={maximumAmount:9999999999.99,minimumDescriptionLength:2,maximumDescriptionLength:500,minimumAuditNoteLength:10,maximumAuditNoteLength:2000};
export const moneySchema=z.number().positive().max(financePolicy.maximumAmount).refine(value=>Math.round(value*100)/100===value,'Use no more than two decimal places.');
export const expenseSchema=z.object({
 action:z.literal('expense'),request_id:z.uuid(),donor_id:z.uuid(),orphan_id:z.uuid(),amount:moneySchema,
 category:z.enum(categories),description:z.string().trim().min(financePolicy.minimumDescriptionLength).max(financePolicy.maximumDescriptionLength),
 verification_status:z.enum(['verified','pending','forced']),
 audit_notes:z.string().trim().max(financePolicy.maximumAuditNoteLength).optional(),
 receipt_url:z.string().max(500).optional(),
}).superRefine((expense,context)=>{
 if(expense.verification_status==='forced'&&(expense.audit_notes?.length||0)<financePolicy.minimumAuditNoteLength){
  context.addIssue({code:'custom',path:['audit_notes'],message:`Provide at least ${financePolicy.minimumAuditNoteLength} characters explaining approval without a receipt.`});
 }
 if(expense.verification_status==='verified'&&!expense.receipt_url?.trim()){
  context.addIssue({code:'custom',path:['receipt_url'],message:'Attach an uploaded receipt, or choose Pending Verification.'});
 }
});
export type FinancialEntryKind='donation'|'expense'|'assignment';
export type FinancialDraft={donor_id:string;orphan_id:string;amount:string;monthly_spending_limit:string;description:string;category:string;audit_notes:string};
export function createFinancialDraft():FinancialDraft{return {donor_id:'',orphan_id:'',amount:'',monthly_spending_limit:'',description:'',category:categories[0]||'',audit_notes:''};}
export function financialPayload(kind:FinancialEntryKind,draft:FinancialDraft,requestId:string){
 const base={action:kind,request_id:requestId,donor_id:draft.donor_id,amount:Number(draft.amount)};
 if(kind==='assignment')return {...base,orphan_id:draft.orphan_id,monthly_spending_limit:Number(draft.monthly_spending_limit)};
 if(kind==='expense')return {...base,orphan_id:draft.orphan_id,description:draft.description.trim(),category:draft.category};
 return {...base,description:draft.description.trim()};
}
