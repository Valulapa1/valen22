import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "pending", "payment_failed"]),
});

/**
 * PATCH /api/admin/registrations — cambia el estado de una reserva desde el
 * panel (por ejemplo, "pago confirmado" cuando llega la transferencia).
 * Solo para la sesión de administradora.
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
  const paymentStatus =
    status === "confirmed" ? "approved" : status === "payment_failed" ? "cancelled" : "pending";

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("event_registrations")
    .update({
      status,
      payment_status: paymentStatus,
      paid_at: status === "confirmed" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[admin/registrations] Error actualizando:", error.message);
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
