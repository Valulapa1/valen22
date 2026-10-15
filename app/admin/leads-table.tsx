"use client";

import { useMemo, useState } from "react";

export type LeadRow = {
  id: string;
  first_name: string;
  email: string | null;
  phone: string;
  interest: string | null;
  source: string;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  popup_evento: "Ventana del evento",
  inline_evento: "Página del evento",
  home_clase: "Clase de regalo",
  reserva: "Reserva",
};

const INTEREST_LABEL: Record<string, string> = {
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

function waLink(phone: string, name: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `549${digits}`;
  const text = `Hola ${name}! Soy Vale, de Estoy Para Más ✨`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function toCsv(rows: LeadRow[]): string {
  const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Nombre", "WhatsApp", "Email", "Interés", "Origen", "Fecha"].join(",");
  const lines = rows.map((r) =>
    [
      esc(r.first_name),
      esc(r.phone),
      esc(r.email),
      esc(r.interest ? INTEREST_LABEL[r.interest] ?? r.interest : ""),
      esc(SOURCE_LABEL[r.source] ?? r.source),
      esc(formatDate(r.created_at)),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (source !== "all" && r.source !== source) return false;
      if (!q) return true;
      return `${r.first_name} ${r.email ?? ""} ${r.phone}`.toLowerCase().includes(q);
    });
  }, [rows, search, source]);

  function download() {
    const blob = new Blob(["﻿" + toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contactos-estoy-para-mas.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Buscar por nombre, email o WhatsApp..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar contactos"
        />
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filtrar por origen">
          <option value="all">Todos los orígenes</option>
          <option value="popup_evento">Ventana del evento</option>
          <option value="inline_evento">Página del evento</option>
          <option value="home_clase">Clase de regalo</option>
          <option value="reserva">Reserva</option>
        </select>
        <button type="button" className="admin-action" onClick={download} disabled={filtered.length === 0}>
          Descargar Excel
        </button>
      </div>

      <div className="admin-table-wrap">
        {filtered.length === 0 ? (
          <div className="admin-empty">
            {rows.length === 0 ? "Todavía no hay contactos." : "Nada coincide con ese filtro."}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>WhatsApp</th>
                <th>Email</th>
                <th>Interés</th>
                <th>Origen</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.first_name}</td>
                  <td>
                    <a href={waLink(r.phone, r.first_name.split(" ")[0])} target="_blank" rel="noopener noreferrer">
                      {r.phone}
                    </a>
                  </td>
                  <td>{r.email ?? "—"}</td>
                  <td>{r.interest ? INTEREST_LABEL[r.interest] ?? r.interest : "—"}</td>
                  <td>{SOURCE_LABEL[r.source] ?? r.source}</td>
                  <td>{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
