# Customer onboarding and isolation

## Operator workflow

Open **Manage users → Add trial customer — new business**. Enter a new customer’s business name, Google-account email and optional display name, review and confirm. The customer uses `/sign-in` at the same site and chooses that exact Google account. No app password or automatic email is created/sent. The old-user form is a separate, collapsed panel requiring an explicit existing-business selection; never use the owner’s original business as a template for a trial customer.

Provisioning creates one new Business, one OWNER User, one UserBusiness link and standard empty transaction categories atomically. No existing user is repurposed, and no financial rows, bank accounts, employee/supplier masters, Google/LINE secrets, Drive folders or files are copied. Duplicate email, invalid input or any failed step rolls back. There is no automatic trial expiry or billing policy in this change. Pause a business to stop customer access while retaining data; revoking a user removes access links rather than deleting the User and cascading their import audit.

Google Workspace/custom-domain Google accounts are supported, not only Gmail. The identity must come from Google with a verified matching email, and the account must be provisioned with an active business. If the OAuth app is in Google Cloud testing and Google blocks a customer, add that address as a test user or complete the applicable publishing configuration. Do not add customers to SYSTEM_ADMIN_EMAILS or SYSTEM_ADMIN_USER_IDS. Real Google login for the five customers still requires their actual addresses; automated tests use synthetic identities and never create customer records in production.

## Permission boundary

- OWNER now means owner of explicitly assigned businesses. ACCOUNTANT and STAFF keep their scoped memberships.
- System-administrator access is a separate, server-computed session flag. The three existing global OWNER identities were explicitly frozen in `lib/system-admin-policy.ts` from the read-only pre-change audit, preserving operator access without modifying existing records. This is a fixed identifier allowlist, not a time-based/first-user/no-membership heuristic. New OWNER IDs never inherit it. Set SYSTEM_ADMIN_USER_IDS to replace the legacy list; SYSTEM_ADMIN_EMAILS is the explicit operator-only bootstrap allowlist. The legacy AUTH_GOOGLE_OWNER_EMAILS setting no longer grants new global access, preventing a deleted/recreated customer email from regaining old operator privileges. Stored role must also be OWNER. Identifiers are not authentication credentials.
- Every JWT request reloads user role and active membership from the database. Deletion, revocation, business deactivation and role changes affect existing sessions on their next authenticated request. Client-supplied role/admin flags are not trusted.
- Global user/business pages, navigation and server actions require system-administrator access. Customer owners can manage their own shop’s financial and integration pages, and cannot grant themselves another business.
- The selected business cookie is checked against current memberships; a forged/stale selection fails closed. An absent selection chooses the first accessible business. When testing a second account on the same browser, choose its own business if an old selection remains, or use a private browser window. No automatic fallback to another business occurs during financial operations.

## Storage and integrations

Financial records remain in the existing shared database with businessId scoping and server-side authorization. This is application-level tenant separation, not separate databases or PostgreSQL row-level security. Calendar metadata is shared; financial rows and integration configurations are owned by each business. Data-safety snapshots before/after deployment are local read-only verification artifacts, not a new scheduled backup/PITR service.

Google Drive/Sheets must be connected separately for each shop. OAuth uses a one-time, expiring, HTTP-only-cookie state bound to the current user/business; switching business or forging state rejects the callback before exchanging/storing tokens. LINE configuration rejects secrets/tokens already used by another business. A webhook matching more than one business fails closed instead of delivering a document to the first match. Shared LINE OA routing across customers is not supported by this release.

Record attachments validate the current business, record ID and selected month before uploading or linking evidence. Existing financial action ownership checks remain in force. No migrations or production seed scripts are needed. Deployment itself performs no data initialization.

## Checks

`npm run test:tenants` verifies Google identity gates, live role/membership refresh, legacy operator preservation, two independent OWNER tenants, forged business cookies, denied global pages/actions, five isolated customer provisions in a mocked transaction, rollback/duplicate handling, access revocation without financial deletion, scoped attachments and Drive/LINE protection. Existing financial/bank/evidence regression suites still run in CI. Browser fixtures exercise review/confirmation, error retention, next-customer entry and customer/operator navigation in both languages, themes and widths without production writes.
