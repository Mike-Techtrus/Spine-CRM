-- Postal address on contractor and staff profiles (Users → click a name →
-- Details). Split into lines so a postcode can be searched or exported on its
-- own later. All optional.

alter table public.field_engineers
  add column address_line_1 text,
  add column address_line_2 text,
  add column city text,
  add column postcode text;
