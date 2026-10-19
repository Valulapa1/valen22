import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fecha de hoy en Argentina (YYYY-MM-DD): cada día del evento se cuenta aparte. */
function todayAR(): string {
  return new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
}

const bodySchema = z.object({
  reference: z.string().regex(/^EPM27-[A-Z0-9-]{6,30}$/),
  undo: z.boolean().optional(),
});

/**
 * POST /api/admin/checkin — registra el ingreso en la puerta. Solo con la
 * sesión del panel (el equipo de la puerta entra con el usuario del panel).
 * Cada entrada deja pasar a tantas personas como entradas compró, una vez por día.
 */
export async function POST(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) {
    return NextResponse.json({ error: "Iniciá sesión en el panel para registrar ingresos." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("event_registrations")
    .select("id, quantity, status, checkins")
    .eq("external_reference", parsed.data.reference)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "No existe esta entrada." }, { status: 404 });
  if (row.status !== "confirmed") {
    return NextResponse.json({ error: "Esta entrada no está paga. No la dejes pasar." }, { status: 409 });
  }

  const day = todayAR();
  const checkins = { ...((row.checkins as Record<string, number>) ?? {}) };
  const used = Number(checkins[day] ?? 0);
  const quantity = Number(row.quantity);

  if (parsed.data.undo) {
    checkins[day] = Math.max(0, used - 1);
  } else {
    if (used >= quantity) {
      return NextResponse.json(
        { error: `Ya ingresaron ${used} de ${quantity} hoy. No la dejes pasar de nuevo.`, used, quantity },
        { status: 409 },
      );
    }
    checkins[day] = used + 1;
  }

  const { error } = await supabase.from("event_registrations").update({ checkins }).eq("id", row.id);
  if (error) return NextResponse.json({ error: "No se pudo registrar. Probá de nuevo." }, { status: 500 });
  return NextResponse.json({ ok: true, used: checkins[day], quantity, day });
}
