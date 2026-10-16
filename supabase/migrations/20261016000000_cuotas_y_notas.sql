-- Edición 2027: pagos en cuotas (seña + cuotas hasta el 15/12) y notas de
-- las aplicaciones a Platino / pedidos de contacto.
alter table public.event_registrations
  add column if not exists payment_plan text not null default 'unico',
  add column if not exists installments integer not null default 1,
  add column if not exists amount_paid numeric not null default 0;

alter table public.leads
  add column if not exists notes text;

-- "Venite con una amiga": el total ya no es siempre precio × cantidad.
alter table public.event_registrations
  drop constraint if exists event_registrations_total_consistent;
