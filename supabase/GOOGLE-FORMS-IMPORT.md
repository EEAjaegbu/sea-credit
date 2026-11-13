# Existing Google Form responses

Inspection on 2026-11-13 found a response sheet with 33 populated headers and 28
timestamped entries (August–December 2023). Only headers, timestamp and tenure columns
were inspected for this plan. No customer rows or documents have been copied to this repository or Supabase.

To view the old records: Google Form → Responses → green Google Sheets icon.
The response sheet has a `Form Responses 1` tab. Document columns contain links to
the Google Drive uploads; they are not files embedded in the spreadsheet.

## Field mapping

| Google Form fields | Website destination |
| --- | --- |
| Full Legal Name; Email Address | applicant name; verified account email |
| Home Address; Office/Business Address | residential address; office address |
| Phone number; Phone Number(Whatsapp) | phone; WhatsApp |
| Registration Number(Business Loan) | business registration |
| Identity number; BVN | identity type/number; BVN (type must be established) |
| LinkedIn Profile | optional LinkedIn URL |
| Bank Name; Account Name; Account Number | bank details |
| Current Employer/Business Name; Job Title | employment details |
| Monthly Income (Gross); Monthly Income (Net pay) | gross and net monthly income |
| Loan Amount; Purpose of the Loan | requested amount and purpose |
| Loan Tenure | original tenure retained; reviewed normalized tenure |
| Four Guarantor fields | guarantor name, employer, address and phone |
| Eight document columns | private attachment categories |
| Timestamp | original submission timestamp and source row provenance |

## Import rules to implement before moving real records

1. Retain the Google sheet and Drive files as the source archive.
2. Import first into a reviewer-only staging area, with source sheet ID, row number,
   original timestamp, original tenure and a repeat-import key. Do not insert raw rows
   directly into the customer-facing applications table.
3. Preserve numeric identifiers as text, including leading zeros. Validate amounts,
   gross/net income and document URLs without guessing missing information.
4. Historical values include `I month`, `ONE MONTH`, `30 days`, `30days`, `31 Days`,
   `30` and `30 - 90 days`, as well as 7/28 days. Do not convert these silently to
   28/56/84 days. A reviewer must resolve ambiguous values.
5. Confirm historical status, actual disbursements and repayments separately: the
   form is an application record, not a loan ledger. Do not mark these new submissions.
6. Verify account ownership before linking a historical record to an authenticated
   customer. Do not create passwords or grant access merely because an email matches.
7. Transfer documents only after confirming Drive access and destination storage.
   Keep source links and log missing or inaccessible files.
8. Reconcile row counts and duplicates and review staged records before committing.

The response spreadsheet uses Africa/Algiers as its configured timezone. Confirm the
meaning of original timestamps before assigning a timezone during migration.

The new form adds identity type, employment status, guarantor relationship and
guarantor permission confirmation. These cannot be inferred from historical rows.
