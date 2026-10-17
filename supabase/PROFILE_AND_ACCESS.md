# Profile menu and account permissions

Run `migrations/202610170004_profile_menu_and_access.sql` once in the Supabase SQL Editor after migrations 001–003. This additive migration preserves existing accounts, grants and records. Deploy the application code afterward.

The top-right avatar opens account details, profile photo controls, Settings/password, and Log out on desktop and mobile. Logout clears the authenticated Supabase session; a failed logout keeps the user on screen with an error. Each approved, fully set-up account can upload its own JPEG/PNG/WebP photo. The private bucket is configured through `app_settings.avatar_bucket`, with matching `NEXT_PUBLIC_AVATAR_BUCKET` in Vercel (default `profile-photos`). Signed photo URLs expire after 60 seconds. Replaced photos remain private; no historical objects are deleted by a profile edit.

Permissions lists all accounts with name/email and role filters. Administrators have inherited full access and cannot be downgraded through grant switches. Staff and sponsors can receive explicit organization permissions through an administrator-only RPC; changes are audited. A confirmation panel explains the grant before saving it. Sponsor grants start off; without them sponsors retain only their own records. Revocation restores database isolation on the next request. Approval and password setup remain mandatory regardless of assigned grants. This does not change account roles or allow sponsors/staff to administer grants.

Before this migration is applied, the account menu and logout work, and existing staff permission edits remain available. Photo uploads and sponsor grant edits stay disabled with setup guidance.

Verify the production menu and a controlled photo upload after applying the migration. Automated PostgreSQL tests cover default sponsor isolation, explicit financial grants and revocation, refusal of self-grants, administrator preservation, and photo owner validation. Browser previews use fictional demo records and send no email.

## Batch permission editing and query performance

Run `migrations/202610170005_batch_permissions.sql` once before deploying the batch editor. It adds `set_permissions_batch(jsonb)` plus indexes for recent audit history and monthly sponsorship spending. It preserves existing grants and records. The RPC is callable by authenticated sessions and checks the caller's current administrator status before reading or writing grants. It cannot change administrator grants or roles.

Switches stage local edits across accounts and filters. Save changes sends one request and one RPC; each affected account receives one update and its normal audit trigger. Discard or toggling a switch back removes the pending change. Drafts survive in-app navigation, but a browser reload clears unsaved edits. A bounded batch accepts up to 256 changed fields.

Each edit includes the previously displayed value. The transaction locks affected profiles and grants in a consistent order, rejects duplicate/unknown fields, and checks expected values before updating any account. Stale edits return HTTP 409; Reload current permissions fetches only the affected grants, keeps desired values that still differ, and requires the administrator to review and save again. No fields apply when a batch fails.

Successful saves merge only returned grant rows into the UI; they do not fetch the full workspace. Audit history refreshes separately when opened after a grant change. Workspace data, audit history, invitations and defaults load concurrently after the current profile is checked. Cryptographically verified JWT claims avoid an extra Auth-user lookup; database role/setup checks and RLS remain authoritative. The permission endpoint emits a `Server-Timing` duration for measurement. No cross-user cache or optimistic success is used.

This reduces request count and unnecessary reads; it does not establish a guaranteed latency figure. Database region, Vercel cold starts, network latency and full-ledger workspace loading can still affect response times. Larger datasets should use server-side paginated financial reports and aggregates rather than loading the entire authorized ledger.
