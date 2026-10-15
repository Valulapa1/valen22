import { NextResponse } from "next/server";
import { z } from "zod";
import { eventConfig } from "@/config/event";
import { registrationSchema } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TierKey = keyof typeof eventConfig.tiers;
const tierKeys = Object.keys(eventConfig.tiers) as [TierKey, ...TierKey[]];

const reservaSchema = registrationSchema.extend({
  ticketType: z.enum(tierKeys, {
    errorMap: () => ({ message: "Elegí un tipo de entrada." }),
  }),
});

/**
 * POST /api/reservas — registra una reserva para pagar por transferencia.
 *
 * Guarda los datos de la asistente en Supabase (si está configurado) y
 * devuelve el código de reserva. La landing después abre WhatsApp con todos
 * los datos, así que aunque la base no esté configurada la reserva no se
 * pierde: el pedido de la persona llega igual por WhatsApp.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = reservaSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Revisá los datos del formulario.", fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const tier = eventConfig.tiers[data.ticketType];
  const reference = `EPM27-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  let saved = false;
  try {
    const supabase = getSupabaseAdmin();
    const row = {
      event_id: eventConfig.id,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      document_number: data.documentNumber ?? null,
      quantity: data.quantity,
      unit_price: tier.price,
      total_amount: tier.price * data.quantity,
      currency: tier.currency,
      status: "pending",
      payment_status: "pending",
      external_reference: reference,
    };
    let { error } = await supabase
      .from("event_registrations")
      .insert({ ...row, ticket_type: data.ticketType, payment_method: "transferencia" });
    // Si todavía no se corrió la migración de ticket_type, guardamos igual.
    if (error && /ticket_type|payment_method/.test(error.message)) {
      ({ error } = await supabase.from("event_registrations").insert(row));
    }
    if (error) {
      console.error("[reservas] Error guardando la reserva:", error.message);
    } else {
      saved = true;
    }
  } catch (err) {
    console.error("[reservas] Supabase no disponible:", (err as Error).message);
  }

  return NextResponse.json({
    reference,
    saved,
    ticketType: data.ticketType,
    ticketLabel: tier.label,
    unitPrice: tier.price,
    currency: tier.currency,
    quantity: data.quantity,
    total: tier.price * data.quantity,
    whatsappNumber: eventConfig.whatsappNumber,
  });
}
