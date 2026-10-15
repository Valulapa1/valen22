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
