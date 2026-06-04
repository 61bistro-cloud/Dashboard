-- Account type discriminator (BANK | CREDIT_CARD)
ALTER TABLE "BankAccount" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'BANK';

-- Seed the first credit card. Idempotent — won't duplicate if re-run.
INSERT INTO "BankAccount" ("code", "name", "icon", "color", "sortOrder", "active", "accountType")
VALUES ('KBANK_CREDIT', 'KBANK Master Card', '💳', 'amber', 10, true, 'CREDIT_CARD')
ON CONFLICT ("code") DO UPDATE SET "accountType" = 'CREDIT_CARD';
