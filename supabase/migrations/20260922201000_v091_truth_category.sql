-- Solpient Money V0.9.1 — preserve raw categories while applying user rules

alter table public.transactions
  add column if not exists truth_category text;

comment on column public.transactions.truth_category is
  'Derived category from a household Truth Engine rule. Raw imported category remains unchanged.';
