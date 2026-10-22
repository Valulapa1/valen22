/**
 * Detección de contactos falsos (bots).
 *
 * Desde el 19/10/2026 llegan bots que completan todos los formularios con
 * nombres de letras al azar ("iZmFAmyBcBuxsxkZSy"), teléfonos de 10 dígitos
 * que no son argentinos y mails ajenos (muchos de Gmail con puntos de más,
 * "l.i.za.t.o.r.i1.0@gmail.com"). Estas reglas los reconocen sin molestar a
 * las personas reales.
 *
 * Se usa en tres lugares: al guardar un contacto (/api/leads), en el
 * seguimiento automático por mail (para no escribirles) y en el panel (para
 * ocultarlos).
 */

type LeadLike = { first_name?: string | null; firstName?: string | null; email?: string | null; phone?: string | null };

/** Nombre con mayúsculas en el medio de la palabra, típico de los bots. */
export function isGibberishName(name: string): boolean {
  return name
    .trim()
    .split(/\s+/)
    .some((word) => (word.match(/[a-z][A-Z]/g) ?? []).length >= 2);
}

/** Gmail con 3 o más puntos en el usuario: el truco que usan para repetir un mail. */
export function isDottedGmail(email: string): boolean {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return false;
  if (domain !== "gmail.com" && domain !== "googlemail.com") return false;
  return (local.match(/\./g) ?? []).length >= 3;
}

/**
 * WhatsApp con formato válido.
 * - Con "+" adelante: código de país + número, de 8 a 15 dígitos.
 * - Sin "+": tiene que ser un número argentino. Los códigos de área
 *   argentinos empiezan con 1, 2 o 3 (11, 221, 351...). Un número de 10
 *   dígitos que empieza con 4 a 9 no es argentino.
 */
export function isValidPhone(phone: string): boolean {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length >= 8 && digits.length <= 15;
  let n = digits;
  if (n.startsWith("549")) n = n.slice(3);
  else if (n.startsWith("54")) n = n.slice(2);
  else if (n.startsWith("0")) n = n.slice(1);
  if (n.length < 8 || n.length > 13) return false;
  return /^[123]/.test(n);
}

/** Motivo por el que un contacto parece falso, o null si parece real. */
export function suspiciousReason(lead: LeadLike): string | null {
  const name = String(lead.first_name ?? lead.firstName ?? "");
  if (isGibberishName(name)) return "nombre al azar";
  if (lead.email && isDottedGmail(lead.email)) return "mail con puntos de más";
  if (lead.phone && !isValidPhone(lead.phone)) return "WhatsApp inválido";
  return null;
}

/**
 * Marca como sospechosos todos los contactos de una lista. Un bot deja varios
 * registros con el mismo mail; si uno solo se delata (nombre al azar,
 * teléfono inválido) o el mismo mail aparece con teléfonos distintos, se
 * marcan todos los de ese mail.
 */
export function findSuspicious<T extends LeadLike & { id: string }>(rows: T[]): Map<string, string> {
  const byEmail = new Map<string, T[]>();
  for (const r of rows) {
    const key = (r.email ?? "").trim().toLowerCase();
    if (!key) continue;
    byEmail.set(key, [...(byEmail.get(key) ?? []), r]);
  }
  const out = new Map<string, string>();
  for (const r of rows) {
    const own = suspiciousReason(r);
    if (own) {
      out.set(r.id, own);
      continue;
    }
    const key = (r.email ?? "").trim().toLowerCase();
    const group = key ? byEmail.get(key) ?? [] : [];
    if (group.some((g) => suspiciousReason(g))) {
      out.set(r.id, "mismo mail que un bot");
      continue;
    }
    // Últimos 8 dígitos: "+54 9 11 2044-2233" y "11 2044 2233" cuentan como el mismo.
    const phones = new Set(group.map((g) => String(g.phone ?? "").replace(/\D/g, "").slice(-8)));
    if (phones.size >= 3) out.set(r.id, "mismo mail con muchos teléfonos");
  }
  return out;
}
