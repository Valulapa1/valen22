import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^EPM27-[A-Z0-9-]{6,30}$/),
  commitment: z.coerce.number().int().min(1).max(10).optional(),
  openness: z.string().max(80).optional(),
});

/**
 * POST /api/perfil — lo llama el formulario de Google "Conocerte" (Apps Script)
 * cada vez que alguien lo envía. Marca la reserva como "perfil completo" y, si
 * puso compromiso 9-10 y está muy o bastante abierta, como candidata a ADN.
 * Las respuestas en sí quedan en la planilla de Google, no acá.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const { reference, commitment, openness } = parsed.data;
  const candidate = (commitment ?? 0) >= 9 && /muy|bastante/i.test(openness ?? "");

  const { data, error } = await getSupabaseAdmin()
    .from("event_registrations")
    .update({ profile_completed_at: new Date().toISOString(), profile_candidate: candidate })
    .eq("external_reference", reference)
    .select("id");
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true, matched: (data ?? []).length });
}
