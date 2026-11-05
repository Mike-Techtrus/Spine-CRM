-- 0055: Price builder workings saved on the quote.
--
-- The quote page's Price builder (roles, days, sell and cost rates, expenses,
-- how expenses are charged) works out profit and fills the quote lines. Its
-- workings are kept here so they can be reopened and adjusted later. Staff
-- only (same RLS as the rest of the quote), never printed. Null = the
-- builder hasn't been used on this quote. Shape: PriceBuilderState in
-- src/lib/priceBuilder.ts.

alter table public.quotes add column if not exists price_builder jsonb;

comment on column public.quotes.price_builder is
  'Price builder workings (PriceBuilderState in src/lib/priceBuilder.ts); internal, never printed.';
