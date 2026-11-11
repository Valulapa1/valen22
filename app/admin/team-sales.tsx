import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { COMMISSION_RATE, team } from "@/config/team";
import { siteUrl } from "@/lib/site";
import type { AdminRow } from "./paid";

type SaleRow = Pick<AdminRow, "status" | "amount_paid" | "total_amount" | "currency" | "quantity"> & { seller: string };

function money(n: number, currency: string) {
  return currency === "USD"
    ? `USD ${Math.round(n).toLocaleString("es-AR")}`
    : n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

/**
 * Ventas del equipo: lo que entró por el link personal (?v=) de cada una y su
 * 10%. La comisión "a pagar" sale solo de reservas pagas completas; lo que
 * está en cuotas o por cobrar queda "en camino".
 */
export async function TeamSales() {
  const supabase = getSupabaseAdmin();
  const [{ data: regs, error }, { data: leads }] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("seller, status, amount_paid, total_amount, currency, quantity")
      .not("seller", "is", null)
      .returns<SaleRow[]>(),
    supabase.from("leads").select("seller").not("seller", "is", null).returns<{ seller: string }[]>(),
  ]);

  const base = siteUrl();
  const migrationMissing = Boolean(error && /seller/.test(error.message));

  const rows = team.map((t) => {
    const mine = (regs ?? []).filter((r) => r.seller === t.code);
    const sum = (pred: (r: SaleRow) => boolean, cur: string, val: (r: SaleRow) => number) =>
      mine.filter((r) => pred(r) && r.currency === cur).reduce((s, r) => s + val(r), 0);
    const full = (r: SaleRow) => r.status === "confirmed";
    const open = (r: SaleRow) => r.status !== "confirmed" && r.status !== "payment_failed";
    return {
      ...t,
      link: `${base}/estoy-para-mas?v=${t.code}`,
      contacts: (leads ?? []).filter((l) => l.seller === t.code).length,
      reservas: mine.filter((r) => r.status !== "payment_failed").length,
      entradas: mine.filter(full).reduce((s, r) => s + Number(r.quantity), 0),
      payARS: sum(full, "ARS", (r) => Number(r.total_amount)) * COMMISSION_RATE,
      payUSD: sum(full, "USD", (r) => Number(r.total_amount)) * COMMISSION_RATE,
      wayARS: sum(open, "ARS", (r) => Number(r.total_amount)) * COMMISSION_RATE,
      wayUSD: sum(open, "USD", (r) => Number(r.total_amount)) * COMMISSION_RATE,
    };
  });

  const both = (ars: number, usd: number) =>
    [ars ? money(ars, "ARS") : null, usd ? money(usd, "USD") : null].filter(Boolean).join(" + ") || "—";

  return (
    <section className="admin-section">
      <h2 className="admin-section-title">Ventas del equipo</h2>
      <p className="admin-section-note">
        Lo que entró por el link personal de cada una. Comisión del {Math.round(COMMISSION_RATE * 100)}%: “a pagar” son
        reservas pagas completas; “en camino”, reservas por cobrar o en cuotas.
      </p>
      {migrationMissing && (
        <p className="admin-section-note" style={{ fontWeight: 600 }}>
          Falta activar el registro de ventas en la base de datos (archivo supabase/migrations/20261111000000_vendedoras.sql).
          Hasta entonces los links funcionan, pero no se guarda quién vendió.
        </p>
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Link para compartir</th>
              <th>Contactos</th>
              <th>Reservas</th>
              <th>Entradas pagas</th>
              <th>Comisión a pagar</th>
              <th>En camino</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>{r.name}</td>
                <td style={{ fontSize: ".8rem", userSelect: "all" }}>{r.link}</td>
                <td>{r.contacts}</td>
                <td>{r.reservas}</td>
                <td>{r.entradas}</td>
                <td>
                  <b>{both(r.payARS, r.payUSD)}</b>
                </td>
                <td>{both(r.wayARS, r.wayUSD)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
