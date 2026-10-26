import { NextResponse } from "next/server";
import { z } from "zod";
import { eventConfig } from "@/config/event";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createUalaOrder, isUalaEnabled, UALA_PREFIX } from "@/lib/uala";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const refSchema = z.string().trim().toUpperCase().regex(/^EPM27-[A-Z0-9-]{6,30}$/);

type TierKey = keyof typeof eventConfig.tiers;

/**
 * Pagar una reserva con Ualá Bis.
 *
 *   POST /api/uala/pagar { reference }  → { checkoutUrl }
 *   GET  /api/uala/pagar?ref=EPM27-…    → redirige al pago de Ualá
 *
 * El importe sale SIEMPRE de la reserva guardada (lo que falta pagar).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { reference?: unknown } | null;
  const ref = refSchema.safeParse(body?.reference);
  if (!ref.success) return NextResponse.json({ error: "Código de reserva inválido." }, { status: 400 });
  const result = await createCheckout(ref.data);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  const ref = refSchema.safeParse(new URL(request.url).searchParams.get("ref"));
  const back = `${siteUrl()}/estoy-para-mas#comprar`;
  if (!ref.success) return NextResponse.redirect(back, 302);
  const result = await createCheckout(ref.data);
  if ("error" in result) {
    if (result.status === 409) {
      return NextResponse.redirect(`${siteUrl()}/pago/exitoso?ref=${encodeURIComponent(ref.data)}`, 302);
    }
    return NextResponse.redirect(back, 302);
  }
  return NextResponse.redirect(result.checkoutUrl, 302);
}

async function createCheckout(
  reference: string,
): Promise<{ checkoutUrl: string; amount: number } | { error: string; status: number }> {
  if (!isUalaEnabled()) return { error: "El pago con Ualá todavía no está disponible.", status: 503 };

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return { error: "El sistema de pagos no está disponible. Escribinos por WhatsApp.", status: 500 };
  }

  const { data: row, error } = await supabase
    .from("event_registrations")
    .select("id, quantity, total_amount, amount_paid, currency, status, ticket_type")
    .eq("external_reference", reference)
    .maybeSingle();
  if (error || !row) return { error: "No encontramos la reserva.", status: 404 };
  if (row.status === "confirmed") return { error: "Esta reserva ya está paga.", status: 409 };

  const amount = Math.round(Number(row.total_amount) - Number(row.amount_paid ?? 0));
  if (!(amount > 0)) return { error: "Esta reserva ya está paga.", status: 409 };
  if (row.currency !== "ARS") return { error: "Esta reserva se paga por transferencia.", status: 400 };

  const tierKey = (row.ticket_type ?? "general") as TierKey;
  const label = eventConfig.tiers[tierKey]?.label.replace(" · Preventa", "") ?? "General";
  const q = Number(row.quantity);
  const base = siteUrl();

  try {
    const order = await createUalaOrder({
      amountPesos: amount,
      description: `Estoy Para Más 2027 · Entrada ${label}${q > 1 ? ` x ${q}` : ""}`,
      externalReference: reference,
      successUrl: `${base}/pago/exitoso?ref=${reference}`,
      failUrl: `${base}/pago/rechazado?ref=${reference}`,
      notificationUrl: `${base}/api/uala/webhook`,
    });
    await supabase
      .from("event_registrations")
      .update({ mercadopago_preference_id: `${UALA_PREFIX}${order.uuid}` })
      .eq("id", row.id);
    return { checkoutUrl: order.checkoutUrl, amount };
  } catch (err) {
    console.error("[uala/pagar] Error creando el pago:", err);
    return { error: "Ualá no respondió. Probá de nuevo o pagá por transferencia.", status: 502 };
  }
}
