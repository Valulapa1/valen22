import "server-only";

/**
 * Ualá Bis · API Cobros Online (v2).
 * Docs: https://developers.ualabis.com.ar/v2/ambientes
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   UALA_USERNAME          username        (app Ualá → Ualá Bis → Integración en tiendas online → API Cobros Online)
 *   UALA_CLIENT_ID         client_id
 *   UALA_CLIENT_SECRET     client_secret_id
 *   UALA_ENV               "produccion" para cobrar de verdad; cualquier otro valor (o vacío) = pruebas.
 *
 * Las credenciales de prueba y las de producción son distintas: tienen que
 * coincidir con UALA_ENV o Ualá responde error de autenticación.
 */

const isProd = () => (process.env.UALA_ENV ?? "").trim().toLowerCase().startsWith("prod");

const authUrl = () =>
  isProd()
    ? "https://auth.developers.ar.ua.la/v2/api/auth/token"
    : "https://auth.stage.developers.ar.ua.la/v2/api/auth/token";

const apiUrl = () =>
  isProd() ? "https://checkout.developers.ar.ua.la/v2/api" : "https://checkout.stage.developers.ar.ua.la/v2/api";

export function isUalaEnabled(): boolean {
  return Boolean(process.env.UALA_USERNAME && process.env.UALA_CLIENT_ID && process.env.UALA_CLIENT_SECRET);
}

export function isUalaTest(): boolean {
  return !isProd();
}

let cached: { token: string; expiresAt: number; prod: boolean } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.prod === isProd() && Date.now() < cached.expiresAt) return cached.token;
  const res = await fetch(authUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.UALA_USERNAME,
      client_id: process.env.UALA_CLIENT_ID,
      client_secret_id: process.env.UALA_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; message?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Ualá: no se pudo autenticar (${res.status}) ${json.message ?? ""}`.trim());
  }
  // Renovamos un minuto antes de que venza.
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in ?? 3600) - 60) * 1000,
    prod: isProd(),
  };
  return cached.token;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; Message?: string };
  if (!res.ok) {
    if (res.status === 401) cached = null;
    throw new Error(`Ualá ${path} respondió ${res.status}: ${json.message ?? json.Message ?? ""}`.trim());
  }
  return json;
}

export type UalaOrder = {
  uuid: string;
  status: "PENDING" | "PROCESSED" | "APPROVED" | "REJECTED" | "REFUNDED" | string;
  amount: number | string;
  external_reference?: string | null;
};

/**
 * Crea la orden y devuelve el link de pago de Ualá.
 * El importe va en pesos, como texto ("40000" = $40.000). Probado en producción:
 * mandarlo en centavos hacía que Ualá cobrara 100 veces más.
 */
export async function createUalaOrder(input: {
  amountPesos: number;
  description: string;
  externalReference: string;
  successUrl: string;
  failUrl: string;
  notificationUrl: string;
}): Promise<{ uuid: string; checkoutUrl: string }> {
  const data = await call<{ uuid?: string; links?: { checkout_link?: string } }>("/checkout", {
    method: "POST",
    body: JSON.stringify({
      amount: String(Math.round(input.amountPesos)),
      description: input.description.slice(0, 120),
      callback_success: input.successUrl,
      callback_fail: input.failUrl,
      notification_url: input.notificationUrl,
      external_reference: input.externalReference,
    }),
  });
  const checkoutUrl = data.links?.checkout_link;
  if (!data.uuid || !checkoutUrl) throw new Error("Ualá no devolvió el link de pago.");
  return { uuid: data.uuid, checkoutUrl };
}

export async function getUalaOrder(uuid: string): Promise<UalaOrder> {
  return call<UalaOrder>(`/orders/${encodeURIComponent(uuid)}`);
}

/**
 * ¿El importe de la orden coincide con lo que se esperaba cobrar?
 * Acepta el valor en centavos (formato de la v2) o en pesos, por las dudas.
 */
export function ualaAmountMatches(orderAmount: number | string, expectedPesos: number[]): boolean {
  const a = Number(orderAmount);
  if (!Number.isFinite(a)) return false;
  return expectedPesos.some((p) => Math.round(a) === Math.round(p * 100) || Math.round(a) === Math.round(p));
}

/** Guardamos el uuid de Ualá en la columna de "preferencia" con este prefijo. */
export const UALA_PREFIX = "uala:";
