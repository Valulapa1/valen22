/**
 * Fuente única de verdad del evento.
 *
 * El precio NUNCA viaja desde el frontend: toda ruta de servidor que necesite
 * calcular importes debe usar `getTicketUnitPrice()`. La landing muestra el
 * precio consultando GET /api/event, que también sale de acá.
 */

export const eventConfig = {
  id: "estas-para-mas-bsas-2027",
  name: "Estoy Para Más — 2.ª edición Buenos Aires 2027",
  ticketName: "Entrada general · Preventa 2 días",
  /** Precio de preventa por entrada (incluye sábado y domingo). */
  ticketPrice: 40000,
  currency: "ARS",
  maxTicketsPerPurchase: 5,
  /** Primer día del evento (se usa para la cuenta regresiva). */
  eventDate: "2027-03-06",
  /** Texto de fecha que se muestra en correos y pantallas. */
  eventDateLabel: "Sábado 6 y domingo 7 de marzo de 2027",
  eventTime: "09:00 a 20:00",
  location:
    "Salón privado en Capital Federal, Buenos Aires (la dirección exacta se envía al confirmar)",
  /** Último día de la preventa de la entrada general (inclusive). */
  presaleEndsAt: "2026-12-15",
  /** WhatsApp al que se deriva cada reserva para coordinar la transferencia. */
  whatsappNumber: "5493541694363",
  /**
   * Tipos de entrada. Las reservas se pagan por transferencia: la web toma los
   * datos y deriva a WhatsApp. El precio de cada tipo sale siempre de acá.
   */
  tiers: {
    general: {
      label: "General · Preventa",
      price: 40000,
      currency: "ARS",
      /** "Venite con una amiga": cada par de entradas generales cuesta esto. */
      pairPrice: 55500,
    },
    vip: { label: "VIP", price: 200, currency: "USD", maxInstallments: 2 },
    platino: { label: "Platino", price: 750, currency: "USD", limited: 10, maxInstallments: 3 },
  },
  /**
   * Precio de la General después de la preventa (desde el 16/12). Se aplica
   * solo según la fecha: no hay que tocar nada ese día.
   */
  generalAfterPresale: { label: "General", price: 55500, pairPrice: 80000 },
  /** Las cuotas (VIP y Platino) se completan hasta esta fecha, inclusive. */
  installmentsDeadline: "2026-12-15",
  /** Datos de transferencia que ve la persona apenas reserva. */
  paymentAccounts: {
    ars: {
      title: "Pesos · transferencia",
      rows: [
        ["Alias", "logratusmetas.arq"],
        ["CVU", "0000069703936376541146"],
        ["Titular", "Valentina Parodi"],
      ],
    },
    usdAr: {
      title: "Dólares · desde una cuenta argentina",
      rows: [
        ["Banco", "Coinag"],
        ["Alias", "ARQ.FINANCE.USD"],
        ["CBU", "4310009942700000131448"],
      ],
    },
    usdExt: {
      title: "Dólares · desde el exterior (ACH)",
      rows: [
        ["Banco", "Lead Bank"],
        ["Titular", "Valentina Parodi"],
        ["Cuenta", "213859836972"],
        ["Routing", "101019644"],
      ],
    },
  },
  /** Aparece en el resumen de la tarjeta del comprador (máx. 22 caracteres). */
  statementDescriptor: "ESTASPARAMAS",
  contactEmail: "hola@estasparamas.com",
} as const;

/** Precio por entrada, calculado siempre en el servidor. */
export function getTicketUnitPrice(): number {
  return eventConfig.ticketPrice;
}

/** Total para una cantidad dada, calculado siempre en el servidor. */
export function getOrderTotal(quantity: number): number {
  return eventConfig.ticketPrice * quantity;
}

/** Precio "por unidad" para guardar en la fila y para el ítem de Mercado Pago. */
export function getUnitPriceForOrder(quantity: number): number {
  return eventConfig.ticketPrice;
}

type TierKey = keyof typeof eventConfig.tiers;

/** ¿Ya terminó la preventa? (después del 15/12 a las 23:59, hora argentina) */
export function isPresaleOver(at: Date = new Date()): boolean {
  return at.getTime() > new Date(`${eventConfig.presaleEndsAt}T23:59:59-03:00`).getTime();
}

/** El tipo de entrada con el precio vigente hoy. */
export function getCurrentTier(ticketType: TierKey, at: Date = new Date()) {
  const tier = eventConfig.tiers[ticketType];
  if (ticketType === "general" && isPresaleOver(at)) {
    return { ...tier, ...eventConfig.generalAfterPresale };
  }
  return tier;
}

/** Todos los tipos de entrada con el precio vigente hoy. */
export function getCurrentTiers(at: Date = new Date()) {
  return {
    general: getCurrentTier("general", at),
    vip: getCurrentTier("vip", at),
    platino: getCurrentTier("platino", at),
  };
}

/**
 * Total de una reserva según tipo y cantidad. En la General, cada par de
 * entradas va al precio "Venite con una amiga"; la entrada suelta, a precio normal.
 */
export function getTierTotal(ticketType: TierKey, quantity: number): number {
  const tier = getCurrentTier(ticketType);
  if ("pairPrice" in tier) {
    return Math.floor(quantity / 2) * tier.pairPrice + (quantity % 2) * tier.price;
  }
  return tier.price * quantity;
}

export type PaymentPlan = "unico" | "cuotas";

/**
 * Cronograma de pagos. Pago único: todo hoy. En cuotas (solo VIP y Platino):
 * la seña hoy y el resto el día 15 de los meses siguientes, hasta la fecha
 * límite. Cuantas menos fechas quedan, menos cuotas. La landing replica este
 * mismo cálculo para mostrarlo antes de confirmar.
 */
export function getPaymentSchedule(
  ticketType: TierKey,
  quantity: number,
  plan: PaymentPlan,
  from: Date = new Date(),
): { date: string; amount: number }[] {
  const tier = eventConfig.tiers[ticketType];
  const total = getTierTotal(ticketType, quantity);
  const today = from.toISOString().slice(0, 10);
  const max = "maxInstallments" in tier ? tier.maxInstallments : 1;
  if (plan !== "cuotas" || max < 2) return [{ date: today, amount: total }];

  const deadline = eventConfig.installmentsDeadline;
  const later: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 15));
  if (from.getUTCDate() >= 15) d.setUTCMonth(d.getUTCMonth() + 1);
  for (let i = 0; i < 12; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > deadline) break;
    if (iso > today) later.push(iso);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  // Seña hoy + las últimas fechas disponibles, hasta el máximo de cuotas.
  const dates = [today, ...later.slice(-(max - 1))];
  const n = dates.length;
  if (n < 2) return [{ date: today, amount: total }];
  const base = Math.floor(total / n);
  return dates.map((date, i) => ({ date, amount: i === 0 ? total - base * (n - 1) : base }));
}
