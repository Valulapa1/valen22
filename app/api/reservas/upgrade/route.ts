import { NextResponse } from "next/server";
import { z } from "zod";
import { eventConfig, getCurrentTier, getPaymentSchedule, getTierTotal } from "@/config/event";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdmin, reservationEmail, sendEmail } from "@/lib/email";
import { getUsdRate } from "@/lib/dolar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reference: z.string().regex(/^EPM27-[A-Z0-9-]{6,30}$/),
  paymentPlan: z.enum(["unico", "cuotas"]).default("unico"),
});

/**
 * POST /api/reservas/upgrade — pasa una reserva General recién hecha a VIP.
 * Solo funciona sobre reservas General todavía sin pagos: con el código de
 * reserva no se puede hacer otra cosa que mejorar la entrada.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const { reference, paymentPlan } = parsed.data;

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("event_registrations")
    .select("id, quantity, ticket_type, status, amount_paid, first_name, last_name, email, phone, external_reference")
    .eq("external_reference", reference)
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: "No encontramos tu reserva." }, { status: 404 });
  if ((row.ticket_type ?? "general") !== "general" || row.status !== "pending" || Number(row.amount_paid) > 0) {
    return NextResponse.json({ error: "Esta reserva ya no se puede cambiar desde acá." }, { status: 409 });
  }

  const quantity = Number(row.quantity);
  const tier = getCurrentTier("vip");
  const total = getTierTotal("vip", quantity);
  const schedule = getPaymentSchedule("vip", quantity, paymentPlan);
  const plan = schedule.length > 1 ? "cuotas" : "unico";

  const { error: upErr } = await supabase
    .from("event_registrations")
    .update({
      ticket_type: "vip",
      unit_price: tier.price,
      total_amount: total,
      currency: tier.currency,
      payment_plan: plan,
      installments: schedule.length,
    })
    .eq("id", row.id);
  if (upErr) {
    console.error("[reservas/upgrade] Error:", upErr.message);
    return NextResponse.json({ error: "No se pudo cambiar la entrada." }, { status: 500 });
  }

  const mail = reservationEmail(
    {
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      quantity,
      total_amount: total,
      currency: tier.currency,
      external_reference: reference,
      ticket_type: "vip",
      label: tier.label,
      schedule,
    },
    await getUsdRate(),
  );
  await sendEmail({ to: row.email, ...mail });
  await notifyAdmin(`Pasó a VIP: ${row.first_name} ${row.last_name}`, [
    `${row.first_name} ${row.last_name} cambió su reserva General a VIP (${quantity} × USD ${tier.price}).`,
    `Código: ${reference}`,
  ]);

  return NextResponse.json({
    reference,
    saved: true,
    ticketType: "vip",
    ticketLabel: tier.label,
    unitPrice: tier.price,
    currency: tier.currency,
    quantity,
    total,
    paymentPlan: plan,
    schedule,
    whatsappNumber: eventConfig.whatsappNumber,
  });
}
