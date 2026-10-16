import "server-only";
import { createHmac } from "node:crypto";

/** URL pública del sitio, para los links de los mails. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit && !explicit.includes("localhost")) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return "https://valen22.vercel.app";
}

/** Firma corta del código de reserva: el link de la entrada no se puede adivinar. */
export function ticketToken(reference: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "epm";
  return createHmac("sha256", secret).update(`entrada:${reference}`).digest("base64url").slice(0, 16);
}

export function ticketUrl(reference: string): string {
  return `${siteUrl()}/entrada/${encodeURIComponent(reference)}?t=${ticketToken(reference)}`;
}
