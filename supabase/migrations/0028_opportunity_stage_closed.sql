-- New opportunity stages for the automatic stage rule (0029). Added on their
-- own because Postgres can't use a new enum value in the same transaction
-- that adds it. The old 'quote_accepted' / 'po_received' values stay in the
-- type (enum values can't easily be removed) but are no longer used.

alter type public.opportunity_stage add value if not exists 'closed_won';
alter type public.opportunity_stage add value if not exists 'closed_lost';
