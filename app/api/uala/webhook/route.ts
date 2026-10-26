import { NextResponse } from "next/server";
import { syncUalaOrder } from "@/lib/payment-confirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/uala/webhook — aviso de Ualá cuando cambia una orden.
 *
 * Del aviso solo tomamos el uuid de la orden; el estado y el importe se
 * consultan siempre a Ualá. Así un aviso falso no puede marcar nada como pago.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nested = typeof body.data === "object" && body.data !== null ? (body.data as Record<string, unknown>) : {};
  const uuid = String(
    body.uuid ?? body.order_id ?? body.orderId ?? nested.uuid ?? nested.order_id ?? url.searchParams.get("uuid") ?? "",
  ).trim();

  if (!/^[A-Za-z0-9-]{6,80}$/.test(uuid)) {
    return NextResponse.json({ received: true });
  }

  try {
    const result = await syncUalaOrder(uuid);
    return NextResponse.json({ received: true, result });
  } catch (err) {
    console.error(`[uala/webhook] Error procesando la orden ${uuid}:`, err);
    // 500 hace que Ualá reintente.
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}
