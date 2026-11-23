import "server-only";
import { eventConfig } from "@/config/event";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Lugares VIP ocupados: reservas VIP pagas (completas o con algo pagado).
 * Las reservas sin pagar no ocupan lugar: la VIP es de quien paga primero.
 * Devuelve null si la base no responde (en ese caso no se bloquea la venta).
 */
export async function vipTaken(): Promise<number | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("event_registrations")
      .select("quantity, status, amount_paid")
      .eq("ticket_type", "vip");
    if (error) return null;
    return (data ?? [])
      .filter((r) => r.status === "confirmed" || Number(r.amount_paid) > 0)
      .reduce((s, r) => s + Number(r.quantity), 0);
  } catch {
    return null;
  }
}

export async function vipLeft(): Promise<number | null> {
  const taken = await vipTaken();
  return taken === null ? null : Math.max(0, eventConfig.tiers.vip.limited - taken);
}
