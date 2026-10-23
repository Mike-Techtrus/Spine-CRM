-- When a draft quote is deleted and it was the most recently issued
-- number (i.e. nothing newer has been created since), hand that number
-- back so the next quote created reuses it instead of leaving a gap.
-- Only ever rolls the sequence BACKWARDS by exactly one, and only when the
-- deleted quote's number is still the sequence's current value — so it's
-- safe even if several people are creating/deleting quotes concurrently:
-- if anything newer has been created in the meantime, the numbers won't
-- match and nothing is reclaimed.

create or replace function public.reclaim_quote_number()
returns trigger
language plpgsql
as $$
declare
  deleted_num bigint;
  current_val bigint;
begin
  if old.quote_number ~ '^T[0-9]+$' then
    deleted_num := substring(old.quote_number from '[0-9]+')::bigint;
    select last_value into current_val from quote_number_seq;
    if deleted_num = current_val then
      perform setval('quote_number_seq', current_val - 1);
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists quotes_reclaim_number on public.quotes;

create trigger quotes_reclaim_number
after delete on public.quotes
for each row execute function public.reclaim_quote_number();
