"use client";

import { useState } from "react";

/** Panel de la puerta: solo aparece si quien escanea tiene la sesión del panel. */
export function CheckIn({ reference, initialUsed, quantity, paid }: { reference: string; initialUsed: number; quantity: number; paid: boolean }) {
  const [used, setUsed] = useState(initialUsed);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(undo = false) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, undo }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: j.error ?? "No se pudo registrar." });
        if (typeof j.used === "number") setUsed(j.used);
      } else {
        setUsed(j.used);
        setMsg({ ok: true, text: undo ? "Ingreso deshecho." : "✓ ¡Adelante! Ingreso registrado." });
      }
    } catch {
      setMsg({ ok: false, text: "Sin conexión. Probá de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  const full = used >= quantity;
  const box: React.CSSProperties = { marginTop: 22, padding: 16, borderRadius: 14, border: "2px dashed #A87C4F", fontFamily: "Arial, sans-serif", textAlign: "center" };
  const btn: React.CSSProperties = { width: "100%", border: "none", borderRadius: 999, padding: "16px 18px", fontSize: 17, fontWeight: 700, cursor: "pointer", color: "#fff" };

  return (
    <div style={box}>
      <p style={{ margin: "0 0 4px", fontSize: 12, letterSpacing: 2, color: "#A87C4F" }}>PUERTA · SOLO EQUIPO</p>
      {!paid ? (
        <p style={{ margin: 0, fontWeight: 700, color: "#9b2c2c" }}>✕ Entrada sin pagar. No la dejes pasar.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 15 }}>
            Hoy ingresaron <b>{used}</b> de <b>{quantity}</b>
          </p>
          <button type="button" disabled={busy || full} onClick={() => send(false)} style={{ ...btn, background: full ? "#b9aab3" : "#2F7A3B" }}>
            {full ? "Entrada ya usada hoy" : quantity - used > 1 ? `Registrar ingreso (quedan ${quantity - used})` : "Registrar ingreso"}
          </button>
          {used > 0 && (
            <button type="button" disabled={busy} onClick={() => send(true)} style={{ marginTop: 10, background: "none", border: "none", color: "#6E5F69", textDecoration: "underline", cursor: "pointer" }}>
              Deshacer el último ingreso
            </button>
          )}
        </>
      )}
      {msg && <p style={{ margin: "12px 0 0", fontWeight: 700, color: msg.ok ? "#2F7A3B" : "#9b2c2c" }}>{msg.text}</p>}
    </div>
  );
}
