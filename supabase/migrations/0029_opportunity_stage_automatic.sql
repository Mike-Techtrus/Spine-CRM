-- Opportunity stage is worked out from its quotes instead of being picked:
--   no quotes                                  → qualifying
--   any accepted quote                         → closed_won
--   otherwise any quote still draft or sent    → quoting
--   otherwise (every quote expired or declined) → closed_lost
-- Kept current whenever a quote is added, changes status, moves to another
-- opportunity or is deleted; new opportunities start at qualifying.

create or replace function public.opportunity_stage_from_quotes(opp_id uuid)
returns public.opportunity_stage
language sql
stable
as $$
  select case
    when count(*) = 0 then 'qualifying'
    when count(*) filter (where status = 'accepted') > 0 then 'closed_won'
    when count(*) filter (where status in ('draft', 'sent')) > 0 then 'quoting'
    else 'closed_lost'
  end::public.opportunity_stage
  from public.quotes
  where opportunity_id = opp_id;
$$;

create or replace function public.recalc_opportunity_stage(opp_id uuid)
returns void
language sql
as $$
  update public.opportunities
  set stage = public.opportunity_stage_from_quotes(opp_id)
  where id = opp_id
    and stage is distinct from public.opportunity_stage_from_quotes(opp_id);
$$;

create or replace function public.quotes_recalc_opportunity_stage()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.opportunity_id is not null then
    perform public.recalc_opportunity_stage(old.opportunity_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.opportunity_id is not null
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.opportunity_id is distinct from old.opportunity_id) then
    perform public.recalc_opportunity_stage(new.opportunity_id);
  end if;
  return null;
end;
$$;

create trigger quotes_recalc_opportunity_stage
  after insert or update or delete on public.quotes
  for each row execute function public.quotes_recalc_opportunity_stage();

-- Whatever the app sends, an opportunity's stage always matches its quotes.
create or replace function public.opportunities_set_stage()
returns trigger
language plpgsql
as $$
begin
  new.stage := case when tg_op = 'INSERT' then 'qualifying'::public.opportunity_stage
                    else public.opportunity_stage_from_quotes(new.id) end;
  return new;
end;
$$;

create trigger opportunities_set_stage
  before insert or update of stage on public.opportunities
  for each row execute function public.opportunities_set_stage();

-- Backfill every opportunity.
update public.opportunities o
set stage = public.opportunity_stage_from_quotes(o.id)
where o.stage is distinct from public.opportunity_stage_from_quotes(o.id);
