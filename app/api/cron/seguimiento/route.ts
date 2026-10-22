import { findSuspicious, suspiciousReason } from "@/lib/spam";
import { NextResponse } from "next/server";
import { getPaymentSchedule, type PaymentPlan } from "@/config/event";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUsdRate } from "@/lib/dolar";
import {
  emailEnabled,
  installmentReminderEmail,
  leadFollowupEmail,
  notifyAdmin,
  sendEmail,
  unpaidReminderEmail,
  type ReservationForEmail,
} from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 36e5;
type Tier = "general" | "vip" | "platino";

/**
 * GET /api/cron/seguimiento — lo corre Vercel una vez por día (vercel.json).
 *  1. Reservas sin pagar: recordatorio a las ~24 hs y último aviso a las ~48 hs.
 *  2. Cuotas: aviso 3 días antes del vencimiento y el mismo día.
 *  3. Contactos que no reservaron: un mail de seguimiento al día siguiente.
 *  4. Resumen del día para Valentina.
 * Protegido con CRON_SECRET (Vercel lo manda solo en el header Authorization).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!emailEnabled()) return NextResponse.json({ ok: true, skipped: "email_not_configured" });

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const today = new Date(now - 3 * HOUR).toISOString().slice(0, 10); // fecha argentina
  const usdRate = await getUsdRate();
  const log = { unpaid1: 0, unpaid2: 0, cuotas: 0, leads: 0 };

  const { data: regs } = await supabase
    .from("event_registrations")
    .select(
      "id, first_name, last_name, email, phone, quantity, total_amount, currency, status, external_reference, ticket_type, payment_plan, installments, amount_paid, reminders_sent, installment_reminder_at, created_at",
    )
    .eq("status", "pending");

  for (const r of regs ?? []) {
    // Reservas hechas por bots: sin recordatorios.
    if (suspiciousReason({ firstName: `${r.first_name} ${r.last_name}`, email: r.email, phone: r.phone })) continue;
    const paid = Number(r.amount_paid ?? 0);
    const age = now - new Date(r.created_at).getTime();
    const tier = (r.ticket_type ?? "general") as Tier;
    const plan = (r.payment_plan ?? "unico") as PaymentPlan;
    // El cronograma se calcula desde el día de la reserva, igual que se le mostró.
    let schedule = getPaymentSchedule(tier, Number(r.quantity), plan, new Date(r.created_at));
    if (schedule.reduce((s, x) => s + x.amount, 0) !== Number(r.total_amount)) {
      schedule = [{ date: r.created_at.slice(0, 10), amount: Number(r.total_amount) }];
    }
    const base: ReservationForEmail = {
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      phone: r.phone,
      quantity: Number(r.quantity),
      total_amount: Number(r.total_amount),
      currency: r.currency,
      external_reference: r.external_reference,
      ticket_type: r.ticket_type,
      schedule,
      amount_paid: paid,
    };

    if (paid === 0) {
      const sent = Number(r.reminders_sent ?? 0);
      const n: 1 | 2 | null = sent === 0 && age > 20 * HOUR ? 1 : sent === 1 && age > 44 * HOUR ? 2 : null;
      if (!n) continue;
      const ok = await sendEmail({ to: r.email, ...unpaidReminderEmail(base, n, usdRate) });
      if (ok) {
        await supabase
          .from("event_registrations")
          .update({ reminders_sent: n, last_reminder_at: new Date().toISOString() })
          .eq("id", r.id);
        log[n === 1 ? "unpaid1" : "unpaid2"]++;
      }
      continue;
    }

    // Señada: buscamos la próxima cuota impaga.
    if (schedule.length < 2) continue;
    let acc = 0;
    let next: { index: number; date: string; amount: number } | null = null;
    for (let i = 0; i < schedule.length; i++) {
      acc += schedule[i].amount;
      if (acc > paid) {
        next = { index: i, ...schedule[i] };
        break;
      }
    }
    if (!next || next.index === 0) continue;
    const days = Math.round((new Date(`${next.date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / (24 * HOUR));
    if (days !== 3 && days !== 0) continue;
    const last = r.installment_reminder_at ? new Date(r.installment_reminder_at).getTime() : 0;
    if (now - last < 20 * HOUR) continue;
    const ok = await sendEmail({ to: r.email, ...installmentReminderEmail(base, next, days === 0, usdRate) });
    if (ok) {
      await supabase.from("event_registrations").update({ installment_reminder_at: new Date().toISOString() }).eq("id", r.id);
      log.cuotas++;
    }
  }

  // Contactos con email, de hace más de ~20 hs, sin seguimiento y sin reserva.
  const { data: leads } = await supabase
    .from("leads")
    .select("id, first_name, email, phone, source, created_at, followup_sent_at")
    .is("followup_sent_at", null)
    .not("email", "is", null)
    .lt("created_at", new Date(now - 20 * HOUR).toISOString())
    .gt("created_at", new Date(now - 7 * 24 * HOUR).toISOString())
    .neq("source", "reserva")
    .neq("source", "aplicacion_platino")
    .limit(200);

  // Bots: se los mira junto con todos los registros recientes de su mismo
  // mail, así se reconocen aunque ese registro puntual parezca normal.
  const emails = [...new Set((leads ?? []).map((l) => String(l.email).toLowerCase()))];
  const { data: sameMail } = emails.length
    ? await supabase
        .from("leads")
        .select("id, first_name, email, phone")
        .in("email", emails)
        .gt("created_at", new Date(now - 30 * 24 * HOUR).toISOString())
        .limit(2000)
    : { data: [] };
  const suspicious = findSuspicious([...(sameMail ?? []), ...(leads ?? [])]);
  let skipped = 0;

  const { data: allRegs } = await supabase.from("event_registrations").select("email, phone");
  const booked = new Set((allRegs ?? []).flatMap((x) => [String(x.email).toLowerCase(), String(x.phone).replace(/\D/g, "")]));
  for (const l of leads ?? []) {
    if (!l.email) continue;
    if (suspicious.has(l.id)) {
      await supabase.from("leads").update({ followup_sent_at: new Date().toISOString() }).eq("id", l.id);
      skipped++;
      continue;
    }
    const isEvent = !String(l.source).startsWith("home_") || l.source === "home_clase";
    if (isEvent && (booked.has(l.email.toLowerCase()) || booked.has(String(l.phone).replace(/\D/g, "")))) {
      await supabase.from("leads").update({ followup_sent_at: new Date().toISOString() }).eq("id", l.id);
      continue;
    }
    const ok = await sendEmail({ to: l.email, ...leadFollowupEmail(l) });
    if (ok) {
      await supabase.from("leads").update({ followup_sent_at: new Date().toISOString() }).eq("id", l.id);
      log.leads++;
    }
  }

  const pendientes = (regs ?? []).filter((r) => Number(r.amount_paid ?? 0) === 0).length;
  const senadas = (regs ?? []).length - pendientes;
  if (log.unpaid1 + log.unpaid2 + log.cuotas + log.leads > 0 || pendientes > 0) {
    await notifyAdmin("Resumen del día · Estoy Para Más", [
      `Mails enviados hoy: ${log.unpaid1} recordatorios de pago, ${log.unpaid2} últimos avisos, ${log.cuotas} avisos de cuota, ${log.leads} seguimientos a contactos.`,
      `Reservas sin pagar: ${pendientes}. Señadas con cuotas pendientes: ${senadas}.`,
    ]);
  }

  return NextResponse.json({ ok: true, ...log, botsSkipped: skipped });
}
