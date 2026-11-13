# Connect this project to Supabase

Project: `exyseocugjxuolymmmac`.

The public URL and publishable key are configured in `dist/supabase-config.js`. They identify the project, but do not create tables or grant admin access. Never put a database password, Supabase secret key or legacy `service_role` key into browser code, StackBlitz source or GitHub.

## 1. Apply the database schema

Open the project's **SQL Editor**, create a new query, paste the **entire contents of `supabase/setup.sql`**, and click Run. A successful run installs:

- `public.profiles`, automatically linked to Supabase Auth users;
- `public.applications` and `public.application_events`;
- the private reviewer role table;
- row-level security policies and explicit minimum grants;
- guarded database functions for profile changes, application submission and review decisions.

The setup is transactional and can be rerun without deleting the app's records. The Data API must be enabled and the `public` schema exposed. Leave **Automatically expose new tables** disabled: the SQL script supplies explicit grants. Automatic RLS can remain enabled.

The script is designed for this new Sea Credit project. It does not migrate the old `.data/database.json` accounts or password hashes. Existing local test accounts must register with Supabase.

## 2. Configure confirmation links

In Supabase **Authentication → URL Configuration**:

1. Open the app's StackBlitz preview in its own tab.
2. Copy the preview origin and trailing slash, for example `https://YOUR-CURRENT-PREVIEW.local-credentialless.webcontainer.io/`. Do not include `#register` or `#login`.
3. Use that URL as the test **Site URL** and add the same exact URL to **Redirect URLs**.
4. For optional local development, add `http://localhost:4173/` as a separate redirect URL.

The app explicitly supplies its current origin as `emailRedirectTo`. If your StackBlitz preview hostname changes, update the allowed redirect URL. Do not allow a wildcard covering every user's WebContainer host. Keep email confirmation enabled. The integration uses the PKCE flow, so open the confirmation link in the same browser and preview origin where you registered.

If the verification link is expired, use **Resend confirmation email** on the app's sign-in page. Supabase email rate limits and delivery settings still apply; repeated clicks do not resolve a rate limit. For wider testing, configure an SMTP provider you control.

## 3. Register a customer

Run `npm run dev` and choose Get started. Use an inbox you control, a new unique password, and fictional application information. Supabase sends the confirmation message. Confirm the email, then sign in. The page does not treat a pending confirmation as a successful login.

If the setup has not been applied, the app displays an explicit message asking the project owner to run `supabase/setup.sql`, instead of the previous generic storage error.

## 4. Assign a reviewer

Register and confirm a separate account intended for the administrator. Open `supabase/promote-reviewer.sql`, replace `REPLACE_WITH_REVIEWER_EMAIL` with that account's email, and run it as the project owner in SQL Editor. Refresh the app to load the new role.

Only the project owner can provision reviewers. Neither customer signup metadata nor a browser request can grant this role. The old `npm run admin:create` command has been removed because it created an account only in the retired local database.

## 5. Test the workflow

Customer: submit → reviewer: request information → customer: update and resubmit → reviewer: approve or decline → customer: read the decision and history. A second customer must not see the first customer's request. Use different browser profiles or sign out between accounts. Different StackBlitz previews now share the same Supabase records, provided they use this project's configuration.

Approvals remain test decisions, not issued loans. Offers, payments and password recovery are separate milestones. Private document storage is available after migration 003.

## Verification boundaries

`npm test` runs the actual migration and workflow functions in a local PostgreSQL-compatible PGlite engine, with Supabase's `auth.users` and JWT identity function simulated. It tests SQL permissions, RLS, data validation, ownership, manual review transitions, history, idempotency and conflicting updates. It also checks confirmation handling in the client adapter and the static preview server.

Those tests do not prove hosted migration completion, email delivery, Supabase Auth settings, or StackBlitz browser behavior. After running setup in the hosted project, complete the browser checklist in `STACKBLITZ.md`.

References:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/getting-started/api-keys

## Expanded application update

See [UPGRADE-V2.md](UPGRADE-V2.md) for the required database and private document storage migrations. Existing deployments must run 002 then 003 before testing the updated form. New tenures are 7, 14, 21, 28, 56 and 84 days.
