import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdmin } from "@/lib/email";
import { isValidPhone, suspiciousReason } from "@/lib/spam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const leadSchema = z.object({
  firstName: z.string().trim().min(2, "Decinos tu nombre.").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s\-().]{8,20}$/, "Ingresá un número de WhatsApp válido.")
    .refine(isValidPhone, "Si no sos de Argentina, ponelo con el código de país (ej. +52...)."),
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
  // Campo trampa: está oculto, una persona nunca lo completa; un bot sí.
  website: z.string().optional(),
  // Milisegundos desde que se abrió la página hasta que mandó el formulario.
  elapsedMs: z.number().optional(),
});

/** Al bot le respondemos "ok" para que no insista, pero no guardamos nada. */
const ignored = () => NextResponse.json({ ok: true, saved: false });

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

  // Filtro anti-bots invisible.
  if (d.website) return ignored();
  // Nadie real completa nombre, WhatsApp y mail en menos de 3 segundos.
  if (d.elapsedMs !== undefined && d.elapsedMs < 3000) return ignored();

  let saved = false;
  try {
    const supabase = getSupabaseAdmin();

    // Límites: el mismo mail o WhatsApp no se anota dos veces en el mismo
    // formulario en 24 hs, y una misma visita no deja más de 5 contactos por hora.
    const now = Date.now();
    const phoneDigits = d.phone.replace(/\D/g, "");
    // Entre comillas: un teléfono con paréntesis rompería el filtro.
    const q = (v: string) => `"${v.replace(/"/g, "")}"`;
    const filters = [`phone.eq.${q(d.phone)}`];
    if (d.email) filters.push(`email.eq.${q(d.email)}`);
    if (d.visitorId) filters.push(`visitor_id.eq.${q(d.visitorId)}`);
    const { data: recent } = await supabase
      .from("leads")
      .select("email, phone, source, visitor_id, created_at")
      .gte("created_at", new Date(now - 24 * 3600 * 1000).toISOString())
      .or(filters.join(","))
      .limit(50);
    const rows = recent ?? [];
    const sameMail = (r: { email: string | null }) =>
      Boolean(d.email) && String(r.email ?? "").toLowerCase() === d.email;
    const samePhone = (r: { phone: string }) => String(r.phone).replace(/\D/g, "") === phoneDigits;

    const repeated = rows.some((r) => r.source === d.source && (sameMail(r) || samePhone(r)));
    const sinceHour = new Date(now - 3600 * 1000).toISOString();
    const perVisit = d.visitorId
      ? rows.filter((r) => r.visitor_id === d.visitorId && r.created_at >= sinceHour).length
      : 0;
    if (repeated || perVisit >= 5) return ignored();

    // El mismo mail con muchos teléfonos distintos es un bot.
    const phones = new Set(rows.filter(sameMail).map((r) => String(r.phone).replace(/\D/g, "").slice(-8)));
    phones.add(phoneDigits.slice(-8));
    const suspicious =
      suspiciousReason({ firstName: d.firstName, email: d.email, phone: d.phone }) ??
      (phones.size >= 3 ? "mismo mail con muchos teléfonos" : null);
    if (suspicious) console.warn(`[leads] Contacto sospechoso (${suspicious}): ${d.firstName}`);

    const { error } = await supabase.from("leads").insert({
      first_name: d.firstName,
      phone: d.phone,
      email: d.email ?? null,
      interest: d.interest ?? null,
      source: d.source,
      visitor_id: d.visitorId ?? null,
      ...(d.notes ? { notes: d.notes } : {}),
      // A los sospechosos se los marca como "ya seguidos" para que el
      // seguimiento automático nunca les mande un mail.
      ...(suspicious ? { followup_sent_at: new Date().toISOString() } : {}),
    });
    if (error) {
      console.error("[leads] Error guardando contacto:", error.message);
    } else {
      saved = true;
      if (d.source === "aplicacion_platino" && !suspicious) {
        await notifyAdmin(`Nueva aplicación a Platino: ${d.firstName}`, [
          `${d.firstName} aplicó a Platino.`,
          `WhatsApp: ${d.phone}${d.email ? ` · Email: ${d.email}` : ""}`,
          ...(d.notes ?? "").split("\n"),
        ]);
      }
      if (d.visitorId && !suspicious) {
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
