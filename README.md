# CareHaven

A Next.js App Router application for child care records, donor sponsorships, financial recording, and audit review. English is used throughout. Organization settings and service credentials are supplied through configuration; fictional demonstration records are isolated in `lib/demo.ts`.

## Run locally

Requires Node.js 22 or later.

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open the URL printed by Next.js. `APP_MODE=demo` explicitly enables the fictional browser-local workspace. No real money moves. Do not put real child or donor data into demo mode. Use Settings to preview donor and staff roles or reset the sample data. Live mode does not fall back to demo when configuration or authentication fails.

```powershell
npm run typecheck
npm test
npm run build
```

## Connect Supabase later

1. Create a Supabase project. Run `supabase/migrations/202610160001_core.sql` in its SQL editor, then run `supabase/storage.sql`. These are scripts for a **new database**, not an upgrade of the sample schema in the supplied prompt.
2. Set `APP_MODE=live`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. A legacy anon key also works in the publishable key setting. Never supply the service role key to the frontend.
3. Set organization, currency, locale, timezone, storage bucket names, and upload limits. Match SQL `app_settings` and storage configuration to the environment. Rebuild after changing `NEXT_PUBLIC_*` values.
4. Configure Supabase Auth site URL and the `/auth/callback` redirect URL. Use your own SMTP provider before real signups. Registration always creates a pending donor; user metadata cannot choose staff or admin access.
5. Register and confirm the first administrator account. A trusted database administrator must bootstrap it through the SQL editor:

```sql
update public.profiles
set role = 'admin', status = 'approved'
where id = '<confirmed-auth-user-uuid>';
```

6. Create staff accounts through Auth, then assign `staff_user` and approved status through trusted SQL. Use the Permissions tab to grant their access. Public signup cannot create privileged accounts.
7. Start the app, sign in, and test with separate administrator, staff, donor, pending, and rejected accounts before entering real records.

## Implemented workflows

- Responsive dashboard, mobile navigation, child creation and status transitions, donor approvals, staff permission matrix.
- Many-to-many sponsorships, donor wallet accounting, explicit allocations, monthly caps, and historical assignments.
- Donation recording and expenses with proof upload, missing-receipt decision, pending verification, or required override justification.
- Ledger filters by date, donor, child, and category; Excel and PDF exports.
- Supabase Auth with confirmation callback and session refresh; pending approval gate; private receipt storage with RLS.
- Install manifest and offline connection screen. Personal and financial responses are not cached by the service worker.

## Financial and security design

All live financial and allocation writes use security-definer PostgreSQL functions with fixed search paths, approved-user checks, row locks, and an explicit permission allowlist. Financial tables have no direct client mutation privileges. SQL functions run in the caller's transaction; any exception rolls back the entire RPC. Do not place `COMMIT` inside these functions. The migration itself uses `BEGIN` and `COMMIT`.

Donor rows serialize wallet operations; child rows serialize spending against status changes. Receipt decisions and financial postings are appended to the audit log in the same transaction. Donation and expense RPCs use idempotency keys and reject key reuse with changed payloads. Pending expenses reserve funds immediately and count against the monthly cap. A positive cap is required; zero does not mean unlimited. Date boundaries in live financial posting use the configured database financial timezone.

When a child leaves active care, active sponsorships become completed. Their unspent allocations remain held on completed assignments and cannot be used by new allocations. Historical assignments are retained. The current ledger records inflows and outflows by donor; it is **not a full double-entry general ledger** and does not initiate bank transfers.

RLS and storage policies follow the [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function guidance](https://supabase.com/docs/guides/database/functions). Apply and test them against your actual Supabase project before deployment.

## Remaining production work

This is an initial development implementation, not a production certification. Database integration and adversarial RLS/concurrency tests require a Supabase instance. Further work includes child profile editing and photo galleries, receipt review resolution, escrow reassignment approval, reversal postings, a balanced double-entry journal, paginated reports for large datasets, automated backups and retention, monitoring, deployment-specific rate limits, accessibility and cross-browser device QA, and organization-specific recurring schedules. Receipt upload and access through short-lived signed links are implemented. No scheduled financial automation is enabled. Financial records are intentionally retained instead of deleted.

## Details needed next

- Supabase project URL and publishable key (configure secrets directly; do not share service role credentials in chat).
- Organization name, base currency, locale, financial timezone, logo, and preferred spending categories.
- Initial administrator email, staff roles, donor approval process, and receipt override policy.
- Escrow release/reassignment rules, monthly schedule requirements, and migration data.
- Hosting domain/provider, email provider, backup and data retention requirements.

## Approved visual theme

The shared mint, emerald, blush, and navy theme covers authentication and every workspace page. See [design notes and approved references](design/README.md). Theme artwork paths are configurable; illustrative child portraits are used only in demo mode. The direct sign-in page is `/login`.

## Administrator and password access

See [first administrator and recovery setup](supabase/ADMIN_SETUP.md) for the service-only bootstrap migration, private `npm run setup:admin` command, optional administrator username alias, and Supabase recovery email template. The login screen includes Forgot password, and Settings includes Account security → Change password. No default password is stored in the application.
