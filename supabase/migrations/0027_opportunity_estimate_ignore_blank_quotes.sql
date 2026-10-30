-- Fix to 0026: accepted quotes with no Value are ignored, and an opportunity
-- whose accepted quotes all lack a Value keeps its estimate (0026 summed blank
-- values as £0, which set TECHOPP10330's estimate to £0.00).

create or replace function public.recalc_opportunity_estimate(opp_id uuid)
returns void
language sql
as $$
  update public.opportunities o
  set estimated_value = t.accepted_value
  from (
    select sum(value) as accepted_value
    from public.quotes
    where opportunity_id = opp_id and status = 'accepted' and value is not null
    having count(*) > 0
  ) t
  where o.id = opp_id
    and o.estimated_value is distinct from t.accepted_value;
$$;
