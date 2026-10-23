-- Adds "expired" as a quote status. Run this migration on its own (as a
-- separate "Run" in the SQL Editor, not combined with 0008) — Postgres
-- doesn't allow a newly added enum value to be used by another statement
-- in the same transaction/script.
alter type quote_status add value if not exists 'expired';
