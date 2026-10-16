import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pago no completado — Estoy Para Más",
};

export default function PagoRechazadoPage() {
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
          Mercado Pago rechazó o canceló la operación. Puede pasar por límite de la
          tarjeta, datos mal cargados o un problema momentáneo del medio de pago. No
          se te cobró nada.
        </p>
        <p>
          Tu lugar no está reservado todavía: cuando quieras, volvé a la página del
          evento y completá la compra de nuevo, probando con otro medio de pago si
          hace falta.
        </p>
        <div className="pago-actions">
          <a className="btn btn-primary" href="/#comprar">
            Volver a intentar
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
