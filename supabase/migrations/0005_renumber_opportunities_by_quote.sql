-- Renumber opportunities so TECHOPP# order follows Quote # order, rather
-- than created_at (which could default to the migration's own run time for
-- any quote that had no "Quote Sent" date in the original spreadsheet, and
-- so didn't reflect real chronological order).
--
-- An opportunity's position is keyed off its earliest linked quote number
-- (quote numbers are fixed-width "T" + 5 digits, so a plain text MIN/ORDER
-- BY sorts them correctly). The unique constraint is dropped for the bulk
-- renumber (a straight UPDATE can't reliably permute a column that's
-- immediately-unique without hitting transient collisions) and re-added
-- once every row has its new number.

begin;

alter table public.opportunities drop constraint opportunities_opportunity_number_key;

update public.opportunities o
set opportunity_number = 'TECHOPP' || (9999 + sub.rn)
from (
  select o2.id, row_number() over (order by rq.rep_quote, o2.id) as rn
  from public.opportunities o2
  join (
    select opportunity_id, min(quote_number) as rep_quote
    from public.quotes
    where opportunity_id is not null
    group by opportunity_id
  ) rq on rq.opportunity_id = o2.id
) sub
where o.id = sub.id;

alter table public.opportunities add constraint opportunities_opportunity_number_key unique (opportunity_number);

select setval(
  'public.opportunity_number_seq',
  (select count(*) from public.opportunities) + 9999,
  true
);

commit;
