-- 0062: account update email tidy-ups (account_update_data, 0061).
-- * "TBC" placeholders in PO numbers and CDW OPP numbers count as blank, so
--   the email says "PO to follow" / leaves them out rather than printing TBC.
-- * Quotes past their 30 days aren't listed as awaiting a decision (their
--   opportunity still isn't listed as "preparing quote", as a quote was sent).

create or replace function public.account_update_data(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with acc as (select id, name from public.accounts where id = p_account),
  sent_quotes as (
    select q.* from public.quotes q where q.client_id = p_account and q.status = 'sent'
  ),
  paid as (
    select invoice_id, sum(payment_amount) as amount from public.payments group by invoice_id
  )
  select jsonb_build_object(
    'account', (select name from acc),
    'company', (select jsonb_build_object('name', company_name, 'address', registered_address,
                                          'company_number', company_number, 'vat_reg', vat_reg)
                from public.company_settings limit 1),
    'invoices', coalesce((
      select jsonb_agg(x order by x->>'due_date' nulls last, x->>'invoice_number')
      from (
        select jsonb_build_object(
          'invoice_number', i.invoice_number,
          'end_client', ec.name,
          'po_number', case when upper(trim(coalesce(i.po_number, ''))) in ('', 'TBC') then null else trim(i.po_number) end,
          'invoice_date', i.invoice_date,
          'due_date', i.due_date,
          'total', i.total,
          'outstanding', round(coalesce(i.total, 0) - coalesce(pd.amount, 0), 2)
        ) as x
        from public.invoices i
        left join public.accounts ec on ec.id = i.end_client_id
        left join paid pd on pd.invoice_id = i.id
        where i.client_id = p_account and i.status = 'sent'
          and coalesce(i.total, 0) - coalesce(pd.amount, 0) > 0.005
      ) s), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(x order by x->>'quote_date' nulls last, x->>'quote_number')
      from (
        select jsonb_build_object(
          'quote_number', q.quote_number,
          'opportunity_name', o.name,
          'customer_opportunity_number', case when upper(trim(coalesce(o.customer_opportunity_number, ''))) in ('', 'TBC') then null else trim(o.customer_opportunity_number) end,
          'end_client', ec.name,
          'value', q.value,
          'quote_date', q.quote_date,
          'valid_until', q.quote_date + 30
        ) as x
        from sent_quotes q
        left join public.opportunities o on o.id = q.opportunity_id
        left join public.accounts ec on ec.id = q.end_client_id
        where q.quote_date is null or q.quote_date + 30 >= current_date -- past their 30 days: not shown as awaiting a decision
      ) s), '[]'::jsonb),
    'opportunities', coalesce((
      select jsonb_agg(x order by x->>'created')
      from (
        select jsonb_build_object(
          'opportunity_number', o.opportunity_number,
          'name', o.name,
          'customer_opportunity_number', case when upper(trim(coalesce(o.customer_opportunity_number, ''))) in ('', 'TBC') then null else trim(o.customer_opportunity_number) end,
          'end_client', ec.name,
          'stage', o.stage,
          'created', o.created_at::date
        ) as x
        from public.opportunities o
        left join public.accounts ec on ec.id = o.client_id
        where o.billing_account_id = p_account
          and o.is_active
          and o.stage in ('qualifying', 'quoting')
          and not exists (select 1 from sent_quotes q where q.opportunity_id = o.id)
      ) s), '[]'::jsonb),
    'awaiting_po', coalesce((
      select jsonb_agg(x order by x->>'start_date' nulls last)
      from (
        select jsonb_build_object(
          'reference', so.reference,
          'quote_number', q.quote_number,
          'opportunity_name', o.name,
          'end_client', ec.name,
          'start_date', so.start_date,
          'value', case when so.total is not null then so.total - coalesce(so.vat, 0) else coalesce(so.po_value, so.quote_value) end
        ) as x
        from public.sales_orders so
        left join public.quotes q on q.id = so.quote_id
        left join public.opportunities o on o.id = q.opportunity_id
        left join public.accounts ec on ec.id = so.end_client_id
        where so.client_id = p_account
          and so.closed_at is null
          and so.advanced_without_po
          and coalesce(upper(trim(so.po_number)), '') in ('', 'TBC')
      ) s), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(x order by x->>'reference')
      from (
        select jsonb_build_object(
          'reference', p.reference,
          'name', p.name,
          'end_client', ec.name,
          'po_number', case when upper(trim(coalesce(so.po_number, ''))) in ('', 'TBC') then null else trim(so.po_number) end,
          'days_ordered', (select coalesce(sum(l.quoted_days), 0) from public.project_lines l where l.project_id = p.id),
          'days_used', (
            select coalesce(sum(public.day_type_days(t.day_type)), 0)
            from public.timesheet_entries t
            join public.project_assignments a on a.id = t.project_assignment_id
            join public.project_lines l on l.id = a.project_line_id
            where l.project_id = p.id and t.status in ('submitted', 'approved')
          ),
          'end_date', so.end_date
        ) as x
        from public.projects p
        join public.sales_orders so on so.id = p.sales_order_id
        left join public.accounts ec on ec.id = so.end_client_id
        where so.client_id = p_account and p.status = 'active'
      ) s), '[]'::jsonb)
  );
$$;

