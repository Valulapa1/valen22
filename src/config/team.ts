/**
 * Equipo de Estoy Para Más 2027 y sus links personales de venta.
 *
 * Cada persona comparte su link: valentinaparodi.com/estoy-para-mas?v=<código>
 * Lo que se reserva o deja datos desde ese link queda a su nombre y cobra el
 * 10% de comisión sobre lo efectivamente pagado.
 *
 * Para sumar a alguien: agregar una línea con un código corto, sin espacios
 * ni acentos, y publicar.
 */
export const COMMISSION_RATE = 0.1;

export const team = [
  { code: "trini", name: "Trini" },
  { code: "juli", name: "Julieta Flores" },
  { code: "zoe", name: "Zoe" },
  { code: "natali", name: "Natali Faría" },
  { code: "flor", name: "Flor Méndez" },
  { code: "mica", name: "Micaela Méndez" },
  { code: "melany", name: "Melany" },
  { code: "naiara", name: "Naiara" },
  { code: "nyx", name: "Nyx" },
] as const;

export type SellerCode = (typeof team)[number]["code"];

/** Devuelve el código si pertenece al equipo; si no, null. */
export function normalizeSeller(raw: unknown): SellerCode | null {
  const code = String(raw ?? "").trim().toLowerCase();
  return (team.find((t) => t.code === code)?.code as SellerCode | undefined) ?? null;
}

export function sellerName(code: string | null | undefined): string | null {
  return team.find((t) => t.code === code)?.name ?? null;
}
