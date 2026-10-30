-- Opportunity "Estimated value" follows its accepted quotes.
--
-- Once an opportunity has at least one accepted quote, estimated_value is the
-- sum of those quotes' Value (before VAT — what estimates already matched for
-- 341 of 366 opportunities). Kept current whenever a quote is accepted or
-- un-accepted, its value changes, it moves to another opportunity, or it's
-- deleted. With no accepted quotes, the estimate is left as typed (it can be
-- blank while an opportunity is still being worked up).

create or replace function public.recalc_opportunity_estimate(opp_id uuid)
returns void
language sql
as $$
  update public.opportunities o
  set estimated_value = t.accepted_value
  from (
    select sum(coalesce(value, 0)) as accepted_value
    from public.quotes
    where opportunity_id = opp_id and status = 'accepted'
    having count(*) > 0
  ) t
  where o.id = opp_id
    and o.estimated_value is distinct from t.accepted_value;
$$;

create or replace function public.quotes_recalc_opportunity_estimate()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.opportunity_id is not null then
    perform public.recalc_opportunity_estimate(old.opportunity_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.opportunity_id is not null
     and (tg_op = 'INSERT' or new.status is distinct from old.status or new.value is distinct from old.value
          or new.opportunity_id is distinct from old.opportunity_id) then
    perform public.recalc_opportunity_estimate(new.opportunity_id);
  end if;
  return null;
end;
$$;

create trigger quotes_recalc_opportunity_estimate
  after insert or update or delete on public.quotes
  for each row execute function public.quotes_recalc_opportunity_estimate();

-- Backfill every opportunity that has accepted quotes.
update public.opportunities o
set estimated_value = t.accepted_value
from (
  select opportunity_id, sum(coalesce(value, 0)) as accepted_value
  from public.quotes
  where status = 'accepted' and opportunity_id is not null
  group by opportunity_id
) t
where o.id = t.opportunity_id
  and o.estimated_value is distinct from t.accepted_value;
