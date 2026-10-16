# Account invitations, child photos, and onboarding tracking

## One-time deployment setup

1. In the Supabase SQL Editor run `migrations/202610160003_accounts_and_child_photos.sql` once, after the existing core/storage setup. Do not rerun the core migration. This migration adds fields and functions; it does not remove existing records or change existing staff grants.
2. Vercel project → Settings → Environment Variables → add `SUPABASE_SECRET_KEY` as a Secret, server-only variable. Copy the **secret key**, beginning `sb_secret_`, from Supabase → Settings → API Keys. Never use a `NEXT_PUBLIC_` prefix for this variable.
3. Set `APP_URL` to the HTTPS origin listed under Vercel project → Settings → Domains → Production. Include `https://`; omit a trailing page path. Use the permanent alias, not a version-specific deployment URL.
4. Supabase → Authentication → URL Configuration → set Site URL to the same origin and allow the exact `/welcome`, `/reset-password`, and `/auth/callback` URLs on that origin.
5. Supabase → Authentication → Email Templates → Reset Password → copy `email-templates/recovery.html`. This template serves both invitations and password resets. It uses `RedirectTo` so invitations open `/welcome` while normal resets open `/reset-password`. It sends the recipient a one-time setup link and identifies their email as the login; it never sends a password.
6. Configure a verified SMTP sender in Supabase for real recipients. Supabase's default email service has recipient and rate restrictions. Test with an address you control; confirm arrival and spam placement. Provider acceptance alone is not delivery confirmation.
7. Redeploy the Vercel project so the new server settings take effect.

The secret key is required for live account creation and resending setup emails. Existing sign-in, child management and staff permissions remain usable while these invitation settings are incomplete. The additive migration is required to enforce the new setup gate and photo ownership checks. The UI disables invitations until the migration and server configuration are detected.

## Staff and sponsor workflows

- **Users → Add user:** creates an approved staff account, assigns the database-configured initial grants, queues a setup email, and audits the action. Defaults are `manage_orphans` and `assign_donors`; the other four grants are false. Authorized operators can configure `app_settings.staff_default_permissions`; the Permissions screen manages individual staff grants.
- **Sponsors → Add sponsor:** creates an approved sponsor with optional donation amount and description. Profile changes, default grants, initial donation, invitation record and audit entry commit in one PostgreSQL transaction. A save request has a stable UUID and exact payload comparison; replaying it cannot duplicate the donation.
- Supabase Auth creation and email delivery are separate network services, so they cannot be part of that PostgreSQL transaction. A failed finalization leaves an unprivileged, pending account with required password setup. The same administrator can reopen Add sponsor/user with the same email to resume that incomplete account. Existing accounts belonging to another request cannot be overwritten or promoted.
- A random initial password is generated in server memory, never displayed, emailed, logged, or saved as plaintext. The owner verifies access to their email through a recovery link and chooses their own password. Passwords remain managed by Supabase Auth.
- Database-owned `requires_password_setup` blocks the workspace, RPC permissions and RLS access until a real Auth password change. Editing user metadata or merely opening the welcome email cannot remove this requirement. After setting the password, the owner signs in afresh.
- Administrators' inherited full access is shown separately from staff switches. Staff cannot alter their own grants or provision accounts. Sponsor records are scoped by existing RLS to their own profile, assignments and ledger.

## Reconciliation and recovery

Users and Reports & audit show account onboarding reconciliation. The statuses distinguish required password setup from password set but never logged in. The table also shows email attempts, the last provider-accepted request, failures, and safe resend controls. An Auth trigger records password setup and subsequent sign-ins; opening the invitation or changing a password does not itself count as the first completed sign-in.

Email jobs are recorded before delivery. Failed delivery leaves the sponsor and any initial donation intact. A database lease prevents concurrent sends; database settings `invitation_cooldown_seconds` and `invitation_lease_seconds` control retries. Resend recovers a failed or expired setup link without creating another account or donation. Expired links can also be replaced using Forgot password.

No email-open tracking or delivery webhook is installed. `accepted_by_provider` means Supabase accepted the email request. A send interrupted after provider acceptance can remain `sending`; the lease expires and administrators may resend. This is retryable, at-least-once delivery, not a claim of exactly-once email delivery.

## Photos and performance

Child photos accept JPEG, PNG or WebP up to the configured upload limit. Uploads use the private photo bucket with unique paths owned by the submitting account. A database trigger rejects references to another user's new photo or to missing/non-image objects. Existing photo references remain valid when another authorized staff member edits other child fields. Replacing or removing a photo changes the reference; historical objects are retained privately rather than destructively deleting audit evidence.

Workspace reads use deterministic paging to avoid silently losing records beyond Supabase's per-request row limit. Recent audit history is bounded to 100 records. Onboarding records have normalized-email, request and pending-first-login indexes. Creation and email retry operations use targeted indexed lookups rather than listing all Auth users. The current workspace still loads the complete authorized ledger for its totals and exports; larger datasets should move those views to server-side aggregate/report endpoints before materially increasing volume.

## Verification

`npm test` includes embedded PostgreSQL tests that execute the actual migrations with Auth/Storage schema fixtures. They cover setup gating, staff defaults, administrator access, permission revocation, sponsor isolation, donation rollback and replay, invitation leases, and photo ownership. These tests do not send email or change the live Supabase project. Live email delivery requires the configuration above and a controlled recipient test.
