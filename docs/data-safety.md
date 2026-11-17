# Financial data release safety

## Findings, 17 November 2026

The read-only audit covered all financial/master-data tables in one repeatable-read Neon transaction. At the baseline there were 788 bank transactions, 1,658 POS bills, 31 payroll entries, 10 supplier purchases, 55 fixed-cost entries and 99 evidence records. There were no tenant ownership mismatches, bank-date/month mismatches or transactions on hidden accounts. There were no monthly closings. This is a baseline, not proof that earlier releases never deleted records: historical audit logs and provider restore history were not available.

Build and postinstall run Prisma **generate**, never seed or migrations. The legacy sample seed does overwrite amounts and delete sample bank transactions; there is no evidence that a previous deployment ran it. It is now blocked before opening a Prisma client unless both connections are local and the environment is not production/Vercel.

A change from statement-derived costs to owner-entered costs was explicitly requested for all months. That changes live report amounts without deleting the underlying statement rows. Keep that policy stable; do not silently change it during UI/bug work. Frozen closings retain their own snapshots.

Concurrent changes were observed before this release was deployed (POS imports and owner-entered costs). The user confirmed they were actively editing/importing. They were retained, not automatically restored. Before/after differences must therefore be checked against user activity, rather than attributed to a deploy from counts alone.

## Enforced protections

- Production writes through the deployed app remain available. Remote database writes from local/non-Vercel app processes are rejected by the Prisma query extension; normal reads remain available. This protects accidental app writes, not privileged direct SQL or database administrators.
- Preview startup fails unless `DATABASE_ENVIRONMENT=preview` and `PREVIEW_DATABASE_HOST` exactly matches the connected hostname. Use a **separate Neon branch/database**, never the production credentials. Optionally set `PRODUCTION_DATABASE_HOST` to reject that hostname explicitly. Do not label a production connection as preview.
- `npm run db:seed` / `npm run db:push` are restricted to local connections. Direct database administration commands remain privileged manual operations.
- Pages and server actions reject an invalid/stale selected business instead of falling back to a different first-accessible business. The user can reselect an accessible business, including when only one remains.
- Payroll and manual cost plans check the rendered business, current revision and ownership in a serializable transaction. A second stale tab must reload rather than overwrite a newer save. Cost saves reject finalized months; reopening is an explicit closing action. Legacy supplier/fixed-cost endpoints now validate ownership before upserts. Invalid numeric strings are rejected, not converted to zero.
- POS imports validate the rendered business and role, and save all bill chunks plus their batch metadata in one serializable transaction. A later-chunk failure rolls back the complete file instead of leaving a partial import.
- Automated CI checks data safety, tenant/rollback behavior, manual cost calculations, bank imports and evidence flows. CI reports failures; Vercel's existing automatic production deployment is **not** configured to wait for GitHub Actions. Until deployment gating is configured, run the full checks before updating `main`.

## Read-only release snapshot / comparison

Run from the repository with an environment containing the intended connection; never commit credentials or snapshots:

```sh
node --env-file=.env --use-env-proxy scripts/data-integrity.mjs /private/outside-repo/before.json
# Run tests/build, deploy the same tested commit, then:
node --env-file=.env --use-env-proxy scripts/data-integrity.mjs /private/outside-repo/after.json /private/outside-repo/before.json
```

The tool forces a read-only repeatable-read transaction, verifies `transaction_read_only`, records rows and SHA-256 per table plus totals per business/month, and checks ownership, hidden accounts and bank-date alignment. Files are created without overwriting, with mode 0600; newly created directories use 0700. Exit 2 means records changed: inspect the private before/after snapshots, including legitimate user activity; do not assume deletion and do not auto-restore. Exit 1 means verification failed. No writes/restore SQL are executed. Treat these files as sensitive financial records.

Snapshots intentionally exclude user credentials and business integration tokens. They are local financial recovery/reference copies, **not** a complete disaster-recovery backup. The 17 November copies are outside the Git repository at `/workspace/private-backups/release-safety-20261117/` and may not survive environment loss.

## Remaining provider/operational work before onboarding customers

Configure Neon point-in-time recovery retention and encrypted scheduled backups in a separate durable location; test restoration into an isolated database and verify table counts/totals there. This needs access to the database provider/control plane; a SQL runtime connection cannot configure or prove it. Do not restore into production as a test.

Create the isolated preview branch and set preview-only Vercel environment variables above, then gate production deployment on successful CI. New durable audit-log/trash tables, immutable import provenance and schema-level tenant constraints need a separately reviewed migration; none is run automatically in this change. Until those exist, do not claim full edit history, universal closed-period locking across every endpoint, a customer-facing recycle bin, scheduled backups or a proven recovery time.

For an incident: stop the affected write path, take a new read-only snapshot, identify exact business/month/IDs and compare authoritative sources. If data was deleted, prepare a scoped recovery from provider history/private backup and review it before applying. Rolling back application code does not restore deleted database rows.
