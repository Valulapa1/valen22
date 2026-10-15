-- Edición 2027: reservas por transferencia con tipos de entrada.
-- Ejecutar con: supabase db push   (o pegar en el SQL Editor del dashboard)

alter table public.event_registrations
  add column if not exists ticket_type text not null default 'general',
  add column if not exists payment_method text not null default 'mercadopago';

create index if not exists event_registrations_ticket_type_idx
  on public.event_registrations (ticket_type);
