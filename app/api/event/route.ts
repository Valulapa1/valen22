import { NextResponse } from "next/server";
import { eventConfig } from "@/config/event";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/event — datos públicos del evento para la landing estática.
 * Es solo informativo para pintar el precio y el total en el formulario;
 * el cálculo que vale se hace de nuevo en create-preference.
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
    location: eventConfig.location,
    presaleEndsAt: eventConfig.presaleEndsAt,
    tiers: eventConfig.tiers,
  });
}
