# OCR and free-model document screening

## Activation

In Vercel **Production** environment variables set `OPENROUTER_API_KEY` and an explicit comma-separated `OPENROUTER_BUSINESS_IDS` allowlist (`2` is OK Katsu Curry). Redeploy after changing variables. The default model is `openrouter/free`; optional `OPENROUTER_MODEL` must be that router or an ID ending in `:free`. Never use `NEXT_PUBLIC_` and never paste keys in chat or document notes. The owner-only Google/LINE settings page shows configuration status and offers a synthetic-text connection test that sends no real customer document.

A missing key or a business outside the allowlist never sends OCR to OpenRouter. The model catalog is checked before each request: prompt/completion/request prices must be zero. The request limits provider prices to zero, disables provider fallback, asks to deny provider data collection, uses no tools, and has bounded text/output/time limits. There is **no paid fallback**. A routing, quota, authentication, policy or output-format failure leaves the document for human review. Free-model availability and provider policies may change; setting `data_collection=deny` is a routing preference, not a universal guarantee of no service logging. Redaction is heuristic, not complete anonymization. Review OpenRouter account and provider privacy settings before opting in a business.

## Workflow and data boundaries

1. LINE signature verification returns promptly; storage and screening run in `after()`, up to the function's 300-second budget.
2. Each original is saved in Drive and a scoped DriveFile record before OCR/AI. Exact byte hashes suppress repeated uploads in the same business. Message IDs use filename boundaries, avoiding ID-prefix collisions.
3. Image QR data is decoded locally where supported (JPEG/PNG) and only its SHA-256 is stored. A matching QR is a review signal, never proof of duplicate payment or authenticity; merchant QRs can be shared. PDF QR extraction is not implemented; PDFs use OCR.
4. Existing Google Drive OCR is cached. Clear deterministic rules avoid AI calls. Otherwise only redacted OCR text is sent; original images, business credentials and bank transaction collections are not sent to OpenRouter.
5. Structured AI results must match a strict schema and cite exact substrings of the redacted source. Dates and amounts must be supported by those quotes. Conflicts and unsupported fields remain for review. AI confidence is not used to approve records. A model can still misunderstand source meaning, so this is always a suggestion.
6. Same payment references (across receipt/slip files) and shared QRs are flagged for joint review. Original records are not merged or deleted. Existing matching supports several evidence files linked to one bank transaction. Business relevance and document month require human review.

Only evidence metadata is written by this pipeline (`DOCUMENT_REVIEW_V1` and cached `EVIDENCE_OCR_V1` in DriveFile.note). It never writes bank categories, evidence links, POS, payroll, manual costs or closings. AI suggestions do not replace cached OCR fields used by the existing rule-based bank automation. The existing explicit bank automation button is separate and unchanged. “Use suggestions to search” only fills browser fields; owners must confirm the bank match and category through the existing controls. Monthly manually entered cost totals must not be incremented from receipts, which could double count previously entered costs.

## Queue and retries

Pending/processing/failed state is stored durably in the evidence note, with attempts, source hash, timestamp and retry time. A compare-and-swap note claim prevents concurrent jobs from overwriting user edits; live leases last two minutes. OCR failures back off, and three background failures require human review. Cached OCR is retained on later failures. Neither temporary AI unavailability nor an OCR failure deletes the original. The LINE background worker processes saved files within its time budget; remaining work stays queued. No persistent queue table or schema migration is required.

In Bank & Reconcile -> evidence, each file has a screening/retry button, quoted sources, warnings and suggested classification. The month button runs one scoped request per document while the page remains open. Old uploads are not processed by a deployment: an owner/accountant explicitly starts a backfill.

For unattended recovery when no new LINE messages arrive, an optional authenticated endpoint is available: `GET /api/evidence/process-queue`, header `Authorization: Bearer <CRON_SECRET>`. Set a long random `CRON_SECRET` server-side and configure an external/Vercel scheduler appropriate to the hosting plan. No schedule is enabled automatically. Each run processes up to three queued/expired/failed jobs, bounded to the function duration, and returns counts only. Provider-unavailable review results are retained for an explicit retry, not repeatedly resubmitted in a quota loop.

## Verification

`npm run test:documents` tests grounding, Buddhist-year conversion, redaction, free-only requests, quota failures, wrong-business rejection, queue leases and concurrent edits with synthetic data. LINE tests verify storage-before-screening and redelivery behavior. Client-boundary tests include the screening UI to prevent database modules leaking into browser bundles. Real-model activation must be tested with the synthetic button after Production variables are configured; mock tests cannot prove that a particular free endpoint is available. No production backfill, seed or migration is part of deployment.
