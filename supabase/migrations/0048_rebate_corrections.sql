-- Rebate corrections after checking against CDW credit note CN78 (Q3 2026,
-- Mike's manual spreadsheet, Nov 2026).
--
-- 1. Bundled expenses vary by ROLE, not just by job. On BHFT quotes each line
--    is that role's CDW rate + expenses (e.g. INV12361: PM £535 + £356.16,
--    PCO £400 + £316.16, L2 £325 + £181.16). 0047 used one amount per job
--    (£181.16 / £123.82); this replaces it with price − the role's rate-card
--    rate for the BHFT quotes T11448, T11427, T11423, T11421, T11436 and also
--    T11408 (BHFT, Dec 2025 — its invoice INV12348 is on CN78). Their invoice
--    lines use the role named in the line description (PM1 £535, PCO £400,
--    Team Lead / L4 £535, L3 £400, L2 £325, L1 £250).
--    The other 0047 amounts (ARM £72, Gloucestershire £224, CPFT, T11451 £20)
--    were confirmed by CN78 or don't vary by role, and are unchanged.
-- 2. Invoice lines had no line type (1,913 of 1,920), so expense lump lines
--    ("SERVICE EXPENSES", packaging) counted as earning rebate in the report.
--    Each takes the line type of its quote's line at the same price (when
--    that's unambiguous), then keywords: EXPENSE / PACKAGING → Expenses;
--    ENGINEER / PROJECT / CONSULTANT / TEAM LEAD / COORDINATOR → Outsource Resource.
-- 3. CDW's rebate quarter is by PAYMENT RECEIVED date. Spine had almost no
--    payments recorded, so the 14 invoices on CN78 get a payment for their
--    full total on the date in the spreadsheet; INV12361–12363 (still "Sent")
--    become Paid.
--
-- Checked in a rolled-back run: with these, all 14 CN78 invoices match the
-- spreadsheet exactly (total £11,562.75 when rounded once at the end).

begin;

set local spine.skip_audit = 'on';

-- ── 1. Bundled expenses by role ─────────────────────────────────────────────

update public.quote_lines ql
set expenses_included = round(ql.unit_cost - p.unit_cost, 2)
from public.quotes q, public.rate_card_prices p, public.rate_cards rc
where q.quote_number in ('T11408', 'T11421', 'T11423', 'T11427', 'T11436', 'T11448')
  and ql.quote_id = q.id
  and p.line_item_id = ql.line_item_id and rc.id = p.rate_card_id and rc.is_default
  and ql.line_type in ('Resource', 'Outsource Resource')
  and ql.unit_cost > p.unit_cost;

update public.invoice_lines il
set expenses_included = round(il.unit_price - v.rate, 2)
from (
  select il2.id,
    case
      when il2.description ilike '%PROJECT MANAGER%' then 535
      when il2.description ilike '%COORDINATOR%' or il2.description ilike '%CO-ORDINATOR%' then 400
      when il2.description ilike '%TEAM LEAD%' then 535
      when il2.description ilike '%L4%' then 535
      when il2.description ilike '%L3%' then 400
      when il2.description ilike '%L2%' then 325
      when il2.description ilike '%L1%' then 250
    end as rate
  from public.invoice_lines il2
  join public.invoices i on i.id = il2.invoice_id
  join public.quotes q on q.id = i.quote_id
  where q.quote_number in ('T11408', 'T11421', 'T11423', 'T11427', 'T11436', 'T11448')
) v
where v.id = il.id and v.rate is not null and il.unit_price > v.rate;

-- ── 2. Line types on invoice lines ──────────────────────────────────────────

update public.invoice_lines il
set line_type = m.line_type
from (
  select il2.id, min(ql.line_type) as line_type
  from public.invoice_lines il2
  join public.invoices i on i.id = il2.invoice_id
  join public.quote_lines ql on ql.quote_id = i.quote_id and abs(ql.unit_cost - il2.unit_price) < 0.005
  where il2.line_type is null
  group by il2.id
  having count(distinct ql.line_type) = 1
) m
where m.id = il.id;

update public.invoice_lines set line_type = 'Expenses'
where line_type is null and (description ilike '%EXPENSE%' or description ilike '%PACKAGING%');

update public.invoice_lines set line_type = 'Outsource Resource'
where line_type is null and description ~* '(ENGINEER|PROJECT|CONSULTANT|TEAM LEAD|COORDINATOR|CO-ORDINATOR)';

-- ── 3. Payments received for the CN78 invoices ──────────────────────────────

set local spine.skip_audit = 'off';

with paid(invoice_number, paid_on) as (values
  ('INV12348', date '2026-07-10'), ('INV12350', date '2026-07-10'), ('INV12351', date '2026-07-10'),
  ('INV12352', date '2026-07-10'), ('INV12354', date '2026-07-31'), ('INV12355', date '2026-08-21'),
  ('INV12356', date '2026-07-31'), ('INV12357', date '2026-07-31'), ('INV12358', date '2026-09-18'),
  ('INV12359', date '2026-08-28'), ('INV12360', date '2026-08-28'), ('INV12361', date '2026-09-30'),
  ('INV12362', date '2026-09-30'), ('INV12363', date '2026-09-30')
)
insert into public.payments (reference, invoice_id, payment_date, original_amount, remaining_amount, payment_amount)
select 'PAY-CN78-' || i.invoice_number, i.id, p.paid_on, i.total, 0, i.total
from paid p
join public.invoices i on i.invoice_number = p.invoice_number
where not exists (select 1 from public.payments x where x.invoice_id = i.id);

update public.invoices set status = 'paid'
where invoice_number in ('INV12361', 'INV12362', 'INV12363') and status = 'sent';

commit;
