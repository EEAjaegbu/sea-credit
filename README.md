# Sea Credit — working development application

Sea Credit's branded landing page, customer account area and manual application-review dashboard. Built with browser HTML/CSS/JavaScript and a Node.js backend, with no third-party runtime dependencies.

## Quick start

Use Node.js 20 or newer (Node.js 22 recommended). Open the repository in a Node.js StackBlitz environment, then run:

```sh
npm run dev
```

Open the preview on port 4173. Create a customer account using fictional information and a unique test password of at least 12 characters. The server must run: opening `dist/index.html` alone or deploying only `dist/` will not provide the API.

To provision a reviewer, stop the server first and run:

```sh
npm run admin:create -- reviewer@example.test
npm run dev
```

The command prints a generated reviewer password once. Save it privately, outside the repository. Sign out of the customer account and use Client login with this reviewer account. Customer registration cannot create or promote administrators. No default passwords are shipped.

## Implemented

- Customer registration, sign-in and sign-out.
- Salted scrypt password hashes; opaque, expiring HttpOnly session cookies; CSRF and origin checks; login rate limits.
- Server-side customer/admin authorization and application ownership checks.
- Persistent customer profiles and applications in a local development data file.
- Loan request form with contact details, employment information, income, amount, period and purpose.
- Customer application lists, status filters and application history.
- Reviewer queue and manual status updates with messages visible to the customer.
- Requests for additional information, customer correction/resubmission and withdrawal.
- Idempotent application creation and version checks that reject conflicting updates.
- Automated tests of the full API workflow, authorization boundaries and restart persistence.

The account dashboard now shows actual test applications. The previous fictional loan balance, payment card and statement controls were removed rather than presented as real account data.

## Development data and limits

The single-process Node backend writes `.data/database.json` atomically. Accounts, hashed sessions, profiles and applications survive restarting the server **when the same data directory remains present**. `.data/` is ignored by Git and is never exposed by the static server. It contains private development records: do not commit it or include it in exports.

StackBlitz WebContainers run in the browser. This local store is not a shared hosted database; separate forks or environments do not share accounts. A container reset or project re-import may discard its runtime data. Use a persistent hosted database before shared staging or production. Do not run multiple server processes against the same JSON file. Stop the server before provisioning administrators or making a private backup.

Only fictional test information should be used in this build. Requests of ₦50,000–₦1,000,000 and periods of 1, 3 or 6 months are **test validation limits**, not confirmed Sea Credit product terms. The landing-page calculator remains illustrative and does not set application terms.

Approval records a manual **test review decision**. It creates no loan agreement, disbursement, outstanding balance, or repayment obligation. There is no automatic credit scoring.

## Not implemented yet

Email verification and password recovery, KYC, supporting-document uploads, hosted database/storage, approved product rules, binding loan offers, disbursements, repayment accounting, payment-provider integration and notifications remain future milestones. This development server is not production-hardened hosting.

## Checks

```sh
npm run check
npm test
```

The tests create an isolated temporary database, exercise the customer/reviewer workflow, restart the server to verify persistence, and clean up their own temporary files. They do not touch `.data/` or use real customer records. GitHub Actions runs the same checks on pushes and pull requests.

## Source layout

```text
dist/              Landing page, portal UI, styles
server/app.cjs     HTTP API, sessions, authorization and workflow validation
server/store.cjs   Single-process development persistence and password hashing
scripts/          Reviewer account provisioning
test/             Automated API workflow tests
preview.cjs       Server entry point
STACKBLITZ.md     Step-by-step test guide
```

Optional environment variables are documented in `.env.example`. The app reads process environment variables; it does not automatically load `.env` files. `APP_ORIGIN` can be set to the exact trusted preview origin if a proxy changes the Host header. Do not disable origin checks or use a wildcard. HTTPS requests use Secure session cookies; localhost HTTP works for development.

Keep the GitHub repository private. `private: true` in package.json only prevents npm publication; it does not control GitHub or StackBlitz visibility. Do not upload `.git/`, `.openai/`, `.data/`, environment secrets, or old deployment archives.

## Branding

Royal blue, violet, turquoise and white are visually matched to the supplied Sea Credit LinkedIn screenshot. Fonts load from Google Fonts and the landing-page image loads from Unsplash. Company positioning came from the supplied references and https://vc4a.com/ventures/sea-credit-ltd/ . Confirm official assets and product copy before public release.
