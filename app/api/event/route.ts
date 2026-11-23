import { NextResponse } from "next/server";
import { isUalaEnabled } from "@/lib/uala";
import { eventConfig, getCurrentTiers, isPresaleOver } from "@/config/event";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/event — datos públicos del evento para la landing estática.
 * Es solo informativo para pintar precios y totales; el cálculo que vale se
 * hace de nuevo en el servidor al reservar.
 */
export async function GET() {
  return NextResponse.json({
    id: eventConfig.id,
    name: eventConfig.name,
    ticketName: eventConfig.ticketName,
    ticketPrice: eventConfig.ticketPrice,
    currency: eventConfig.currency,
    maxTicketsPerPurchase: eventConfig.maxTicketsPerPurchase,
    eventDate: eventConfig.eventDate,
    eventTime: eventConfig.eventTime,
    vipHours: eventConfig.vipHours,
    location: eventConfig.location,
    presaleEndsAt: eventConfig.presaleEndsAt,
    installmentsDeadline: eventConfig.installmentsDeadline,
    whatsappNumber: eventConfig.whatsappNumber,
    tiers: getCurrentTiers(),
    presaleOver: isPresaleOver(),
    paymentAccounts: eventConfig.paymentAccounts,
    ualaEnabled: isUalaEnabled(),
  });
}
