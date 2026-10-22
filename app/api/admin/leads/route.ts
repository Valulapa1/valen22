import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, isValidSessionToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/admin/leads — borra uno o varios contactos desde el panel. */
export async function DELETE(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  // Uno ({ id }) o varios a la vez ({ ids }), por ejemplo todos los bots.
  const parsed = z
    .union([z.object({ id: z.string().uuid() }), z.object({ ids: z.array(z.string().uuid()).min(1).max(2000) })])
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const ids = "id" in parsed.data ? [parsed.data.id] : parsed.data.ids;
  const { error } = await getSupabaseAdmin().from("leads").delete().in("id", ids);
  if (error) {
    console.error("[admin/leads] Error borrando:", error.message);
    return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
