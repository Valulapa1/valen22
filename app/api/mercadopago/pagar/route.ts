import { NextResponse } from "next/server";
import { z } from "zod";
import { eventConfig } from "@/config/event";
import { getPreferenceClient, isTestCredential } from "@/lib/mercadopago";
import { siteUrl } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const refSchema = z.string().trim().toUpperCase().regex(/^EPM27-[A-Z0-9-]{6,30}$/);

type TierKey = keyof typeof eventConfig.tiers;

/**
 * Pagar una reserva con Mercado Pago (Checkout Pro).
 *
 *   POST /api/mercadopago/pagar { reference }  → { checkoutUrl }   (botón de la web)
 *   GET  /api/mercadopago/pagar?ref=EPM27-…    → redirige a MP      (botón de los mails)
 *
 * El importe sale SIEMPRE de la reserva guardada (lo que falta pagar), nunca
 * del navegador. Mercado Pago ofrece las cuotas con tarjeta en su checkout.
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
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return { error: "El sistema de pagos no está disponible. Escribinos por WhatsApp.", status: 500 };
  }

  const { data: row, error } = await supabase
    .from("event_registrations")
    .select("id, first_name, last_name, email, phone, document_number, quantity, total_amount, amount_paid, currency, status, ticket_type")
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
    const pref = await getPreferenceClient().create({
      body: {
        items: [
          {
            id: `${eventConfig.id}-${tierKey}`,
            title: `Estoy Para Más 2027 · Entrada ${label}${q > 1 ? ` × ${q}` : ""}`,
            description: eventConfig.eventDateLabel,
            quantity: 1,
            unit_price: amount,
            currency_id: "ARS",
          },
        ],
        payer: {
          name: row.first_name,
          surname: row.last_name,
          email: row.email,
          ...(row.document_number ? { identification: { type: "DNI", number: String(row.document_number) } } : {}),
        },
        payment_methods: { installments: eventConfig.mpMaxInstallments },
        external_reference: reference,
        back_urls: {
          success: `${base}/pago/exitoso?ref=${reference}`,
          pending: `${base}/pago/pendiente?ref=${reference}`,
          failure: `${base}/pago/rechazado?ref=${reference}`,
        },
        auto_return: "approved",
        notification_url: `${base}/api/webhook`,
        statement_descriptor: eventConfig.statementDescriptor,
        metadata: { registration_id: row.id, event_id: eventConfig.id },
      },
    });
    const checkoutUrl =
      isTestCredential() && pref.sandbox_init_point ? pref.sandbox_init_point : pref.init_point;
    if (!pref.id || !checkoutUrl) throw new Error("Mercado Pago no devolvió el link de pago.");

    await supabase
      .from("event_registrations")
      .update({ mercadopago_preference_id: pref.id })
      .eq("id", row.id);

    return { checkoutUrl, amount };
  } catch (err) {
    console.error("[mp/pagar] Error creando el pago:", err);
    return { error: "Mercado Pago no respondió. Probá de nuevo o pagá por transferencia.", status: 502 };
  }
}
