import "server-only";
import { eventConfig } from "@/config/event";
import type { RegistrationRow } from "@/lib/supabase-admin";

/**
 * Email de confirmación desacoplado del webhook.
 *
 * El proyecto no usa Resend todavía, así que esta función habla con la API
 * REST de Resend vía fetch (sin dependencia extra). Se activa sola cuando
 * existan estas variables de entorno:
 *
 *   RESEND_API_KEY=re_xxxxxxxx
 *   CONFIRMATION_EMAIL_FROM="Estoy Para Más <hola@tudominio.com>"
 *
 * Si no están configuradas, loguea una advertencia y no bloquea el flujo de
 * pago. El webhook solo la llama la primera vez que un pago pasa a aprobado
 * (guardado por confirmation_email_sent_at), así que nunca se envía dos veces.
 */
export async function sendConfirmationEmail(
  registration: RegistrationRow,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CONFIRMATION_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      "[email] Confirmación no enviada: faltan RESEND_API_KEY y/o CONFIRMATION_EMAIL_FROM.",
    );
    return { sent: false, reason: "email_not_configured" };
  }

  const fecha = eventConfig.eventDateLabel;

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1A1017">
      <h1 style="font-weight:400;color:#33202F">Tu lugar está confirmado</h1>
      <p>Hola ${escapeHtml(registration.first_name)},</p>
      <p>Recibimos tu pago y tu inscripción a <strong>${escapeHtml(eventConfig.name)}</strong> quedó confirmada.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;font-family:monospace;font-size:14px">
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">${fecha}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">Horario</td><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">${eventConfig.eventTime} hs</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">Ubicación</td><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">${escapeHtml(eventConfig.location)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">Entradas</td><td style="padding:8px 0;border-bottom:1px solid #E2D9CC">${registration.quantity}</td></tr>
        <tr><td style="padding:8px 0">Código de inscripción</td><td style="padding:8px 0"><strong>${escapeHtml(registration.external_reference)}</strong></td></tr>
      </table>
      <p>Guardá este correo: el código de inscripción es tu comprobante de entrada.</p>
      <p style="color:#6E6169;font-size:13px">¿Dudas? Escribinos a ${escapeHtml(eventConfig.contactEmail)}.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [registration.email],
        subject: `Tu entrada a ${eventConfig.name} está confirmada`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend respondió ${res.status}: ${body.slice(0, 300)}`);
      return { sent: false, reason: `resend_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] Error enviando confirmación:", err);
    return { sent: false, reason: "network_error" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
