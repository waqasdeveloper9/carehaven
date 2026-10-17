# Profile menu and account permissions

Run `migrations/202610170004_profile_menu_and_access.sql` once in the Supabase SQL Editor after migrations 001–003. This additive migration preserves existing accounts, grants and records. Deploy the application code afterward.

The top-right avatar opens account details, profile photo controls, Settings/password, and Log out on desktop and mobile. Logout clears the authenticated Supabase session; a failed logout keeps the user on screen with an error. Each approved, fully set-up account can upload its own JPEG/PNG/WebP photo. The private bucket is configured through `app_settings.avatar_bucket`, with matching `NEXT_PUBLIC_AVATAR_BUCKET` in Vercel (default `profile-photos`). Signed photo URLs expire after 60 seconds. Replaced photos remain private; no historical objects are deleted by a profile edit.

Permissions lists all accounts with name/email and role filters. Administrators have inherited full access and cannot be downgraded through grant switches. Staff and sponsors can receive explicit organization permissions through an administrator-only RPC; changes are audited. A confirmation panel explains the grant before saving it. Sponsor grants start off; without them sponsors retain only their own records. Revocation restores database isolation on the next request. Approval and password setup remain mandatory regardless of assigned grants. This does not change account roles or allow sponsors/staff to administer grants.

Before this migration is applied, the account menu and logout work, and existing staff permission edits remain available. Photo uploads and sponsor grant edits stay disabled with setup guidance.

Verify the production menu and a controlled photo upload after applying the migration. Automated PostgreSQL tests cover default sponsor isolation, explicit financial grants and revocation, refusal of self-grants, administrator preservation, and photo owner validation. Browser previews use fictional demo records and send no email.
