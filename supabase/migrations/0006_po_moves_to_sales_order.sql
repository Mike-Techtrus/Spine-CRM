-- Move the PO decision from Opportunity to Sales Order.
--
-- A PO (or the explicit decision to proceed without one) only makes sense once
-- a Quote has been accepted and is being turned into a Sales Order — not while
-- the deal is still an Opportunity. The opportunity-level po_number also just
-- duplicated what already lives properly on the Sales Order (reached via its
-- Quote), so it's dropped rather than moved. exception_approval_notes /
-- exception_approved_by were never wired into the UI, so they're dropped too
-- rather than carried forward.

alter table public.opportunities
  drop column po_number,
  drop column po_received,
  drop column advanced_without_po,
  drop column exception_approval_notes,
  drop column exception_approved_by;

-- Sales Orders already carry po_number / po_received_date (the "provided a
-- PO" path). Add the other half of the choice: proceeding without one, plus
-- somewhere to record why/who approved that.
alter table public.sales_orders
  add column advanced_without_po boolean not null default false,
  add column exception_notes text;
