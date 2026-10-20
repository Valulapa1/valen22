import { NextResponse } from "next/server";
import { eventConfig } from "@/config/event";
import { getSupabaseAdmin, type RegistrationRow } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/registrations/status?ref=epm-<uuid>
 *
 * Consulta mínima y no enumerable: la referencia contiene un UUID v4
 * (imposible de adivinar) y la respuesta expone solo el estado necesario
 * para la página de resultado. Nada de datos personales ni internos.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ref")?.trim() ?? "";
  const ref = /^epm27-/i.test(raw) ? raw.toUpperCase() : raw;

  // epm- + UUID v4. Rechazar cualquier otra forma evita sondeos.
  // epm-<uuid> (1.ª edición) o EPM27-… (reservas de la 2.ª edición).
  if (
    !/^epm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref) &&
    !/^EPM27-[A-Z0-9-]{6,30}$/.test(ref)
  ) {
    return NextResponse.json({ error: "Referencia inválida." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    console.error("[status] Configuración incompleta:", (err as Error).message);
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("event_registrations")
    .select("status, payment_status, quantity, email, external_reference, total_amount, currency")
    .eq("external_reference", ref)
    .maybeSingle<
      Pick<
        RegistrationRow,
        | "status"
        | "payment_status"
        | "quantity"
        | "email"
        | "external_reference"
        | "total_amount"
        | "currency"
      >
    >();

  if (error) {
    console.error("[status] Error consultando Supabase:", error.message);
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Inscripción no encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    status: data.status,
    paymentStatus: data.payment_status,
    eventName: eventConfig.name,
    quantity: data.quantity,
    reference: data.external_reference,
    totalAmount: Number(data.total_amount),
    currency: data.currency,
    // Email enmascarado: alcanza para confirmar a dónde llega el correo.
    emailMasked: maskEmail(data.email),
  });
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}
