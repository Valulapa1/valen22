import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con Service Role Key. SOLO puede importarse desde código
 * de servidor (el import de "server-only" hace fallar el build si se cuela en
 * un bundle de cliente). La tabla event_registrations tiene RLS activado sin
 * policies, así que este cliente es la única vía de lectura/escritura.
 */
export function getSupabaseAdmin(): SupabaseClient {
  // La integración de Supabase en Vercel carga SUPABASE_URL y también
  // NEXT_PUBLIC_SUPABASE_URL; aceptamos cualquiera de las dos.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan variables de entorno de Supabase (NEXT_PUBLIC_SUPABASE_URL y/o " +
        "SUPABASE_SERVICE_ROLE_KEY). Ver MERCADOPAGO_SETUP.md.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type RegistrationRow = {
  id: string;
  event_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  document_number: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  currency: string;
  status: "pending" | "confirmed" | "payment_failed" | "error";
  payment_status: string;
  mercadopago_preference_id: string | null;
  mercadopago_payment_id: string | null;
  mercadopago_status: string | null;
  mercadopago_status_detail: string | null;
  external_reference: string;
  visitor_id: string | null;
  paid_at: string | null;
  confirmation_email_sent_at: string | null;
  created_at: string;
  updated_at: string;
};
