"use client";

import { useMemo, useState } from "react";

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
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Pagado",
  pending: "Por cobrar",
  payment_failed: "Cancelado",
  error: "Error",
};

const TIER_LABEL: Record<string, string> = {
  general: "General",
  vip: "VIP",
  platino: "Platino",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(n: number, currency: string): string {
  return currency === "USD"
    ? `USD ${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
    : Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function waLink(phone: string, name: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `549${digits}`; // celular argentino sin prefijo
  const text = `Hola ${name}! Te escribo por tu reserva para Estoy Para Más ✨`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function RegistrationsTable({ rows: initialRows }: { rows: AdminRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [tier, setTier] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (tier !== "all" && (r.ticket_type ?? "general") !== tier) return false;
      if (!q) return true;
      const haystack = `${r.first_name} ${r.last_name} ${r.email} ${r.phone} ${r.external_reference}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, status, tier]);

  async function setRowStatus(id: string, next: "confirmed" | "pending" | "payment_failed") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/registrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) throw new Error();
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    } catch {
      alert("No se pudo actualizar. Probá de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Buscar por nombre, email, WhatsApp o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar reservas"
        />
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filtrar por entrada">
          <option value="all">Todas las entradas</option>
          <option value="general">General</option>
          <option value="vip">VIP</option>
          <option value="platino">Platino</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por estado">
          <option value="all">Todos los estados</option>
          <option value="confirmed">Pagado</option>
          <option value="pending">Por cobrar</option>
          <option value="payment_failed">Cancelado</option>
        </select>
      </div>

      <div className="admin-table-wrap">
        {filtered.length === 0 ? (
          <div className="admin-empty">
            {rows.length === 0 ? "Todavía no hay reservas." : "Nada coincide con ese filtro."}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Entrada</th>
                <th>WhatsApp</th>
                <th>Email</th>
                <th>Cant.</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Acción</th>
                <th>Fecha</th>
                <th>Código</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.first_name} {r.last_name}
                  </td>
                  <td>
                    <span className={`admin-tier ${r.ticket_type ?? "general"}`}>
                      {TIER_LABEL[r.ticket_type ?? "general"] ?? r.ticket_type}
                    </span>
                  </td>
                  <td>
                    <a href={waLink(r.phone, r.first_name)} target="_blank" rel="noopener noreferrer">
                      {r.phone}
                    </a>
                  </td>
                  <td>{r.email}</td>
                  <td>{r.quantity}</td>
                  <td>{formatMoney(r.total_amount, r.currency)}</td>
                  <td>
                    <span className={`admin-badge ${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  </td>
                  <td>
                    {r.status === "confirmed" ? (
                      <button
                        type="button"
                        className="admin-action ghost"
                        disabled={busy === r.id}
                        onClick={() => setRowStatus(r.id, "pending")}
                      >
                        Deshacer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-action"
                        disabled={busy === r.id}
                        onClick={() => setRowStatus(r.id, "confirmed")}
                      >
                        Marcar pagado
                      </button>
                    )}
                  </td>
                  <td>{formatDate(r.created_at)}</td>
                  <td>{r.external_reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
