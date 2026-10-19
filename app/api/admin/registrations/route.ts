import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail, ticketEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().uuid(),
  // confirmed = pagó todo · installment = llegó una cuota · pending = deshacer · payment_failed = cancelar
  status: z.enum(["confirmed", "installment", "pending", "payment_failed"]),
});

/**
 * PATCH /api/admin/registrations — registra pagos desde el panel: una cuota,
 * el pago completo, deshacer o cancelar. Solo para la sesión de administradora.
 */
export async function PATCH(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { id, status } = parsed.data;
  const supabase = getSupabaseAdmin();

  const { data: row, error: readErr } = await supabase
    .from("event_registrations")
    .select("total_amount, installments, amount_paid, first_name, last_name, email, phone, quantity, currency, external_reference, ticket_type, confirmation_email_sent_at, profile_completed_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !row) {
    return NextResponse.json({ error: "No encontramos la reserva." }, { status: 404 });
  }

  const total = Number(row.total_amount);
  const n = Math.max(1, Number(row.installments ?? 1));
  let amountPaid = Number(row.amount_paid ?? 0);
  let next: "confirmed" | "pending" | "payment_failed" = "pending";

  if (status === "confirmed") amountPaid = total;
  if (status === "pending") amountPaid = 0;
  if (status === "installment") {
    const base = Math.floor(total / n);
    const firstAmount = total - base * (n - 1);
    amountPaid = Math.min(total, amountPaid + (amountPaid === 0 ? firstAmount : base));
  }
  if (status === "payment_failed") next = "payment_failed";
  else next = amountPaid >= total ? "confirmed" : "pending";

  const paymentStatus =
    next === "confirmed" ? "approved" : next === "payment_failed" ? "cancelled" : amountPaid > 0 ? "in_process" : "pending";

  let { error } = await supabase
    .from("event_registrations")
    .update({
      status: next,
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      paid_at: next === "confirmed" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error && /amount_paid/.test(error.message)) {
    ({ error } = await supabase
      .from("event_registrations")
      .update({ status: next, payment_status: paymentStatus, paid_at: next === "confirmed" ? new Date().toISOString() : null })
      .eq("id", id));
  }
  if (error) {
    console.error("[admin/registrations] Error actualizando:", error.message);
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
  // Pagó todo: le mandamos la entrada (una sola vez).
  let ticketSent = false;
  if (next === "confirmed" && !row.confirmation_email_sent_at && row.email) {
    const mail = ticketEmail({
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      phone: row.phone,
      quantity: Number(row.quantity),
      total_amount: total,
      currency: row.currency,
      external_reference: row.external_reference,
      ticket_type: row.ticket_type,
      schedule: [],
    }, Boolean(row.profile_completed_at));
    ticketSent = await sendEmail({ to: row.email, ...mail });
    if (ticketSent) {
      await supabase
        .from("event_registrations")
        .update({ confirmation_email_sent_at: new Date().toISOString() })
        .eq("id", id);
    }
  }
  return NextResponse.json({ ok: true, status: next, amountPaid, ticketSent });
}

/** DELETE /api/admin/registrations — borra una reserva (por ejemplo, una de prueba). */
export async function DELETE(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const { error } = await getSupabaseAdmin().from("event_registrations").delete().eq("id", parsed.data.id);
  if (error) {
    console.error("[admin/registrations] Error borrando:", error.message);
    return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
