-- Backfill transaction time into the date timestamp for rows imported before
-- we stored time. KBANK descriptions begin with "HH:MM " (e.g. "13:51 ชำระเงิน"),
-- so lift that into the date so the list sorts chronologically.
-- Only touches rows still at 00:00 to avoid double-applying. SCB rows have no
-- time prefix and are left unchanged.
UPDATE "BankTransaction"
SET "date" = "date" + (substring("description" from '^[0-9]{1,2}:[0-9]{2}'))::interval
WHERE "description" ~ '^[0-9]{1,2}:[0-9]{2}'
  AND EXTRACT(HOUR FROM "date") = 0
  AND EXTRACT(MINUTE FROM "date") = 0;
