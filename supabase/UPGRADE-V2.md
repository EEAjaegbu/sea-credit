# Expanded applications and document uploads

For the existing Sea Credit database, run these files in the Supabase SQL Editor, in order:

1. `supabase/migrations/002-expanded-applications.sql` — new fields and tenures.
2. `supabase/migrations/003-private-documents.sql` — private document bucket and access policies.

Run the entire contents of each file. Both are safe to rerun. For a new database,
run the latest `supabase/setup.sql` instead of 002, then run 003.
Pull the complete GitHub update into StackBlitz, including both new JavaScript files.

The updated app requires schema version 2. Older app previews should also be refreshed;
they cannot submit the old month-only form after this upgrade.

## What changes

- New requests use exact tenures of 7, 14, 21, 28, 56 and 84 days.
- Existing records keep their original month-based period. They are not converted.
  Resubmitting an old request requires selecting a current tenure and completing new fields.
- Identity, banking, guarantor and employment information is saved on the application.
  The owner and authorised reviewers can read it under the existing RLS rules.
- Net income uses the existing monthly_income column; gross income is stored separately.
- BVN, identity and account numbers are masked on the detail screen by default.
  Masking is presentation only: authorised users receive these values from the database.
- LinkedIn is optional. Business registration is required for self-employed applicants.
  The form labels Passport as Passport photograph; identification has a separate category.
- Documents are attached after the application is saved. Missing categories are visible
  to the customer and reviewer; Submitted does not mean documents are complete.

## Documents

Bucket: `application-documents`, private. Paths are `user-id/application-id/category/random-id.ext`.
PDF, JPEG and PNG only, 5 MB per file. Original filenames are not stored in paths.
Uploads cannot overwrite existing files. Customers can upload/remove only while the
request is Submitted or Information needed. Reviewers can read but cannot change files.
Downloads use 60-second signed links. Treat downloaded files as untrusted attachments.

The database policies are locally tested. Actual upload/download, MIME restrictions,
and bucket configuration still require testing against the hosted Supabase Storage service.
There is no malware scanner or automated identity/bank-account verification in this build.
Use fictional records and sample files while testing. This update does not import live
Google Form customers, create loan accounts, or issue payments.

## Browser checks after applying SQL

1. Submit a fictional application for 7 days and another for 84 days.
2. Refresh and sign back in; verify fields and tenures remain.
3. Attach sample documents, including three office photographs.
4. Download an attachment as its owner and as the assigned reviewer.
5. A second customer must not be able to list, upload to or download another customer's files.
6. Mark Under review; customer upload/remove should stop. Request more information;
   customer editing should become available again.
7. Resubmit corrected information and check the review history.
8. Check an old six-month application still shows its original term.
