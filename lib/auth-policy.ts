import { z } from 'zod';

export const passwordPolicy = { minimumLength: 12, maximumLength: 128 };
export const passwordSchema = z.string().min(passwordPolicy.minimumLength, 'Use at least 12 characters.').max(passwordPolicy.maximumLength);
export const recoveryPolicy = { maximumAgeSeconds: 3600, futureClockSkewSeconds: 60 };
const confirmation = { password: passwordSchema, confirm_password: z.string() };
export const authActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }),
  z.object({ action: z.literal('register'), email: z.email(), password: passwordSchema, full_name: z.string().trim().min(2).max(100) }),
  z.object({ action: z.literal('logout') }),
  z.object({ action: z.literal('forgot_password'), email: z.email() }),
  z.object({ action: z.literal('change_password'), current_password: z.string().min(1).max(128), ...confirmation }),
  z.object({ action: z.literal('setup_password'), token_hash: z.string().min(1).max(1024).optional(), session_setup: z.literal(true).optional(), proof_type: z.enum(['email','recovery']).default('email'), ...confirmation }),
  z.object({ action: z.literal('reset_password'), token_hash: z.string().min(1).max(1024).optional(), code: z.string().min(1).max(2048).optional(), session_recovery: z.literal(true).optional(), ...confirmation }),
]).superRefine((value, context) => {
  if ((value.action === 'change_password' || value.action === 'reset_password' || value.action === 'setup_password') && value.password !== value.confirm_password) {
    context.addIssue({ code: 'custom', path: ['confirm_password'], message: 'The passwords do not match.' });
  }
  if (value.action === 'change_password' && value.password === value.current_password) {
    context.addIssue({ code: 'custom', path: ['password'], message: 'Choose a different password from your current password.' });
  }
  if (value.action === 'reset_password' && [value.token_hash,value.code,value.session_recovery].filter(Boolean).length !== 1) {
    context.addIssue({ code: 'custom', path: ['token_hash'], message: 'A valid password recovery link is required.' });
  }
  if(value.action==='setup_password' && [value.token_hash,value.session_setup].filter(Boolean).length!==1){
    context.addIssue({code:'custom',path:['token_hash'],message:'A valid welcome link is required.'});
  }
});

export function hasRecentRecovery(claims: {amr?:unknown}, now = Math.floor(Date.now()/1000)) {
  return hasRecentMethod(claims,['recovery'],now);
}

export function hasRecentWelcomeProof(claims:{amr?:unknown},now=Math.floor(Date.now()/1000)){
  // Recovery supports welcome links sent before invitations were separated from password resets.
  return hasRecentMethod(claims,['otp','magiclink','recovery'],now);
}
function hasRecentMethod(claims:{amr?:unknown},methods:readonly string[],now:number){
  return Array.isArray(claims.amr)&&claims.amr.some(item=>item&&typeof item==='object'&&methods.includes(item.method)&&typeof item.timestamp==='number'&&Number.isFinite(item.timestamp)&&item.timestamp>=now-recoveryPolicy.maximumAgeSeconds&&item.timestamp<=now+recoveryPolicy.futureClockSkewSeconds);
}

export function resolveLogin(identifier: string, alias?: string, adminEmail?: string) {
  if (alias && adminEmail && identifier.toLowerCase() === alias.toLowerCase()) return adminEmail;
  return z.email().safeParse(identifier).success ? identifier : null;
}

export const recoveryMessage = 'If an account exists for that email, you will receive a password reset link. Check your inbox and spam folder.';
