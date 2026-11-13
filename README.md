# Sea Credit — Supabase development application

Branded landing page, customer accounts, loan applications and manual reviewer dashboard. Version 0.3 replaces the StackBlitz-local JSON database and custom password hashing with **Supabase Auth and PostgreSQL**.

## Required one-time setup

The URL and public publishable key are configured for project `exyseocugjxuolymmmac`. The hosted schema still needs to be installed by the project owner:

1. Run the complete [`supabase/setup.sql`](supabase/setup.sql) in that project's Supabase SQL Editor.
2. Configure the app's current preview URL in **Authentication → URL Configuration** for email confirmation.
3. Register and confirm accounts through the app. Use an inbox you control, a unique password, and fictional application information.
4. To give a confirmed account reviewer access, follow [`supabase/promote-reviewer.sql`](supabase/promote-reviewer.sql). Only the project owner should execute that script after selecting the intended account.

See [`supabase/SETUP.md`](supabase/SETUP.md) for exact steps. Supplying an API key alone does not install tables. Without the schema, registration displays a clear setup message and does not create a partial account through the app.

## Run in StackBlitz or locally

Use Node.js 20 or newer; Node.js 22 is used by CI.

```sh
npm run dev
```

Open port 4173, preferably in its own browser tab. The Node server now serves static files only. The browser communicates directly with Supabase using its official JavaScript client, which is pinned and vendored locally. No secret key or database password is required by the frontend.

## Working features

- Supabase email/password registration, confirmation, sign-in, sign-out and session refresh.
- A check-your-email step for registrations that do not yet have a confirmed session.
- Confirmation resend with actionable provider errors.
- Customer profiles, applications, review history and status filters.
- Reviewer requests for information, approval and decline; customer resubmission and withdrawal.
- Database-enforced ownership checks and reviewer roles independent of user-editable metadata.
- RLS on every public application table; no client-side direct inserts, updates or deletes.
- Transactional workflow functions, idempotent submissions, five-open-application limit and stale-version protection.

Approval is a **test decision**, not a loan agreement, disbursement or repayment obligation. Test amount and period limits are illustrative. KYC, document uploads, binding offers, payments, password recovery and production operational hardening remain future milestones.

## Security and persistence

Customer records are stored in the configured Supabase project, rather than the browser's StackBlitz container. Different previews using that project share data and enforce access through Supabase Auth and Postgres policies. The official SDK persists the browser's session and refreshes tokens. Avoid running untrusted scripts on the same origin.

`dist/supabase-config.js` contains **public** project configuration. A publishable key identifies the project; it does not grant reviewer or SQL administration access. Never add `sb_secret_...`, a `service_role` key, a database password or an access token to this repository.

Reviewer status is held in the private database table, not signup metadata. Customers cannot promote themselves or directly forge application status/history. Guarded SQL functions check identity and role for every mutation.

Local `.data/` records are no longer used and are **not migrated** to Supabase. Register new accounts in Supabase. The previous local `admin:create` command has been retired.

## Tests

```sh
npm ci --ignore-scripts
npm run check
npm test
```

The tests execute the actual SQL in a local PGlite PostgreSQL engine, simulating Supabase's auth schema and JWT identity function. They verify privileges, RLS, profile creation, role boundaries, validation, idempotency, review transitions and transaction rollback. Separate tests cover pending email confirmation, missing-schema errors and static serving. They do not create accounts, send emails or modify the live Supabase project.

Hosted setup and the complete sign-up/confirmation flow must still be checked in the real project. Passing local SQL tests does not prove live email delivery or hosted configuration. See [`STACKBLITZ.md`](STACKBLITZ.md).

## Files

```text
dist/                    Branded UI, Supabase transport and public config
dist/vendor/             Pinned official Supabase browser SDK and license
supabase/setup.sql       Tables, grants, RLS and application workflow functions
supabase/promote-reviewer.sql  Owner-only reviewer provisioning template
server/app.cjs           Static preview server; no account/password backend
preview.cjs              Development server entry point
test/supabase.test.cjs   PostgreSQL, adapter and static-server tests
```

Keep the GitHub repository and StackBlitz project private. `private: true` in package.json only prevents npm publication. Fonts load from Google Fonts and the landing-page photograph loads from Unsplash. Branding is visually matched to the supplied Sea Credit reference.

## Expanded application update

See [UPGRADE-V2.md](supabase/UPGRADE-V2.md) for the required database and private document storage migrations. Existing deployments must run 002 then 003 before testing the updated form. New tenures are 7, 14, 21, 28, 56 and 84 days.
