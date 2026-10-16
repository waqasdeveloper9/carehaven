import { z } from 'zod';

const businessErrors:Record<string,string>={
 'Active sponsorship required':'Assign this sponsor to the selected child before recording an expense.',
 'Insufficient allocated funds':'This sponsorship does not have enough allocated funds. Add funds before saving the expense.',
 'Monthly cap exceeded':'This expense exceeds the sponsorship’s remaining monthly spending limit.',
 'Child is not active':'Expenses require a child who is currently in active care.',
 'Active child required':'Select a child who is currently in active care.',
 'Approved donor required':'Select an approved sponsor.',
 'Insufficient unallocated donor funds':'The sponsor does not have enough unallocated funds for this sponsorship.',
 'An uploaded receipt owned by the submitting user is required':'Upload a receipt from your account, or save this expense as Pending Verification.',
 'Audit justification required':'Explain why this expense is approved without a receipt.',
 'Idempotency key reused with different data':'This submission was already saved with different details. Check the ledger before creating another expense.',
 'Permission denied':'You do not have permission to perform this action.',
 'Administrator access required':'Administrator access is required for this action.',
};
export function workspaceError(error:unknown){
 if(error instanceof z.ZodError)return {status:400,message:error.issues.map(issue=>`${issue.path.join(' ').replaceAll('_',' ')}: ${issue.message}`).slice(0,3).join(' ')};
 const object=typeof error==='object'&&error!==null?error as {code?:unknown;message?:unknown}:{};
 const code=typeof object.code==='string'?object.code:'';
 const message=typeof object.message==='string'?object.message.trim():'';
 if(code==='42501'||message==='Permission denied'||message==='Administrator access required')return {status:403,message:businessErrors[message]||'You do not have permission to perform this action.'};
 if(businessErrors[message])return {status:400,message:businessErrors[message]};
 if(code==='PGRST202')return {status:503,message:'The database operation is unavailable. Contact your administrator to check the database setup.'};
 if(code==='23503')return {status:400,message:'A selected record is no longer available. Reload the workspace and try again.'};
 if(code==='23514')return {status:400,message:'The submitted values do not meet the ledger validation rules. Check the amount and verification details.'};
 if(code==='P0001'&&message)return {status:400,message:message.slice(0,300)};
 if(error instanceof TypeError)return {status:503,message:'Could not reach the service. Your form has been kept so you can retry.'};
 if(error instanceof Error&&message)return {status:400,message:message.slice(0,300)};
 return {status:500,message:'The operation could not be completed. Your form has been kept. Please try again.'};
}
