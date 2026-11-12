# Test Sea Credit in StackBlitz

## Run the current frontend

1. Create a Node.js project in StackBlitz.
2. Drag the extracted contents of the supplied `sea-credit-stackblitz.zip` into the project file explorer. Keep `package.json` and `preview.cjs` at the root, with the `dist` folder beside them.
3. Run `npm run dev` if it does not start automatically.
4. Open the preview on port 4173. Use Client login to explore the sample account.

No dependencies or API keys are required for this version. `npm run check` checks JavaScript syntax. `private: true` in package.json prevents accidental npm publication; it does NOT make a StackBlitz project or GitHub repository private. Confirm project visibility separately before uploading proprietary source. Do not make the GitHub repository public to use an import shortcut.

## Current implementation

The branded landing page, calculator, demo application, sample loan overview, schedule, profile form, sample card replacement and document downloads run. Account information is fictional. Profile changes are held in memory. There is no real login, persistent database, underwriting, disbursement, payment collection or email delivery yet.

## Functional implementation milestones

1. Persistent test database, customer registration and login, session handling and server-enforced customer/admin permissions.
2. Saved applications, document storage, application status tracking and manual administrator review.
3. Confirmed product configuration, repayment schedules and an auditable transaction ledger.
4. Identity, email and payment provider sandbox integrations, with idempotent callbacks and reconciliation.
5. Test account isolation, validation, approval permissions, failed payments, duplicate callbacks, document access and backup/restore.

StackBlitz is the development environment. Use an external test database and authentication service when those features are implemented; WebContainers do not run native PostgreSQL/MySQL server processes. Browser preview tests alone do not establish production readiness. Provider webhooks and durable shared services also require a reachable staging backend, which can use a provider's temporary domain before a custom domain is purchased.

Keep production credentials and real customer data out of this project. Use provider sandbox credentials and synthetic records for testing. Server-side secrets must not be shipped in frontend JavaScript.

References:
- https://developer.stackblitz.com/guides/user-guide/importing-projects
- https://developer.stackblitz.com/platform/webcontainers/browser-support
