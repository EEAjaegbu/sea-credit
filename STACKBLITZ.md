# Test the customer-to-reviewer workflow

## 1. Load the updated repository

Open your private GitHub repository in your authorized StackBlitz environment. Use the latest commit containing `server/`, `scripts/`, `test/`, and `dist/portal.js`. Do not reuse a preview of the older static-only files. Keep GitHub and StackBlitz visibility private.

For a manual upload, copy the extracted project contents into the project root. Keep `package.json`, `preview.cjs`, `dist/`, `server/`, and `scripts/` beside one another. No npm dependencies or API keys are needed for this milestone.

## 2. Create a reviewer and start

If the development server started automatically, stop it with Ctrl+C. Run:

```sh
npm run admin:create -- reviewer@example.test
npm run dev
```

Copy the generated password to a private place. Do not put it into a source file or commit it. The admin command intentionally refuses to overwrite an existing account. If you have already created a reviewer and saved the password, skip that command.

Open the preview on port 4173. If sign-in does not stick in an embedded preview, open that preview in its own browser tab so cookies are not blocked by the embedding context.

## 3. Customer test

1. Choose Get started and register a fictional customer, for example `customer@example.test`, with a unique password of at least 12 characters.
2. Complete the application form using fictional contact, employment and income details. Check the test-information acknowledgement and submit.
3. Confirm an application reference and Submitted status appear. Refresh the page and confirm the application remains.
4. Open Your details, change a contact field, save and refresh to verify persistence.
5. Sign out.

## 4. Reviewer test

1. Sign in using `reviewer@example.test` and the generated password.
2. Open Review applications, locate the customer's request and select Review.
3. Choose Information needed, add a specific message and save the update.
4. Sign out and sign in as the customer. Open the application, select Update & resubmit, make the requested correction and add a response.
5. Sign back in as the reviewer, reopen the request, and save an Approved or Declined test decision with a message.
6. Sign back in as the customer and confirm the decision and full history are visible.

Run both roles against the same running project. Opening a separate StackBlitz fork creates a separate development environment and data store, not a shared backend. A reviewer account has no self-service registration button; only the provisioning script grants that role.

## 5. Additional checks

- Create a second customer. They must not see the first customer's application.
- Test status filters, empty states, required fields and invalid amounts.
- Withdraw a pending application. Closed applications cannot be edited or reviewed again.
- Refresh before updating a request another session has changed. Stale versions are rejected.
- Stop and restart `npm run dev` without resetting the container. The same `.data/` directory retains records.
- Run `npm run check` and `npm test`.

## Troubleshooting

- **Backend unavailable:** run `npm run dev` from the directory containing `package.json`; a static server cannot run the API.
- **Origin not allowed:** use the application's own preview tab. If a trusted proxy rewrites Host, set `APP_ORIGIN` to that preview's exact scheme and hostname and restart. Never use a wildcard.
- **Already registered:** sign in with the existing test account or choose a different fictional email. Email-based password recovery is not connected yet.
- **Missing records after re-import/fork:** runtime data is local to that environment and excluded from Git. A durable shared database is a later milestone.
- **Private GitHub import unavailable:** preserve repository privacy and use an authorized project import/upload supported by your StackBlitz account.

## What this test does not verify

There are no real loan offers, payments, disbursements, KYC checks, uploaded documents or email messages in this version. Approving a test application does not issue credit. A custom domain is not needed for this stage, but shared staging will require a persistent backend and database.
