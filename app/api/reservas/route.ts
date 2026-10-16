import { NextResponse } from "next/server";
import { z } from "zod";
import { eventConfig, getCurrentTier, getPaymentSchedule, getTierTotal } from "@/config/event";
import { registrationSchema } from "@/lib/validation";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { money, notifyAdmin, reservationEmail, sendEmail } from "@/lib/email";
import { getUsdRate } from "@/lib/dolar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TierKey = keyof typeof eventConfig.tiers;
const tierKeys = Object.keys(eventConfig.tiers) as [TierKey, ...TierKey[]];

const reservaSchema = registrationSchema.extend({
  ticketType: z.enum(tierKeys, {
    errorMap: () => ({ message: "Elegí un tipo de entrada." }),
  }),
  paymentPlan: z.enum(["unico", "cuotas"]).default("unico"),
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
  const tier = getCurrentTier(data.ticketType);
  const total = getTierTotal(data.ticketType, data.quantity);
  const schedule = getPaymentSchedule(data.ticketType, data.quantity, data.paymentPlan);
  const plan = schedule.length > 1 ? "cuotas" : "unico";
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
      total_amount: total,
      currency: tier.currency,
      status: "pending",
      payment_status: "pending",
      external_reference: reference,
      visitor_id: data.visitorId ?? null,
    };
    let { error } = await supabase
      .from("event_registrations")
      .insert({
        ...row,
        ticket_type: data.ticketType,
        payment_method: "transferencia",
        payment_plan: plan,
        installments: schedule.length,
        amount_paid: 0,
      });
    // Si todavía no se corrieron las migraciones nuevas, guardamos igual.
    if (error && /ticket_type|payment_method|payment_plan|installments|amount_paid/.test(error.message)) {
      ({ error } = await supabase.from("event_registrations").insert(row));
    }
    if (error) {
      console.error("[reservas] Error guardando la reserva:", error.message);
    } else {
      saved = true;
      // Mail con los datos para transferir + aviso a Valentina.
      const usdRate = tier.currency === "USD" ? await getUsdRate() : null;
      const mail = reservationEmail(
        { ...row, ticket_type: data.ticketType, label: tier.label, schedule },
        usdRate,
      );
      const sent = await sendEmail({ to: data.email, ...mail });
      if (sent) {
        await supabase
          .from("event_registrations")
          .update({ reservation_email_sent_at: new Date().toISOString() })
          .eq("external_reference", reference);
      }
      await notifyAdmin(`Nueva reserva: ${data.firstName} ${data.lastName} · ${tier.label}`, [
        `${data.firstName} ${data.lastName} reservó ${data.quantity} × ${tier.label}.`,
        `Total: ${money(total, tier.currency)}${schedule.length > 1 ? ` en ${schedule.length} cuotas` : ""}.`,
        `WhatsApp: ${data.phone} · Email: ${data.email}`,
        `Código: ${reference}`,
      ]);
    }
    // También queda como contacto, para el seguimiento aunque no pague.
    const { error: leadError } = await supabase.from("leads").insert({
      first_name: `${data.firstName} ${data.lastName}`,
      phone: data.phone,
      email: data.email,
      interest: data.ticketType,
      source: "reserva",
      visitor_id: data.visitorId ?? null,
    });
    if (leadError) console.error("[reservas] Error guardando contacto:", leadError.message);
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
    total,
    paymentPlan: plan,
    schedule,
    whatsappNumber: eventConfig.whatsappNumber,
  });
}
