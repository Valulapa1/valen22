import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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
    .select("total_amount, installments, amount_paid")
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
  return NextResponse.json({ ok: true, status: next, amountPaid });
}
