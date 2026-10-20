import type { Metadata } from "next";
import { eventConfig } from "@/config/event";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";
import { ticketToken } from "@/lib/site";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/lib/admin-auth";
import { CheckIn } from "./checkin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu entrada · Estoy Para Más", robots: { index: false, follow: false } };

type Row = {
  first_name: string;
  last_name: string;
  quantity: number;
  status: string;
  ticket_type: string | null;
  external_reference: string;
  checkins?: Record<string, number> | null;
};

const LABEL: Record<string, string> = { general: "General", vip: "VIP", platino: "Platino" };

export default async function Entrada({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { codigo } = await params;
  const { t } = await searchParams;
  const code = decodeURIComponent(codigo);
  const valid = /^EPM27-[A-Z0-9-]{6,30}$/.test(code) && t === ticketToken(code);

  let row: Row | null = null;
  if (valid) {
    const { data } = await getSupabaseAdmin()
      .from("event_registrations")
      .select("first_name, last_name, quantity, status, ticket_type, external_reference, checkins")
      .eq("external_reference", code)
      .maybeSingle<Row>();
    row = data ?? null;
  }

  const paid = row?.status === "confirmed";
  const isStaff = await isValidSessionToken((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  const today = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
  const usedToday = Number(row?.checkins?.[today] ?? 0);
  const wrap: React.CSSProperties = { minHeight: "100vh", background: "#33202F", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Georgia, serif" };
  const card: React.CSSProperties = { background: "#FAF6F0", borderRadius: 20, maxWidth: 380, width: "100%", padding: "28px 24px", textAlign: "center", color: "#1E1419" };

  if (!row) {
    return (
      <main style={wrap}>
        <div style={card}>
          <p style={{ letterSpacing: 4, fontSize: 13 }}>ESTOY PARA MÁS</p>
          <h1 style={{ fontWeight: 400 }}>No encontramos esta entrada</h1>
          <p style={{ color: "#6E5F69" }}>Revisá el link del mail o escribinos por WhatsApp.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <p style={{ letterSpacing: 4, fontSize: 13, margin: "0 0 4px" }}>ESTOY PARA MÁS</p>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#A87C4F", letterSpacing: 2, margin: 0 }}>2.ª EDICIÓN · BUENOS AIRES</p>
        <div
          style={{
            margin: "18px auto",
            padding: "8px 14px",
            borderRadius: 999,
            display: "inline-block",
            fontFamily: "Arial, sans-serif",
            fontWeight: 700,
            fontSize: 13,
            background: paid ? "#E6F2E3" : "#F6EBDD",
            color: paid ? "#2F5A2B" : "#7A5418",
          }}
        >
          {paid ? "✓ Entrada válida" : "Pendiente de pago"}
        </div>
        {paid ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/entrada/qr?c=${encodeURIComponent(code)}&t=${t}`}
            alt="Código QR de la entrada"
            width={220}
            height={220}
            style={{ display: "block", margin: "0 auto 14px", borderRadius: 8 }}
          />
        ) : (
          <p style={{ color: "#6E5F69", fontFamily: "Arial, sans-serif", fontSize: 14 }}>
            Tu entrada se activa cuando se acredita el pago completo.
          </p>
        )}
        <h1 style={{ fontWeight: 400, fontSize: 26, margin: "6px 0" }}>
          {row.first_name} {row.last_name}
        </h1>
        <p style={{ fontFamily: "Arial, sans-serif", margin: "0 0 4px" }}>
          {LABEL[row.ticket_type ?? "general"] ?? row.ticket_type} · {row.quantity} {row.quantity > 1 ? "entradas" : "entrada"}
        </p>
        <p style={{ fontFamily: "monospace", color: "#6E5F69", margin: "0 0 18px" }}>{row.external_reference}</p>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: "#3a2e35", margin: 0 }}>
          {eventConfig.eventDateLabel}
          <br />
          10:30 a 18:30 hs · Capital Federal, Buenos Aires
        </p>
        {paid && !isStaff && (
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: "#6E5F69", margin: "16px 0 0" }}>
            Mostrá este QR en la puerta, desde el celular. Vale para {row.quantity} {row.quantity > 1 ? "personas" : "persona"}, una vez por día.
          </p>
        )}
        {isStaff && <CheckIn reference={row.external_reference} initialUsed={usedToday} quantity={row.quantity} paid={paid} />}
      </div>
    </main>
  );
}
