# Bangkok Bank savings statement support

Add **Bangkok Bank** in Bank & Reconciliation → Account management. Canonical account code is BBL; further accounts use BBL2, BBL3, etc. Exact legacy generic account names กรุงเทพ / ธนาคารกรุงเทพ are recognized. Custom unsupported bank codes remain rejected. No accounts or transactions are created during deployment.

Upload the original PDF, enter its password, review and explicitly confirm. The supplied Bangkok Bank file uses the account holder’s date of birth as its PDF password. Passwords are never persisted in the database or committed in source code.

The parser uses the English table headers (the Thai font can contain private-use glyphs). It reads withdrawal/deposit/balance by column position, preserves Via and cheque references, excludes B/F and C/F checkpoints from transaction rows, and keeps transaction time null because the source does not show one. The statement-generation time in the footer is not a transaction time. Both debit and credit columns may use TRF. PROMPTPAY, so direction is not inferred from labels.

Every running balance and printed debit/credit counts and totals must reconcile, including across page boundaries. Inconsistent or truncated files fail as a whole. The Bangkok Bank brand and its table signature are both required so counterparty bank names do not override another supported bank’s issuer.

Like KTB, multi-month BBL files show only rows from the selected fiscal month with an explicit selected/total notice. The selected month’s opening is derived from its first transaction; other-month rows cannot be confirmed into that month. Existing role, tenant, account, month, explicit confirmation and re-import checks remain. Cost Setup and P&L accounting policies are unchanged.

Verification: `npm run test:bank`, `npm run test:accounts`, `npm run test:i18n`, `npm run test:client`, build and browser fixtures. Optional private-file test uses BBL_TEST_PDF and BBL_TEST_PASSWORD or BBL_TEST_PASSWORD_FILE. The supplied PDF has three pages, 93 transactions (70 debits / 23 credits), opening 148.25, withdrawals 53,980.53, deposits 56,251.00, and final balance 2,418.72. October has 61 rows ending 0.01; November has 32 rows opening 0.01. All row balances reconcile. There are no duplicate date/amount/balance/description signatures in this attachment. Original PDFs, passwords and extracted private text are excluded from commits.
