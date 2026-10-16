import { z } from 'zod';
import type { Profile } from './types';

export const staffDefaults = ['manage_orphans', 'assign_donors'] as const;
export const donationAmount = z.number().positive().max(9999999999.99).refine(value => Math.round(value * 100) / 100 === value, 'Use at most two decimal places.');
export const createAccountSchema = z.object({
  action: z.literal('create'), request_id: z.uuid(), role: z.enum(['staff_user', 'donor']),
  full_name: z.string().trim().min(2).max(100), email: z.email().transform(value => value.toLowerCase()),
  phone: z.string().trim().max(40).default(''),
  donation: z.object({ amount: donationAmount, description: z.string().trim().min(2).max(500) }).optional(),
}).strict().refine(value => value.role === 'donor' || !value.donation, 'Only sponsors can have an initial donation.');
export const accountActionSchema = z.union([createAccountSchema, z.object({ action: z.literal('resend'), id: z.uuid() }).strict()]);
export type Invitation = { user_id: string; delivery_status: 'queued'|'sending'|'accepted_by_provider'|'failed'; send_attempts: number; last_sent_at: string|null; last_error: string|null };
export function onboardingStatus(profile: Profile) {
  if (profile.requires_password_setup) return 'Password setup pending';
  if (profile.password_set_at && !profile.first_login_at) return 'Password set · Never logged in';
  if (profile.first_login_at) return 'Active';
  return 'Existing account';
}
export function needsOnboardingFollowUp(profile: Profile) {
  return !!profile.invited_at && (!profile.first_login_at || !!profile.requires_password_setup);
}
