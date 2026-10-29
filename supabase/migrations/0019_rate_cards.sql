-- Rate cards: a list of line items with standard prices, used when adding
-- lines to a quote.
--
--   line_items        — the master list of things that can go on a quote
--                       (line type + part code, e.g. "DS-L1-DEPLOY").
--                       Seeded from the part codes already used on quotes.
--   rate_cards        — one Default card plus any number of custom cards.
--   rate_card_prices  — a card's unit cost for a line item. A custom card only
--                       needs prices that differ; anything it doesn't price
--                       falls back to the Default card's price.
--   accounts.rate_card_id — the custom card an account uses; null = Default.
--   quote_lines.line_item_id — which line item a quote line came from (for
--                       reference only).
--
-- Quote lines keep their own copy of the unit cost (quote_lines.unit_cost),
-- so changing a rate card never alters a quote that's already been written.
-- Managed at Admin → Rate cards (writes need is_admin()).

-- ── Line items ──────────────────────────────────────────────────────────────
create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  line_type text not null default 'Outsource Resource',
  part_code text not null,
  description text,               -- optional default description for new quote lines
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index line_items_part_code_key on public.line_items (lower(part_code));

-- ── Rate cards ──────────────────────────────────────────────────────────────
create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create unique index rate_cards_name_key on public.rate_cards (lower(name));
create unique index rate_cards_one_default on public.rate_cards (is_default) where is_default;

create table public.rate_card_prices (
  rate_card_id uuid not null references public.rate_cards (id) on delete cascade,
  line_item_id uuid not null references public.line_items (id) on delete cascade,
  unit_cost numeric(12, 2) not null,
  primary key (rate_card_id, line_item_id)
);

create index rate_card_prices_line_item_id_idx on public.rate_card_prices (line_item_id);

-- ── Links ───────────────────────────────────────────────────────────────────
alter table public.accounts
  add column rate_card_id uuid references public.rate_cards (id) on delete set null;

comment on column public.accounts.rate_card_id is 'Custom rate card for this account; null means the Default rate card.';

alter table public.quote_lines
  add column line_item_id uuid references public.line_items (id) on delete set null;

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.line_items enable row level security;
alter table public.rate_cards enable row level security;
alter table public.rate_card_prices enable row level security;

create policy "line_items_select_staff" on public.line_items for select using (public.is_staff());
create policy "line_items_write_admin" on public.line_items
  for all using (public.is_admin()) with check (public.is_admin());

create policy "rate_cards_select_staff" on public.rate_cards for select using (public.is_staff());
create policy "rate_cards_write_admin" on public.rate_cards
  for all using (public.is_admin()) with check (public.is_admin());

create policy "rate_card_prices_select_staff" on public.rate_card_prices for select using (public.is_staff());
create policy "rate_card_prices_write_admin" on public.rate_card_prices
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Seed from existing quotes ───────────────────────────────────────────────
-- One line item per part code (spelling variants like "Logistics" /
-- "LOGISTICS" merged), using its most common spelling and line type.
insert into public.line_items (line_type, part_code)
select
  (select l2.line_type from public.quote_lines l2
   where lower(trim(l2.part_code)) = k group by l2.line_type order by count(*) desc limit 1),
  (select trim(l3.part_code) from public.quote_lines l3
   where lower(trim(l3.part_code)) = k group by trim(l3.part_code) order by count(*) desc limit 1)
from (
  select distinct lower(trim(part_code)) as k
  from public.quote_lines
  where coalesce(trim(part_code), '') <> ''
) codes;

insert into public.rate_cards (name, is_default) values ('Default', true);

-- Default prices: the most common unit cost for each item, but only where
-- there's a clear standard (used at least twice and on 25%+ of that item's
-- lines). Items priced per job (expenses, logistics, one-offs) are left
-- without a price to fill in on Admin → Rate cards.
insert into public.rate_card_prices (rate_card_id, line_item_id, unit_cost)
select (select id from public.rate_cards where is_default), li.id, m.unit_cost
from public.line_items li
join lateral (
  select l.unit_cost, count(*) as n,
         (select count(*) from public.quote_lines x where lower(trim(x.part_code)) = lower(li.part_code)) as uses
  from public.quote_lines l
  join public.quotes q on q.id = l.quote_id
  where lower(trim(l.part_code)) = lower(li.part_code)
  group by l.unit_cost
  order by count(*) desc, max(coalesce(q.quote_date, q.created_at::date)) desc
  limit 1
) m on true
where m.n >= 2 and m.n::numeric / m.uses >= 0.25;

-- Link existing quote lines to their line item, for reference.
update public.quote_lines ql
set line_item_id = li.id
from public.line_items li
where lower(trim(ql.part_code)) = lower(li.part_code);
