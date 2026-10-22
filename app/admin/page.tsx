import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { Funnel } from "./funnel";
import { RegistrationsTable } from "./registrations-table";
import { paidOf, type AdminRow } from "./paid";
import { ticketUrl } from "@/lib/site";
import { eventConfig } from "@/config/event";
import { LeadsTable, type LeadRow } from "./leads-table";
import { findSuspicious } from "@/lib/spam";

export const metadata: Metadata = {
  title: "Panel — Estoy Para Más",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const BASE_COLUMNS =
  "id, first_name, last_name, email, phone, quantity, total_amount, currency, status, payment_status, external_reference, paid_at, created_at";

const TIERS = [
  { key: "general", label: "General" },
  { key: "vip", label: "VIP" },
  { key: "platino", label: "Platino" },
] as const;

function money(n: number, currency: string) {
  return currency === "USD"
    ? `USD ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
    : n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default async function AdminPage() {
  const supabase = getSupabaseAdmin();

  // Con la migración de 2027 cada reserva trae su tipo de entrada. Si todavía
  // no se corrió, leemos igual las columnas de siempre.
  let { data, error } = await supabase
    .from("event_registrations")
    .select(`${BASE_COLUMNS}, ticket_type, payment_method, payment_plan, installments, amount_paid, checkins, profile_completed_at, profile_candidate`)
    .order("created_at", { ascending: false })
    .returns<AdminRow[]>();
  if (error) {
    ({ data, error } = await supabase
      .from("event_registrations")
      .select(`${BASE_COLUMNS}, ticket_type, payment_method`)
      .order("created_at", { ascending: false })
      .returns<AdminRow[]>());
  }
  if (error) {
    ({ data, error } = await supabase
      .from("event_registrations")
      .select(BASE_COLUMNS)
      .order("created_at", { ascending: false })
      .returns<AdminRow[]>());
  }
  if (error) {
    console.error("[admin] Error consultando inscripciones:", error.message);
  }

  const rows = (data ?? []).map((r) => ({ ...r, ticket_url: ticketUrl(r.external_reference) }));
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const pending = rows.filter((r) => r.status === "pending");
  const tickets = (list: AdminRow[]) => list.reduce((s, r) => s + Number(r.quantity), 0);
  // Recaudado real: incluye señas y cuotas ya cobradas.
  const active = rows.filter((r) => r.status !== "payment_failed");
  const revenueARS = active.filter((r) => r.currency !== "USD").reduce((sum, r) => sum + paidOf(r), 0);
  const revenueUSD = active.filter((r) => r.currency === "USD").reduce((sum, r) => sum + paidOf(r), 0);

  const byTier = TIERS.map((t) => {
    const ofTier = rows.filter((r) => (r.ticket_type ?? "general") === t.key);
    return {
      ...t,
      confirmed: tickets(ofTier.filter((r) => r.status === "confirmed")),
      pending: tickets(ofTier.filter((r) => r.status === "pending")),
    };
  });

  const { data: leadsData, error: leadsError } = await supabase
    .from("leads")
    .select("id, first_name, email, phone, interest, source, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(2000)
    .returns<LeadRow[]>();
  let leadsFinal = leadsData;
  if (leadsError) {
    const retry = await supabase
      .from("leads")
      .select("id, first_name, email, phone, interest, source, created_at")
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<LeadRow[]>();
    leadsFinal = retry.data;
  }
  if (leadsError) console.error("[admin] Error consultando contactos:", leadsError.message);
  const allLeads = leadsFinal ?? [];
  // Los bots no cuentan en los números; en la tabla quedan ocultos (ver leads-table).
  const suspiciousLeads = findSuspicious(allLeads);
  const leads = allLeads.filter((l) => !suspiciousLeads.has(l.id));

  // Contador de visitas propio (ver /api/track-visit). "24 hs" y "7 días"
  // son ventanas de tiempo, no días de calendario.
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [visitsTotalRes, visits24hRes, visits7dRes] = await Promise.all([
    supabase.from("page_visits").select("id", { count: "exact", head: true }),
    supabase.from("page_visits").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    supabase.from("page_visits").select("id", { count: "exact", head: true }).gte("created_at", since7d),
  ]);

  const visitsTotal = visitsTotalRes.count ?? 0;
  const visits24h = visits24hRes.count ?? 0;
  const visits7d = visits7dRes.count ?? 0;
  const leads24h = leads.filter((l) => l.created_at >= since24h).length;

  // Embudo por visitantes distintos (visitor_id anónimo de sesión).
  const FUNNEL_EVENTS = ["lead_captured", "checkout_viewed", "checkout_initiated"] as const;
  const [eventsRes, confirmedVisitorsRes] = await Promise.all([
    supabase.from("analytics_events").select("visitor_id, event").in("event", FUNNEL_EVENTS),
    supabase
      .from("event_registrations")
      .select("visitor_id")
      .eq("status", "confirmed")
      .not("visitor_id", "is", null)
      .returns<{ visitor_id: string }[]>(),
  ]);

  const eventRows = eventsRes.data ?? [];
  const distinctVisitors = (eventName: string) =>
    new Set(eventRows.filter((r) => r.event === eventName).map((r) => r.visitor_id)).size;
  const purchasedVisitors = new Set((confirmedVisitorsRes.data ?? []).map((r) => r.visitor_id)).size;

  const funnelSteps = [
    { key: "landing", label: "Llegan a la página", count: visitsTotal },
    { key: "lead", label: "Dejan sus datos", count: distinctVisitors("lead_captured") },
    { key: "viewed", label: "Miran las entradas", count: distinctVisitors("checkout_viewed") },
    { key: "initiated", label: "Envían la reserva", count: distinctVisitors("checkout_initiated") },
    { key: "purchased", label: "Pagaron", count: purchasedVisitors },
  ];

  return (
    <main className="admin-page">
      <div className="admin-header">
        <span className="pago-logo">ESTOY PARA MÁS · Panel</span>
        <form method="POST" action="/api/admin/logout">
          <button type="submit" className="admin-logout">
            Cerrar sesión
          </button>
        </form>
      </div>

      <div className="admin-stats">
        <div className="admin-stat">
          <b>{tickets(confirmed)}</b>
          <span>Entradas pagas</span>
        </div>
        <div className="admin-stat">
          <b>{money(revenueARS, "ARS")}</b>
          <span>Recaudado en pesos</span>
        </div>
        <div className="admin-stat">
          <b>{money(revenueUSD, "USD")}</b>
          <span>Recaudado en dólares</span>
        </div>
        <div className="admin-stat">
          <b>{pending.length}</b>
          <span>Reservas por cobrar</span>
        </div>
      </div>

      <div className="admin-stats admin-stats-tiers">
        {byTier.map((t) => (
          <div className="admin-stat" key={t.key}>
            <b>{t.confirmed}</b>
            <span>
              {t.label} pagas · {t.pending} por cobrar
            </span>
          </div>
        ))}
        <div className="admin-stat">
          <b>{leads.length}</b>
          <span>Contactos · {leads24h} hoy</span>
        </div>
      </div>

      <div className="admin-stats admin-stats-visits">
        <div className="admin-stat">
          <b>{visits24h}</b>
          <span>Visitas últimas 24 hs</span>
        </div>
        <div className="admin-stat">
          <b>{visits7d}</b>
          <span>Visitas últimos 7 días</span>
        </div>
        <div className="admin-stat">
          <b>{visitsTotal}</b>
          <span>Visitas totales</span>
        </div>
        <div className="admin-stat">
          <b>{visitsTotal > 0 ? `${((leads.length / visitsTotal) * 100).toFixed(1)}%` : "—"}</b>
          <span>Dejan sus datos / visitan</span>
        </div>
      </div>

      <section className="admin-section">
        <h2 className="admin-section-title">Embudo: dónde se quedan</h2>
        <p className="admin-section-note">
          Cada porcentaje es sobre el paso anterior, no sobre el total.
        </p>
        <Funnel steps={funnelSteps} />
      </section>

      <h2 className="admin-block-title">Reservas</h2>
      <p className="admin-block-note">
        Las respuestas del formulario “Conocerte” están en tu{" "}
        <a href={eventConfig.profileForm.sheetUrl} target="_blank" rel="noopener noreferrer">
          planilla de Google
        </a>
        . Acá ves solo quién lo completó (⭐ = candidata a ADN: compromiso 9-10 y abierta a seguir).
      </p>
      <RegistrationsTable rows={rows} />

      <h2 className="admin-block-title">Contactos</h2>
      <p className="admin-block-note">
        Todas las personas que dejaron sus datos, hayan reservado o no. Ideal para el seguimiento.
      </p>
      <LeadsTable rows={allLeads} suspicious={Object.fromEntries(suspiciousLeads)} />
    </main>
  );
}
