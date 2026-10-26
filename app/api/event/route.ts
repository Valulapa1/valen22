import { NextResponse } from "next/server";
import { isUalaEnabled } from "@/lib/uala";
import { eventConfig, getCurrentTiers, isPresaleOver } from "@/config/event";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lugares Platino ocupados: reservas con seña o pago completo. */
async function platinoTaken(): Promise<number | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("event_registrations")
      .select("quantity, status, amount_paid")
      .eq("ticket_type", "platino");
    if (error) return null;
    return (data ?? [])
      .filter((r) => r.status === "confirmed" || Number(r.amount_paid) > 0)
      .reduce((s, r) => s + Number(r.quantity), 0);
  } catch {
    return null;
  }
}

/**
 * GET /api/event — datos públicos del evento para la landing estática.
 * Es solo informativo para pintar precios y totales; el cálculo que vale se
 * hace de nuevo en el servidor al reservar.
 */
export async function GET() {
  const taken = await platinoTaken();
  const limit = eventConfig.tiers.platino.limited;
  return NextResponse.json({
    id: eventConfig.id,
    name: eventConfig.name,
    ticketName: eventConfig.ticketName,
    ticketPrice: eventConfig.ticketPrice,
    currency: eventConfig.currency,
    maxTicketsPerPurchase: eventConfig.maxTicketsPerPurchase,
    eventDate: eventConfig.eventDate,
    eventTime: eventConfig.eventTime,
    location: eventConfig.location,
    presaleEndsAt: eventConfig.presaleEndsAt,
    installmentsDeadline: eventConfig.installmentsDeadline,
    whatsappNumber: eventConfig.whatsappNumber,
    tiers: getCurrentTiers(),
    presaleOver: isPresaleOver(),
    paymentAccounts: eventConfig.paymentAccounts,
    platinoLeft: taken === null ? null : Math.max(0, limit - taken),
    ualaEnabled: isUalaEnabled(),
  });
}
