import "server-only";

/** Dólar blue (promedio entre compra y venta), o null si no se pudo obtener. */
export async function getUsdRate(): Promise<number | null> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue", { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const d = (await res.json()) as { compra: number; venta: number };
    const p = Math.round((Number(d.compra) + Number(d.venta)) / 2);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}
