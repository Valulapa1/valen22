export type AdminRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  quantity: number;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  external_reference: string;
  paid_at: string | null;
  created_at: string;
  ticket_type?: string | null;
  payment_method?: string | null;
  payment_plan?: string | null;
  installments?: number | null;
  amount_paid?: number | null;
  ticket_url?: string;
};

/** Lo cobrado: si la reserva es anterior a las cuotas, pagada = total. */
export function paidOf(r: AdminRow): number {
  const paid = Number(r.amount_paid ?? 0);
  if (paid > 0) return paid;
  return r.status === "confirmed" ? Number(r.total_amount) : 0;
}
