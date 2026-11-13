# StackBlitz testing — Supabase version

## Start with the latest GitHub code

Reload/import the latest `main` containing `supabase/setup.sql`, `dist/supabase-config.js`, `dist/supabase-data.js` and `dist/vendor/supabase.js`. Use `npm run dev` and open port 4173 in its own browser tab.

The previous local JSON database and custom password processing are no longer used. Do not run the retired `admin:create` command. Accounts created in older local previews do not automatically exist in Supabase.

## Finish the one-time hosted setup

Follow [`supabase/SETUP.md`](supabase/SETUP.md):

1. Run `supabase/setup.sql` in the Supabase project's SQL Editor.
2. In **Authentication → URL Configuration**, set the current preview root as the test Site URL and add it as an exact allowed Redirect URL. Omit the `#register` or `#login` fragment. The app sends this root as `emailRedirectTo`.
3. Keep email confirmation enabled. Use an inbox you control and a unique password.
4. Register and confirm a reviewer account, then have the project owner run the reviewer SQL template with that account's email.

Until the setup script is applied, the app will explain that database setup is incomplete. A publishable key cannot execute administrative SQL.

## Customer and reviewer walkthrough

1. Create a customer account with a reachable email and fictional profile/application data.
2. Confirm the email link in the same browser where registration started, then sign in.
3. Submit a test loan application and confirm its reference and Submitted status.
4. Refresh and confirm that the application persists.
5. Sign out; sign in as the provisioned reviewer and request more information with a message.
6. Sign in as the customer, update and resubmit with a response.
7. Sign in as the reviewer, approve or decline with a message.
8. Confirm the customer sees the final status and full history.
9. Create another customer and verify they cannot see the first customer's request.

Applications are shared across previews using the same Supabase project. Use distinct browser profiles or sign out between roles. Data persists in Supabase independently of the StackBlitz filesystem.

## Errors and recovery

- **Database setup not complete:** run the full setup SQL in the correct project, then refresh.
- **Email not confirmed:** open the confirmation email, or use Resend confirmation email. Check spam and the Supabase Auth logs.
- **Link opens the wrong site:** update Site URL/Redirect URLs to the current preview origin, then request a fresh confirmation link. Do not allow all WebContainer hostnames.
- **Email sending rate limit:** wait before retrying. Configure a supported SMTP provider for wider testing; keep email confirmation enabled.
- **PKCE verifier missing/expired:** open the confirmation link in the same browser and original preview origin. Request a new link if the original preview was reset.
- **Access denied:** ensure the entire migration ran, Data API is enabled with `public` exposed, and the reviewer was provisioned by the owner. Do not disable RLS as a workaround.
- **Local API retired:** refresh/re-import the latest frontend; old code still calling `/api/auth/register` is no longer supported.

## Automated checks

```sh
npm ci --ignore-scripts
npm run check
npm test
```

These tests use an isolated PostgreSQL-compatible local engine and mock auth identity; they do not send emails or alter the live project. Real sign-up, email confirmation and hosted RLS need verification after the hosted migration is applied.

Payments, loan disbursements, supporting documents and password recovery are outside this milestone. Use fictional application details only.

## Expanded application update

See [UPGRADE-V2.md](supabase/UPGRADE-V2.md) for the required database and private document storage migrations. Existing deployments must run 002 then 003 before testing the updated form. New tenures are 7, 14, 21, 28, 56 and 84 days.
