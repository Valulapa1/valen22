-- Seguimiento automático por mail: qué recordatorio recibió cada reserva y
-- cada contacto, para no mandar dos veces lo mismo.
alter table public.event_registrations
  add column if not exists reminders_sent integer not null default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists installment_reminder_at timestamptz,
  add column if not exists reservation_email_sent_at timestamptz;

alter table public.leads
  add column if not exists followup_sent_at timestamptz;

-- Control de ingreso: cuántas personas de cada entrada entraron cada día,
-- por ejemplo {"2027-03-06": 1, "2027-03-07": 1}.
alter table public.event_registrations
  add column if not exists checkins jsonb not null default '{}'::jsonb;
