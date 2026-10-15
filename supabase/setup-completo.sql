-- ESTOY PARA MÁS · Configuración completa de la base de datos
-- Pegá todo este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin romper nada.


-- ======== 20260725120000_create_event_registrations.sql ========
-- Inscripciones al evento con pago vía Mercado Pago Checkout Pro.
-- Ejecutar con: supabase db push   (o pegar en el SQL Editor del dashboard)

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,

  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  document_number text,

  quantity integer not null,
  unit_price numeric(12, 2) not null,
  total_amount numeric(12, 2) not null,
  currency text not null default 'ARS',

  -- Estado de la inscripción (controlado por el webhook, nunca por el navegador)
  status text not null default 'pending',
  -- Estado crudo del pago según Mercado Pago
  payment_status text not null default 'pending',

  mercadopago_preference_id text,
  mercadopago_payment_id text,
  mercadopago_status text,
  mercadopago_status_detail text,
  external_reference text not null,

  paid_at timestamptz,
  confirmation_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_registrations_external_reference_key unique (external_reference),
  constraint event_registrations_quantity_positive check (quantity > 0),
  constraint event_registrations_unit_price_positive check (unit_price > 0),
  constraint event_registrations_total_positive check (total_amount > 0),
  constraint event_registrations_total_consistent check (total_amount = unit_price * quantity),
  constraint event_registrations_status_check check (
    status in ('pending', 'confirmed', 'payment_failed', 'error')
  ),
  constraint event_registrations_payment_status_check check (
    payment_status in (
      'pending', 'approved', 'authorized', 'in_process', 'in_mediation',
      'rejected', 'cancelled', 'refunded', 'charged_back', 'error'
    )
  )
);

create index if not exists event_registrations_email_idx
  on public.event_registrations (email);
create index if not exists event_registrations_status_idx
  on public.event_registrations (status);
create index if not exists event_registrations_payment_id_idx
  on public.event_registrations (mercadopago_payment_id);
-- external_reference ya tiene índice único por la constraint de arriba.

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists event_registrations_set_updated_at on public.event_registrations;
create trigger event_registrations_set_updated_at
  before update on public.event_registrations
  for each row execute function public.set_updated_at();

-- RLS activado SIN policies: ni la anon key ni usuarios autenticados pueden
-- leer o escribir. Solo el servidor, vía Service Role Key, accede a la tabla.
alter table public.event_registrations enable row level security;

-- ======== 20260804000000_create_page_visits.sql ========
-- Conteo propio de visitas a la landing (no depende de la API paga de
-- Vercel Analytics). Una fila por sesión de navegador, no por página vista:
-- el script del cliente solo manda el aviso una vez por sessionStorage.
-- Ejecutar con: supabase db push   (o pegar en el SQL Editor del dashboard)

create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  path text not null default '/',
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists page_visits_created_at_idx
  on public.page_visits (created_at);

-- RLS activado SIN policies: mismo patrón que event_registrations. Solo el
-- servidor, vía Service Role Key, puede insertar o leer.
alter table public.page_visits enable row level security;

-- ======== 20260805000000_create_funnel_tracking.sql ========
-- Embudo de visitantes: qué parte de la gente que entra avanza a cada paso
-- (cuestionario, mira el precio, inicia el pago, compra).
-- Ejecutar con: supabase db push   (o pegar en el SQL Editor del dashboard)

-- Identificador anónimo por sesión de navegador (sessionStorage, sin cookies
-- de terceros ni datos personales), para poder unir los pasos de un mismo
-- visitante sin guardar quién es.
alter table public.page_visits
  add column if not exists visitor_id uuid;

alter table public.event_registrations
  add column if not exists visitor_id uuid;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  event text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_events_event_check check (
    event in (
      'onboarding_started',
      'improvement_area_selected',
      'life_score_selected',
      'responsibility_selected',
      'onboarding_completed',
      'onboarding_restarted',
      'checkout_viewed',
      'checkout_initiated'
    )
  )
);

create index if not exists analytics_events_event_visitor_idx
  on public.analytics_events (event, visitor_id);

alter table public.analytics_events enable row level security;

-- ======== 20261015000000_add_ticket_type.sql ========
-- Edición 2027: reservas por transferencia con tipos de entrada.
-- Ejecutar con: supabase db push   (o pegar en el SQL Editor del dashboard)

alter table public.event_registrations
  add column if not exists ticket_type text not null default 'general',
  add column if not exists payment_method text not null default 'mercadopago';

create index if not exists event_registrations_ticket_type_idx
  on public.event_registrations (ticket_type);

-- ======== 20261015120000_create_leads.sql ========
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
