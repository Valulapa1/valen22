-- Edición 2027: contactos que dejan sus datos antes de reservar (ventana de
-- bienvenida, clase de regalo, formulario de reserva). Sirve para hacer
-- seguimiento aunque todavía no hayan comprado.
-- Ejecutar con: supabase db push   (o pegar en el SQL Editor del dashboard)

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email text,
  phone text not null,
  -- Qué tipo de entrada le interesa, si lo dijo (general, vip, platino).
  interest text,
  -- Desde dónde dejó los datos: popup_evento, inline_evento, home_clase, reserva.
  source text not null default 'web',
  visitor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at);
create index if not exists leads_phone_idx on public.leads (phone);

-- RLS activado sin policies: solo el servidor (Service Role Key) lee y escribe.
alter table public.leads enable row level security;

-- El embudo suma el paso "dejan sus datos".
alter table public.analytics_events
  drop constraint if exists analytics_events_event_check;
alter table public.analytics_events
  add constraint analytics_events_event_check check (
    event in (
      'onboarding_started',
      'improvement_area_selected',
      'life_score_selected',
      'responsibility_selected',
      'onboarding_completed',
      'onboarding_restarted',
      'checkout_viewed',
      'checkout_initiated',
      'lead_captured'
    )
  );
