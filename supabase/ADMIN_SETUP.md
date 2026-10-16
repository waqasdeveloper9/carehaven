# First administrator and password recovery

There is no built-in administrator password. Never deploy a public setup endpoint or hardcode a shared password. Administrator identities are held by Supabase Auth; PostgreSQL profiles hold their role and approval status. Password hashes remain under Supabase Auth management.

## Database prerequisites

Apply these scripts once, in order, in the Supabase SQL Editor:

1. `migrations/202610160001_core.sql`
2. `storage.sql`
3. `migrations/202610160002_admin_bootstrap.sql`

Do not rerun the core migration if it has already been applied.

## Private local setup

Set these values in the ignored local `.env.local` file:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your-project-url
SUPABASE_SECRET_KEY=your-server-secret-key
AUTH_ADMIN_USERNAME=admin
AUTH_ADMIN_EMAIL=your-real-admin-email
APP_URL=https://your-permanent-production-domain
```

The **server secret key** comes from Supabase Project Settings → API Keys → Secret keys. A legacy service-role key also works through `SUPABASE_SERVICE_ROLE_KEY`. This key is only needed for the local setup script. Never put it in a `NEXT_PUBLIC_*` variable, GitHub, a screenshot, or a chat message. The normal deployed app does not need this key.

Run:

```powershell
npm run setup:admin
```

The script creates an Auth user with a random initial password that it never prints or persists, promotes their profile using the service-only bootstrap function, and verifies the approved administrator role. An existing matching confirmed account can be promoted instead. A database advisory lock prevents concurrent first-admin promotions. If another administrator already exists, setup cannot create an additional one. Failures are reported; an account created before promotion fails remains unprivileged.

The script saves a one-use password setup link to `.tmp-tests/first-admin-setup-link.txt`. Open it privately, choose a password of at least 12 characters, and sign in. The file is ignored by Git. The script does not send an email. Link expiry follows Supabase's configured recovery-token lifetime. If the same administrator needs a new setup link, rerun the local script with the same email and privileged key.

After setup, remove the server secret from local configuration if it is no longer needed. Keep the administrator alias and email configured on the deployed server if username login is desired. The password is never stored in environment variables.

## Vercel configuration

Add these **server-side** variables in Vercel and redeploy:

```dotenv
AUTH_ADMIN_USERNAME=admin
AUTH_ADMIN_EMAIL=your-real-admin-email
APP_URL=https://your-permanent-production-domain
```

With the alias configured, the owner can sign in as `admin` or with their email. Both authenticate the same Supabase account. Other users sign in with their email.

The permanent production domain is the address listed in **Vercel → CareHaven → Settings → Domains** and assigned to Production. Generated deployment URLs refer to individual versions and can be protected by Vercel sign-in. Do not use a historical deployment URL for password recovery.

## Configure recovery emails

1. Supabase → Authentication → URL Configuration: set Site URL to the permanent production origin. Add the exact `/reset-password` URL to the allowed Redirect URLs. Keep `/auth/callback` allowed for signup confirmation.
2. Recommended for links opened on another device/browser: Supabase → Authentication → Email Templates → Reset Password, replace the message body with `email-templates/recovery.html`. The default template is also supported through PKCE when opened in the browser that requested the email.
3. Configure your SMTP provider and password policy in Supabase for real users. Retain Supabase's email and authentication rate limits.

The application requests recovery emails with an explicit redirect address. The template includes `TokenHash`, which lets the password form validate the recovery token even when the email opens in another browser. The default email flow accepts a one-time PKCE code and verifies that the signed authentication claims contain a recent recovery method. A normal login session or a non-recovery code cannot substitute for recovery proof. With the recommended TokenHash template, merely opening the application link does not consume it; the form consumes it when the user submits a new password. Error responses for recovery requests do not disclose whether an email is registered.

## Available pages and controls

- `/login`: Email or username, password, and Forgot password.
- `/forgot-password`: Request a password reset email.
- `/reset-password`: Choose a password using a valid one-time recovery link.
- Settings → Account security: Change password using the current password and matching new passwords.

After a successful change/reset, the app requests global sign-out and requires a fresh sign-in. Supabase revokes refresh sessions; previously issued access tokens may remain valid until their normal expiry. Enable Supabase's password security and reauthentication policies appropriate to your organization.

Do not test live email delivery with unrelated addresses. Use an account you control.

References: [Supabase password authentication and recovery](https://supabase.com/docs/guides/auth/passwords), [server-only administrator user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), and [password security](https://supabase.com/docs/guides/auth/password-security).
