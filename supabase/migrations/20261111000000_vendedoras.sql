-- Edición 2027: quién del equipo trajo cada reserva y cada contacto
-- (link personal ?v=<código>). Sirve para pagar el 10% de comisión.
alter table public.event_registrations
  add column if not exists seller text;

alter table public.leads
  add column if not exists seller text;

create index if not exists event_registrations_seller_idx on public.event_registrations (seller);
create index if not exists leads_seller_idx on public.leads (seller);
