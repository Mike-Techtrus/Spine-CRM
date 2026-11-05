-- 0056: standard contractor cost per day for each rate-card role.
--
-- What Techtrus usually pays a contractor per day at each level, set in
-- Admin → Rate cards. One per line item (not per rate card — what we pay
-- doesn't depend on the client). Used for margin before anyone is named:
--   * the quote Price builder's starting Cost / day for a role;
--   * project planned margin for quoted days not yet allocated to a person.
-- Once a person is allocated on a project, their own cost rate is used
-- (project_assignments.cost_rate, 0041). Internal — never printed.

alter table public.line_items add column if not exists standard_cost numeric(10, 2)
  check (standard_cost is null or standard_cost >= 0);

comment on column public.line_items.standard_cost is
  'Standard contractor cost per day for this role (internal; for margin before a person is named).';

-- Mike's standard rates, Nov 2026.
update public.line_items set standard_cost = 180 where part_code = 'L1 Engineer';
update public.line_items set standard_cost = 210 where part_code = 'L2 Engineer';
update public.line_items set standard_cost = 230 where part_code = 'L3 Engineer';
update public.line_items set standard_cost = 250 where part_code = 'L4 Engineer';
