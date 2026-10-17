import type { Workspace, Profile } from './types';
import { config, type Permission } from './config';
function monthKey(date:Date) { const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:config.timezone}).formatToParts(date);return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`; }
export function can(data: Workspace, permission: Permission, profile: Profile = data.profile) { return profile.status === 'approved' && !profile.requires_password_setup && (profile.role === 'admin' || (['staff_user','donor'].includes(profile.role) && !!data.grants[profile.id]?.[permission])); }
export function scopeDemo(data: Workspace): Workspace {
 if(data.mode!=='demo'||data.profile.role==='admin')return data;
 const financial=can(data,'view_financials')||can(data,'manage_financials')||can(data,'run_audits');
 const assignments=financial||can(data,'assign_donors')?data.assignments:data.assignments.filter(a=>a.donor_id===data.profile.id);
 const children=['manage_orphans','assign_donors','manage_financials','view_financials','run_audits'].some(p=>can(data,p as Permission))?data.children:data.children.filter(c=>assignments.some(a=>a.orphan_id===c.id));
 const readSponsors=['assign_donors','approve_donors','manage_financials','view_financials','run_audits'].some(p=>can(data,p as Permission));
 return {...data,children,entries:financial?data.entries:data.profile.role==='donor'?data.entries.filter(e=>e.donor_id===data.profile.id):[],audits:can(data,'run_audits')?data.audits:[],assignments,profiles:data.profiles.filter(p=>p.id===data.profile.id||(p.role==='donor'&&readSponsors)),grants:{[data.profile.id]:data.grants[data.profile.id]}};
}
export function cents(value: number) { if (!Number.isFinite(value) || value <= 0 || Math.round(value * 100) / 100 !== value) throw new Error('Enter a positive amount with no more than two decimal places.'); return Math.round(value * 100); }
export function validateExpense(data: Workspace, donorId: string, childId: string, amount: number, now = new Date()) {
 const requested = cents(amount);
 if (data.children.find(c => c.id === childId)?.status !== 'active') throw new Error('Expenses require an active child.');
 const assignment = data.assignments.find(a => a.donor_id === donorId && a.orphan_id === childId && a.status === 'active');
 if (!assignment) throw new Error('An active sponsorship is required.');
 if (requested > Math.round(Number(assignment.allocated_balance) * 100)) throw new Error('Insufficient allocated funds.');
 const spent = data.entries.filter(e => e.donor_id === donorId && e.orphan_id === childId && e.type === 'EXPENSE_SPENT' && monthKey(new Date(e.created_at)) === monthKey(now)).reduce((n,e) => n + Math.round(Number(e.amount_out) * 100), 0);
 if (spent + requested > Math.round(Number(assignment.monthly_spending_limit) * 100)) throw new Error('This expense exceeds the monthly sponsorship limit.');
 return assignment;
}
