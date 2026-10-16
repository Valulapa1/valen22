import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Se recalcula como mucho cada 30 minutos.
export const revalidate = 1800;

/**
 * GET /api/dolar — cotización del dólar blue para mostrar el equivalente en
 * pesos de las entradas VIP y Platino. Se usa el promedio entre compra y
 * venta, que es el valor que toma Estoy Para Más.
 */
export async function GET() {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue", {
      next: { revalidate: 1800 },
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const d = (await res.json()) as { compra: number; venta: number; fechaActualizacion?: string };
    const promedio = Math.round((Number(d.compra) + Number(d.venta)) / 2);
    if (!Number.isFinite(promedio) || promedio <= 0) throw new Error("cotización inválida");
    return NextResponse.json({
      compra: d.compra,
      venta: d.venta,
      promedio,
      fecha: d.fechaActualizacion ?? null,
    });
  } catch (err) {
    console.error("[dolar] No se pudo obtener la cotización:", (err as Error).message);
    return NextResponse.json({ promedio: null }, { status: 200 });
  }
}
