import { permissions } from './config';
import type { Workspace } from './types';
export function demoWorkspace(): Workspace {
 const now = new Date(); const date = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
 const admin = { id: 'demo-admin', full_name: 'Alex Morgan', email: 'admin@example.test', role: 'admin' as const, status: 'approved' as const };
 return { mode: 'demo', profile: admin, profiles: [admin, { id: 'demo-staff', full_name: 'Jordan Lee', email: 'staff@example.test', role: 'staff_user', status: 'approved' }, { id: 'demo-donor', full_name: 'Sam Taylor', email: 'donor@example.test', role: 'donor', status: 'approved' }, { id: 'demo-pending', full_name: 'Casey Wilson', email: 'casey@example.test', role: 'donor', status: 'pending' }], children: [
 { id: 'child-1', full_name: 'Amelia R.', date_of_birth: '2016-04-12', gender: 'Female', status: 'active', admission_date: date(420).slice(0,10) },
 { id: 'child-2', full_name: 'Noah K.', date_of_birth: '2014-08-22', gender: 'Male', status: 'active', admission_date: date(300).slice(0,10) },
 { id: 'child-3', full_name: 'Olivia M.', date_of_birth: '2017-01-09', gender: 'Female', status: 'active', admission_date: date(180).slice(0,10) },
 { id: 'child-4', full_name: 'Ethan J.', date_of_birth: '2012-11-03', gender: 'Male', status: 'graduated', admission_date: date(800).slice(0,10) }],
 assignments: [{ id: 'assignment-1', donor_id: 'demo-donor', orphan_id: 'child-1', monthly_spending_limit: 15000, allocated_balance: 22000, status: 'active', start_date: date(120).slice(0,10) }, { id: 'assignment-2', donor_id: 'demo-donor', orphan_id: 'child-2', monthly_spending_limit: 10000, allocated_balance: 10000, status: 'active', start_date: date(90).slice(0,10) }],
 entries: [{ id: 'entry-1', donor_id: 'demo-donor', type: 'DONATION_RECEIVED', category: 'General', amount_in: 50000, amount_out: 0, verification_status: 'verified', description: 'Monthly sponsorship contribution', created_at: date(5) }, { id: 'entry-2', donor_id: 'demo-donor', orphan_id: 'child-1', type: 'EXPENSE_SPENT', category: 'Education', amount_in: 0, amount_out: 5000, verification_status: 'verified', description: 'School tuition and learning materials', created_at: date(3) }, { id: 'entry-3', donor_id: 'demo-donor', orphan_id: 'child-1', type: 'EXPENSE_SPENT', category: 'Nutrition', amount_in: 0, amount_out: 3000, verification_status: 'pending', description: 'Monthly nutrition support', created_at: date(1) }],
 audits: [{ id: 'audit-1', action_type: 'WORKSPACE_INITIALIZED', created_at: date(5), details: { message: 'Fictional sample data. No real payments or personal records.' } }], grants: { 'demo-staff': Object.fromEntries(permissions.map(p => [p, p === 'manage_orphans'])) as Workspace['grants'][string] } };
}
