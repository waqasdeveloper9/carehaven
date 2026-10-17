import { z } from 'zod';
import { passwordSchema, passwordPolicy } from './auth-policy';

export const editAccountSchema=z.object({action:z.literal('edit'),id:z.uuid(),full_name:z.string().trim().min(2).max(100),phone:z.string().trim().max(40)}).strict();
export const adminResetSchema=z.object({action:z.literal('reset_password'),id:z.uuid(),request_id:z.uuid(),password:passwordSchema,confirm_password:z.string(),confirmed:z.literal(true)}).strict().refine(value=>value.password===value.confirm_password,{path:['confirm_password'],message:'The passwords do not match.'});
export const accountMaintenanceSchema=z.union([editAccountSchema,adminResetSchema]);
export const temporaryPasswordLength=Math.max(passwordPolicy.minimumLength,24);
export function generateTemporaryPassword(random:Pick<Crypto,'getRandomValues'>=crypto){
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
 const limit=256-256%alphabet.length;let password='';
 while(password.length<temporaryPasswordLength){const bytes=random.getRandomValues(new Uint8Array(32));for(const byte of bytes)if(byte<limit&&password.length<temporaryPasswordLength)password+=alphabet[byte%alphabet.length];}
 return password;
}
export function sessionAuthenticatedSince(claims:{amr?:unknown},minimum:number|undefined){
 if(!minimum)return true;
 return Array.isArray(claims.amr)&&claims.amr.some(value=>value&&typeof value==='object'&&typeof value.timestamp==='number'&&value.timestamp>=minimum&&['password','otp','magiclink','recovery','totp'].includes(value.method));
}
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function passwordUpdatedEmail(input:{name:string;application:string;email:string;password:string;loginUrl:string}){
 const name=escapeHtml(input.name),application=escapeHtml(input.application),password=escapeHtml(input.password),email=escapeHtml(input.email),url=escapeHtml(input.loginUrl);
 return {subject:`Your ${input.application} password has been updated`,text:`Hello ${input.name},\n\nYour administrator updated your ${input.application} password.\nYour new temporary password is: ${input.password}\nSign-in email: ${input.email}\nSign in: ${input.loginUrl}\n\nYou must change this temporary password before accessing your workspace. If this was unexpected, contact your administrator.`,html:`<!doctype html><html><body style="margin:0;background:#f2f8f4;font-family:Arial,sans-serif;color:#242647"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" style="max-width:100%;background:#fff;border-radius:20px" cellpadding="28"><tr><td><p style="color:#20876b;font-size:22px;font-weight:bold">${application}</p><h1 style="font-size:25px">Your password has been updated</h1><p>Hello ${name},</p><p>Your administrator updated your password. Your new temporary password is:</p><p style="padding:18px;background:#eef8f2;border-radius:10px;font-family:monospace;font-size:20px;word-break:break-all">${password}</p><p>Sign-in email: <strong>${email}</strong></p><p>You must choose a different password before accessing your workspace.</p><p style="padding:16px 0"><a href="${url}" style="background:#20876b;color:white;text-decoration:none;padding:14px 22px;border-radius:9px;display:inline-block">Sign in and change password</a></p><p style="font-size:13px;color:#6b7685">If this change was unexpected, contact your administrator. Keep this temporary password private.</p></td></tr></table></td></tr></table></body></html>`};
}
