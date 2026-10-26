import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pago no completado — Estoy Para Más",
};

export default async function PagoRechazadoPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; external_reference?: string }>;
}) {
  const params = await searchParams;
  const reference = params.ref ?? params.external_reference ?? null;
  const retry = reference
    ? `/api/uala/pagar?ref=${encodeURIComponent(reference)}`
    : "/estoy-para-mas#comprar";
  return (
    <main className="pago-page">
      <span className="pago-logo">ESTOY PARA MÁS</span>
      <section className="pago-card">
        <div className="pago-badge err" aria-hidden="true">
          ✕
        </div>
        <p className="pago-eyebrow">Pago no completado</p>
        <h1>El pago no pudo completarse.</h1>
        <p>
          El pago fue rechazado o cancelado. Puede pasar por límite de la
          tarjeta, datos mal cargados o un problema momentáneo del medio de pago. No
          se te cobró nada.
        </p>
        <p>
          Tu reserva sigue guardada: podés intentar de nuevo con otra tarjeta o
          medio de pago, o pagar por transferencia con los datos que te mandamos
          por mail.
        </p>
        <div className="pago-actions">
          <a className="btn btn-primary" href={retry}>
            Intentar de nuevo
          </a>
          <a className="btn btn-outline" href="/estoy-para-mas">
            Volver al inicio
          </a>
        </div>
        <p className="pago-note">
          ¿Se te debitó igual? Escribinos por WhatsApp con el comprobante y lo
          revisamos al instante.
        </p>
      </section>
    </main>
  );
}
