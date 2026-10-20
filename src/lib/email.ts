import "server-only";
import { eventConfig, profileFormUrl } from "@/config/event";
import { siteUrl, ticketUrl } from "@/lib/site";

/**
 * Mails de Estoy Para Más vía Resend (API REST, sin dependencias).
 * Se activan solos cuando existen en Vercel:
 *   RESEND_API_KEY      la clave de Resend
 *   EMAIL_FROM          "Estoy Para Más <hola@valentinaparodi.com>"
 *   ADMIN_NOTIFY_EMAIL  (opcional) a dónde le avisamos a Valentina
 *   EMAIL_REPLY_TO      (opcional) a dónde llegan las respuestas
 * Sin esas variables no se envía nada y la web sigue funcionando igual.
 */

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && (process.env.EMAIL_FROM || process.env.CONFIRMATION_EMAIL_FROM));
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.CONFIRMATION_EMAIL_FROM;
  if (!apiKey || !from || !opts.to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Error de red:", (err as Error).message);
    return false;
  }
}

/** Aviso interno a Valentina (si configuró ADMIN_NOTIFY_EMAIL). */
export async function notifyAdmin(subject: string, lines: string[]): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  await sendEmail({
    to,
    subject,
    html: layout(
      subject,
      `<p>${lines.map(esc).join("<br>")}</p>${button(`${siteUrl()}/admin`, "Abrir mi panel")}`,
    ),
  });
}

// ---------------------------------------------------------------- formato

export function esc(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function money(n: number, currency: string): string {
  return currency === "USD"
    ? `USD ${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
    : `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

function button(href: string, label: string): string {
  return `<p style="margin:28px 0"><a href="${href}" style="display:inline-block;background:#A87C4F;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-weight:bold;font-size:15px">${esc(label)}</a></p>`;
}

function waLink(text: string): string {
  return `https://api.whatsapp.com/send?phone=${eventConfig.whatsappNumber}&text=${encodeURIComponent(text)}`;
}

export function layout(preheader: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F4EEE7">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4EEE7;padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#33202F;padding:22px 28px;color:#ffffff;font-family:Georgia,serif;letter-spacing:4px;font-size:15px">ESTOY PARA MÁS</td></tr>
<tr><td style="padding:30px 28px;font-family:Georgia,serif;color:#1E1419;font-size:16px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:18px 28px 26px;font-family:Arial,sans-serif;color:#8a7a84;font-size:12px;line-height:1.5;border-top:1px solid #EFE6DD">
Estoy Para Más · ${esc(eventConfig.eventDateLabel)} · Capital Federal, Buenos Aires<br>
¿Dudas? Respondé este mail o <a href="${waLink("Hola Valen! Tengo una consulta sobre Estoy Para Más")}" style="color:#A87C4F">escribinos por WhatsApp</a>.
</td></tr></table></td></tr></table></body></html>`;
}

type Accounts = typeof eventConfig.paymentAccounts;
function accountBlock(title: string, rows: readonly (readonly [string, string])[], extra?: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EFE6DD;border-radius:10px;margin:10px 0;font-family:Arial,sans-serif;font-size:14px">
<tr><td colspan="2" style="padding:10px 14px;font-weight:bold;background:#FAF6F0">${esc(title)}${extra ? ` · <span style="font-weight:normal">${esc(extra)}</span>` : ""}</td></tr>
${rows.map(([k, v]) => `<tr><td style="padding:6px 14px;color:#8a7a84">${esc(k)}</td><td style="padding:6px 14px;text-align:right;font-family:monospace">${esc(v)}</td></tr>`).join("")}
</table>`;
}

// ---------------------------------------------------------------- reservas

export type ReservationForEmail = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  quantity: number;
  total_amount: number;
  currency: string;
  external_reference: string;
  ticket_type?: string | null;
  label?: string;
  schedule: { date: string; amount: number }[];
  amount_paid?: number;
};

function tierLabel(r: ReservationForEmail): string {
  if (r.label) return r.label;
  const t = (r.ticket_type ?? "general") as keyof typeof eventConfig.tiers;
  return eventConfig.tiers[t]?.label ?? "General";
}

function payBlock(r: ReservationForEmail, amount: number, usdRate: number | null): string {
  const acc: Accounts = eventConfig.paymentAccounts;
  if (r.currency === "USD") {
    const pesos = usdRate ? ` (o ${money(Math.round(amount * usdRate), "ARS")} al dólar blue de hoy)` : "";
    return `<p style="margin:18px 0 6px">Transferí <b>${money(amount, "USD")}</b>${esc(pesos)} a la cuenta que te quede más cómoda:</p>
${accountBlock(acc.usdAr.title, acc.usdAr.rows)}${accountBlock(acc.usdExt.title, acc.usdExt.rows)}${accountBlock(acc.ars.title, acc.ars.rows, "en pesos al dólar blue del día")}`;
  }
  return `<p style="margin:18px 0 6px">Transferí <b>${money(amount, "ARS")}</b> a:</p>${accountBlock(acc.ars.title, acc.ars.rows)}`;
}

function scheduleBlock(r: ReservationForEmail): string {
  if (r.schedule.length < 2) return "";
  return `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:14px;margin:8px 0">
${r.schedule.map((x, i) => `<tr><td style="padding:6px 0;border-bottom:1px dashed #EFE6DD">${i === 0 ? "Seña · al reservar" : `Cuota ${i + 1} · antes del ${shortDate(x.date)}`}</td><td style="padding:6px 0;border-bottom:1px dashed #EFE6DD;text-align:right"><b>${money(x.amount, r.currency)}</b></td></tr>`).join("")}
</table><p style="font-size:13px;color:#8a7a84;font-family:Arial,sans-serif">La seña confirma tu lugar y no es reembolsable. Las cuotas se completan antes del 15 de diciembre.</p>`;
}

function profileBlock(r: ReservationForEmail): string {
  const url = profileFormUrl({ reference: r.external_reference, name: `${r.first_name} ${r.last_name}`, email: r.email, phone: r.phone });
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6F0;border-radius:12px;margin:22px 0"><tr><td style="padding:18px 20px">
<p style="margin:0 0 6px;font-weight:bold">Contanos de vos 🤍</p>
<p style="margin:0 0 4px;font-size:15px">Así preparo Estoy Para Más pensando en vos. Te lleva 2 minutos.</p>
<a href="${url}" style="color:#A87C4F;font-weight:bold">Completar mi perfil →</a></td></tr></table>`;
}

function comprobanteButton(r: ReservationForEmail): string {
  return button(
    waLink(`Hola Valen! Te mando el comprobante de mi reserva ${r.external_reference} (${r.first_name} ${r.last_name}) 👇`),
    "Enviar comprobante por WhatsApp",
  );
}

function mpBlock(r: ReservationForEmail): string {
  if (r.currency !== "ARS") return "";
  const url = `${siteUrl()}/api/mercadopago/pagar?ref=${encodeURIComponent(r.external_reference)}`;
  return `${button(url, "Pagar ahora con Mercado Pago")}
<p style="margin:-14px 0 18px;font-size:13px;color:#8a7a84;font-family:Arial,sans-serif">Tarjeta de crédito en cuotas, débito o dinero en cuenta. Tu entrada te llega al instante.</p>`;
}

/** 1) Apenas reserva: resumen + datos para pagar. */
export function reservationEmail(r: ReservationForEmail, usdRate: number | null) {
  const first = r.schedule[0]?.amount ?? r.total_amount;
  return {
    subject: `Tu lugar en Estoy Para Más está reservado, ${r.first_name} 🤍`,
    html: layout(
      "Te guardamos el lugar 48 hs: estos son los datos para transferir.",
      `<h1 style="font-weight:400;font-size:26px;margin:0 0 12px">¡Tu lugar está reservado, ${esc(r.first_name)}!</h1>
<p>Reservaste <b>${esc(tierLabel(r))}</b> · ${r.quantity} ${r.quantity > 1 ? "entradas" : "entrada"} · total <b>${money(r.total_amount, r.currency)}</b>.<br>
Código de reserva: <b>${esc(r.external_reference)}</b></p>
${scheduleBlock(r)}
${r.schedule.length < 2 ? `${mpBlock(r)}<p style="margin:18px 0 0"><b>¿Preferís transferir?</b></p>` : ""}
${payBlock(r, first, usdRate)}
<p>Te guardamos el lugar <b>48 hs</b>. Si transferís, mandanos el comprobante y te enviamos tu entrada.</p>
${comprobanteButton(r)}
${profileBlock(r)}
<p>Nos vemos el 6 de marzo.<br>Valen</p>`,
    ),
  };
}

/** 2) Recordatorio si no pagó (n = 1 a las ~24 hs, n = 2 a las ~48 hs). */
export function unpaidReminderEmail(r: ReservationForEmail, n: 1 | 2, usdRate: number | null) {
  const first = r.schedule[0]?.amount ?? r.total_amount;
  const title = n === 1 ? `${r.first_name}, tu lugar sigue guardado` : `Último aviso: hoy se libera tu lugar`;
  const intro =
    n === 1
      ? `Ayer reservaste tu lugar en Estoy Para Más y todavía no nos llegó el pago. Podés cerrarlo en un minuto con Mercado Pago (también en cuotas) o por transferencia.`
      : `Tu reserva vence hoy. Si querés vivir Estoy Para Más, completá el pago hoy: si no, el lugar pasa a otra mujer que lo está esperando.`;
  return {
    subject: n === 1 ? `${r.first_name}, ¿pudiste hacer la transferencia?` : `Hoy se libera tu lugar en Estoy Para Más`,
    html: layout(
      intro,
      `<h1 style="font-weight:400;font-size:24px;margin:0 0 12px">${esc(title)}</h1>
<p>${esc(intro)}</p>
<p>Tu reserva: <b>${esc(tierLabel(r))}</b> · ${r.quantity} ${r.quantity > 1 ? "entradas" : "entrada"} · código <b>${esc(r.external_reference)}</b></p>
${r.schedule.length < 2 ? `${mpBlock(r)}<p style="margin:18px 0 0"><b>¿Preferís transferir?</b></p>` : ""}
${payBlock(r, first, usdRate)}
${comprobanteButton(r)}
<p>Si tenés alguna duda o algo te frena, respondé este mail y lo hablamos.<br>Valen</p>`,
    ),
  };
}

/** 3) Recordatorio de cuota (VIP / Platino en cuotas). */
export function installmentReminderEmail(
  r: ReservationForEmail,
  next: { index: number; date: string; amount: number },
  dueToday: boolean,
  usdRate: number | null,
) {
  const when = dueToday ? "hoy" : `el ${shortDate(next.date)}`;
  return {
    subject: `Recordatorio: tu cuota ${next.index + 1} de Estoy Para Más vence ${when}`,
    html: layout(
      `Tu cuota ${next.index + 1} vence ${when}.`,
      `<h1 style="font-weight:400;font-size:24px;margin:0 0 12px">Hola ${esc(r.first_name)}, se viene tu cuota</h1>
<p>Tu cuota <b>${next.index + 1} de ${r.schedule.length}</b> de <b>${esc(tierLabel(r))}</b> vence <b>${when}</b>. Ya pagaste ${money(r.amount_paid ?? 0, r.currency)} de ${money(r.total_amount, r.currency)}.</p>
${payBlock(r, next.amount, usdRate)}
${comprobanteButton(r)}
<p>Gracias por apostar por vos.<br>Valen</p>`,
    ),
  };
}

/** 4) Pagó todo: la entrada. */
export function ticketEmail(r: ReservationForEmail, profileDone = false) {
  const url = ticketUrl(r.external_reference);
  const qr = `${siteUrl()}/api/entrada/qr?c=${encodeURIComponent(r.external_reference)}&t=${url.split("t=")[1]}`;
  return {
    subject: `🎟️ Tu entrada a Estoy Para Más`,
    html: layout(
      "Tu pago está confirmado. Esta es tu entrada.",
      `<h1 style="font-weight:400;font-size:26px;margin:0 0 12px">¡Ya estás adentro, ${esc(r.first_name)}! 🤍</h1>
<p>Recibimos tu pago. Esta es tu entrada para <b>Estoy Para Más · 2.ª edición</b>.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EFE6DD;border-radius:12px;font-family:Arial,sans-serif;font-size:14px;margin:16px 0">
<tr><td style="padding:16px" align="center"><img src="${qr}" width="200" height="200" alt="Código QR de tu entrada" style="display:block"></td></tr>
<tr><td style="padding:0 16px 6px" align="center"><b style="font-size:16px">${esc(r.first_name)} ${esc(r.last_name)}</b></td></tr>
<tr><td style="padding:0 16px 6px" align="center">${esc(tierLabel(r))} · ${r.quantity} ${r.quantity > 1 ? "entradas" : "entrada"}</td></tr>
<tr><td style="padding:0 16px 16px;font-family:monospace" align="center">${esc(r.external_reference)}</td></tr>
</table>
<p><b>Cuándo:</b> ${esc(eventConfig.eventDateLabel)}, de ${esc(eventConfig.eventHours)}.<br>
<b>Dónde:</b> Capital Federal, Buenos Aires. Te mandamos la dirección exacta unos días antes.</p>
${button(url, "Ver mi entrada")}
<p>Mostrá el QR en la entrada (desde el celular está perfecto). Si no podés ir, podés transferirla a una amiga: avisanos por WhatsApp.</p>
${profileDone ? "" : profileBlock(r)}
<p>Te espero con mucho amor 🤍<br>Valen</p>`,
    ),
  };
}

// ---------------------------------------------------------------- contactos

export function leadFollowupEmail(lead: { first_name: string; source: string }) {
  const name = lead.first_name.split(" ")[0];
  const fromHome = lead.source === "home_transformarte" || lead.source === "home_adn";
  if (fromHome) {
    const prog = lead.source === "home_adn" ? "Método ADN" : "Transformarte";
    return {
      subject: `${name}, ¿seguimos la charla?`,
      html: layout(
        "Quedó pendiente nuestra charla.",
        `<h1 style="font-weight:400;font-size:24px;margin:0 0 12px">Hola ${esc(name)} 🤍</h1>
<p>Ayer te interesaste en <b>${prog}</b>. Si la charla quedó a mitad de camino o no llegaste a agendar, acá estoy.</p>
<p>No hace falta tenerlo todo claro: solo decidir empezar.</p>
${button(lead.source === "home_adn" ? "https://calendly.com/valentinaparodi/60min" : waLink(`Hola Valen! Soy ${name}, quiero saber más de Transformarte ✨`), lead.source === "home_adn" ? "Agendar mi llamada" : "Hablar con Valentina")}
<p>Con mucho amor,<br>Valen</p>`,
      ),
    };
  }
  return {
    subject: `${name}, ¿te quedó alguna duda sobre Estoy Para Más?`,
    html: layout(
      "Dos días que pueden cambiar tu año.",
      `<h1 style="font-weight:400;font-size:24px;margin:0 0 12px">Hola ${esc(name)} 🤍</h1>
<p>Ayer dejaste tus datos en la página de <b>Estoy Para Más</b>. Te cuento lo más importante en 3 líneas:</p>
<ul style="padding-left:18px"><li>Sábado 6 y domingo 7 de marzo, en Capital Federal. Vamos por 500 mujeres.</li>
<li>Sábado: tu transformación personal. Domingo: tu nuevo entorno.</li>
<li>Venite con una amiga: 2 entradas generales a precio especial.</li></ul>
${button(`${siteUrl()}/estoy-para-mas#entradas`, "Ver las entradas")}
<p>Si algo te frena, respondé este mail y lo charlamos.<br>Valen</p>`,
    ),
  };
}
