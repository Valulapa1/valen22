import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdmin } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const leadSchema = z.object({
  firstName: z.string().trim().min(2, "Decinos tu nombre.").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]{8,20}$/, "Ingresá un número de WhatsApp válido."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Ingresá un email válido.")
    .max(160)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  interest: z.enum(["general", "vip", "platino", "transformarte", "adn"]).optional(),
  source: z
    .enum(["popup_evento", "inline_evento", "home_clase", "home_transformarte", "home_adn", "aplicacion_platino", "reserva"])
    .default("popup_evento"),
  notes: z.string().trim().max(2000).optional(),
  visitorId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

/**
 * POST /api/leads — guarda un contacto apenas deja sus datos, antes de
 * reservar. Nunca rompe la navegación: si la base no está configurada,
 * responde igual (la persona sigue su camino por WhatsApp).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json({ error: "Revisá tus datos.", fieldErrors }, { status: 400 });
  }

  const d = parsed.data;
  let saved = false;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("leads").insert({
      first_name: d.firstName,
      phone: d.phone,
      email: d.email ?? null,
      interest: d.interest ?? null,
      source: d.source,
      visitor_id: d.visitorId ?? null,
      ...(d.notes ? { notes: d.notes } : {}),
    });
    if (error) {
      console.error("[leads] Error guardando contacto:", error.message);
    } else {
      saved = true;
      if (d.source === "aplicacion_platino") {
        await notifyAdmin(`Nueva aplicación a Platino: ${d.firstName}`, [
          `${d.firstName} aplicó a Platino.`,
          `WhatsApp: ${d.phone}${d.email ? ` · Email: ${d.email}` : ""}`,
          ...(d.notes ?? "").split("\n"),
        ]);
      }
      if (d.visitorId) {
        await supabase
          .from("analytics_events")
          .insert({ visitor_id: d.visitorId, event: "lead_captured", meta: { source: d.source } });
      }
    }
  } catch (err) {
    console.error("[leads] Supabase no disponible:", (err as Error).message);
  }

  return NextResponse.json({ ok: true, saved });
}
