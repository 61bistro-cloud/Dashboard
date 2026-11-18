# Grab report comparison

Open **Bank & Reconciliation → Grab summary**, choose the sales month, select the original UTF-8 Grab CSV and preview it. Check the store, dates and totals, then confirm. Google Drive must be connected: originals are archived under the business root / รายงาน Grab / YYYY-MM. Importing is an explicit user action; deploying this feature does not import the sample attachment or alter financial records.

Revenue remains POS netAmount. Owner-entered Cost Setup amounts remain the cost source for Dashboard, daily/monthly P&L and business advice. Grab figures are a separate comparison. Record missing GP once under selling/marketing expenses; compare existing costs first. Net settlement is neither additional revenue nor profit. Closed P&L snapshots are unaffected by importing a comparison report.

## Supported data and validation

Version 1 supports the Thai Grab transaction CSV with settled GrabFood / ชำระเงิน / Auto-Paid rows for one store and one sales month. Refunds, cancellations, unsettled rows and other transaction types stop the entire import with an explanatory message; no partial import. Max 2 MiB and 3,000 rows. The parser supports BOM, duplicate store-name headers, RFC 4180 quoting, strict date validation and integer satang. No OCR, AI or formula evaluation.

The platform commission column includes tax in the supplied format. The separately reported fee-tax column is displayed as a component, never deducted again. Other adjustments are the residual needed to reconcile reported sales, commission and net settlement, not an inferred tax/category decision. Payout amounts use the reported row values, avoiding aggregate percentage rounding. Cash customer payments remain Auto-Paid settlements; they are not moved to store cash.

## Comparisons

- POS: Grab labels in channel/payment type take priority over customer cash/card payment. Daily customer payment totals (grandTotal) and counts are compared with pre-fee Grab sales. POS net revenue is displayed separately. Matching long references supports bill-level comparison; unique date/amount pairs are suggestions, never confirmed matches. Multiple candidates or reused bills require review. POS uses a 04:00 business-day cutoff, while Grab dates remain as stated in the source without assuming a timezone offset.
- Bank: group by merchant, store, settlement reference and transfer date across all imported reports, including cross-month orders. A suggestion needs exact date and amount plus Grab description/reference or Grab category. Candidate bank credits are restricted to owned supported bank accounts, including inactive accounts with historical data. One credit shared by multiple batches is ambiguous. The system does not persist a bank match or change categories. Partial report coverage and combined/split payouts need manual review. Bank links use the bank transaction’s fiscal month, not the sales month.
- Dashboard: a separate fiscal-year Grab block displays POS revenue, reported sales, GP, net settlement and monthly differences. It does not alter P&L formulas. Missing imports are shown as unavailable rather than known zero GP.

## Persistence and concurrency

Uses existing DriveFile storage with kind GRAB_REPORT and versioned normalized metadata in note; the Drive ID and URL always refer to the actual original uploaded file. No schema migration, seed, new financial rows or credential repurposing. Evidence/OCR workflows exclude this kind, and generic evidence removal cannot delete reports.

Transaction identity is merchant + store + long Transaction ID. Overlapping/repeated files count unchanged transactions once. Different data for an existing ID is rejected, preserving the original. A previously imported business store ID must agree. Confirm tokens bind file bytes, business, month and all existing report metadata. Serializable insertion rechecks the same revision. Concurrent changes require a new preview. Upload failure prevents metadata insertion; DB failure leaves the original in Drive and is reported as failure, without deleting originals or overwriting older reports. No report deletion/replacement UI is introduced.

## Verification

`npm run test:grab` covers parser, exact amounts/tax, unsupported files, deduplication, payout grouping, POS/bank ambiguity, tenant/role/month scope, preview confirmation, stale imports and Drive/DB failures with mocked dependencies. Optional `GRAB_TEST_FILE=/private/path/to/original.csv npm run test:grab` verifies the supplied October report: 19 rows, sales 3,959.00, GP 847.25 (tax component 55.45), net 3,111.75, 14 payout groups, including 163.49 transferred in November. Private source files are not committed.
