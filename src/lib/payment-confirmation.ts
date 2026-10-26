import "server-only";
import { getSupabaseAdmin, type RegistrationRow } from "@/lib/supabase-admin";
import { sendEmail, ticketEmail } from "@/lib/email";

/**
 * Envía el email de confirmación exactamente una vez: el UPDATE condicional
 * sobre confirmation_email_sent_at IS NULL actúa de lock — si dos webhooks
 * llegan a la vez, solo uno obtiene la fila y envía.
 */
export async function maybeSendConfirmationEmail(registration: RegistrationRow): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: claimed, error } = await supabase
    .from("event_registrations")
    .update({ confirmation_email_sent_at: new Date().toISOString() })
    .eq("id", registration.id)
    .is("confirmation_email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[confirmación] No se pudo reservar el envío de email:", error.message);
    return;
  }
  if (!claimed) return; // otro webhook ya lo envió

  const r = registration as RegistrationRow & { ticket_type?: string | null; profile_completed_at?: string | null };
  const mail = ticketEmail(
    {
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      phone: r.phone,
      quantity: Number(r.quantity),
      total_amount: Number(r.total_amount),
      currency: r.currency,
      external_reference: r.external_reference,
      ticket_type: r.ticket_type ?? null,
      schedule: [],
    },
    Boolean(r.profile_completed_at),
  );
  const sent = await sendEmail({ to: r.email, ...mail });
  if (!sent) {
    // Liberar el lock para que un próximo webhook pueda reintentar el envío.
    await supabase
      .from("event_registrations")
      .update({ confirmation_email_sent_at: null })
      .eq("id", registration.id);
  }
}

/**
 * Consulta una orden de Ualá y actualiza la reserva. Ualá es la fuente de
 * verdad: nunca se confía en lo que llega en el aviso. Es idempotente, se
 * puede llamar las veces que haga falta (aviso de Ualá, página de "pago
 * exitoso", reintentos).
 */
export async function syncUalaOrder(uuid: string): Promise<"confirmed" | "pending" | "failed" | "ignored"> {
  const { getUalaOrder, ualaAmountMatches, UALA_PREFIX } = await import("@/lib/uala");
  const { money, notifyAdmin } = await import("@/lib/email");

  const order = await getUalaOrder(uuid);
  const reference = order.external_reference ?? null;
  const supabase = getSupabaseAdmin();

  let query = supabase.from("event_registrations").select("*");
  query = reference
    ? query.eq("external_reference", reference)
    : query.eq("mercadopago_preference_id", `${UALA_PREFIX}${uuid}`);
  const { data: registration, error } = await query.maybeSingle<RegistrationRow & { amount_paid?: number | null }>();
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!registration) {
    console.warn(`[uala] Orden ${uuid} (${reference ?? "sin referencia"}) sin reserva; se ignora.`);
    return "ignored";
  }

  const status = String(order.status ?? "").toUpperCase();
  const fields = { mercadopago_payment_id: `${UALA_PREFIX}${uuid}`, mercadopago_status: status.toLowerCase() };

  // Ya estaba paga: solo una devolución la puede cambiar.
  if (registration.payment_status === "approved") {
    if (status === "REFUNDED" && registration.mercadopago_payment_id === `${UALA_PREFIX}${uuid}`) {
      await supabase
        .from("event_registrations")
        .update({ ...fields, status: "payment_failed", payment_status: "refunded" })
        .eq("id", registration.id);
      return "failed";
    }
    return "confirmed";
  }

  // PROCESSED = pagó y Ualá todavía no acreditó; APPROVED = acreditado.
  if (status === "APPROVED" || status === "PROCESSED") {
    const total = Number(registration.total_amount);
    const due = total - Number(registration.amount_paid ?? 0);
    if (!ualaAmountMatches(order.amount, [total, due])) {
      console.error(`[uala] ALERTA orden ${uuid}: importe ${order.amount} no coincide con ${total} / ${due}. NO se confirma.`);
      await supabase
        .from("event_registrations")
        .update({ ...fields, mercadopago_status_detail: `amount_mismatch:${order.amount}` })
        .eq("id", registration.id);
      await notifyAdmin(`⚠️ Revisar pago con Ualá: ${registration.first_name} ${registration.last_name}`, [
        `Ualá informa un pago de la reserva ${registration.external_reference}, pero el importe no coincide.`,
        `Importe de Ualá: ${order.amount} · Esperado: ${money(due, "ARS")}.`,
        `No se marcó como pagada. Revisalo en tu panel de Ualá Bis.`,
      ]);
      return "pending";
    }

    // Lock: solo un proceso pasa la reserva a pagada.
    const { data: claimed, error: upErr } = await supabase
      .from("event_registrations")
      .update({
        ...fields,
        mercadopago_status_detail: null,
        status: "confirmed",
        payment_status: "approved",
        payment_method: "uala",
        amount_paid: total,
        paid_at: new Date().toISOString(),
      })
      .eq("id", registration.id)
      .neq("payment_status", "approved")
      .select("id")
      .maybeSingle();
    if (upErr) throw new Error(`Supabase update: ${upErr.message}`);
    if (!claimed) return "confirmed";

    await notifyAdmin(`💳 Pago confirmado con Ualá: ${registration.first_name} ${registration.last_name}`, [
      `${registration.first_name} ${registration.last_name} pagó ${money(due, "ARS")} con Ualá.`,
      `Código: ${registration.external_reference} · ${registration.quantity} entrada(s).`,
      `Ya le llegó la entrada con el QR por mail.`,
    ]);
    await maybeSendConfirmationEmail(registration);
    return "confirmed";
  }

  if (status === "REJECTED") {
    // La reserva sigue en pie: puede reintentar o transferir.
    await supabase.from("event_registrations").update(fields).eq("id", registration.id);
    return "failed";
  }

  return "pending";
}
