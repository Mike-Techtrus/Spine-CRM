-- Opportunity numbering: Spine CRM gets its own unique opportunity number
-- (TECHOPP10000, TECHOPP10001, ...), independent of whatever number the
-- customer's own system assigns (e.g. CDW's "OPP#" from the historical
-- spreadsheet) — that's now its own field, not conflated with ours.
--
-- An opportunity is the first thing created in the pipeline, so it's the
-- only record in the chain that gets a fully sequential, human-assigned-
-- feeling number rather than a padded counter — matching how Mike wants
-- these referenced day to day.

create sequence public.opportunity_number_seq start with 10000;

alter table public.opportunities
  add column opportunity_number text,
  add column customer_opportunity_number text,
  add column opportunity_owner text;

-- Backfill existing rows in creation order, so the earliest opportunities
-- get the lowest numbers. A no-op on a fresh database (nothing to number).
update public.opportunities o
set opportunity_number = 'TECHOPP' || (9999 + sub.rn)
from (
  select id, row_number() over (order by created_at, id) as rn
  from public.opportunities
) sub
where o.id = sub.id
  and o.opportunity_number is null;

-- Advance the sequence past whatever was just backfilled so new rows
-- continue the count rather than colliding with it. (On an empty table
-- this sets the sequence to its own starting point — a no-op.)
select setval(
  'public.opportunity_number_seq',
  greatest(9999, (select count(*) from public.opportunities) + 9999),
  true
);

alter table public.opportunities
  alter column opportunity_number set default ('TECHOPP' || nextval('public.opportunity_number_seq')::text),
  alter column opportunity_number set not null,
  add constraint opportunities_opportunity_number_key unique (opportunity_number);

create index opportunities_customer_opportunity_number_idx
  on public.opportunities (customer_opportunity_number);
