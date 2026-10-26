import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pago en proceso — Estoy Para Más",
};

export default async function PagoPendientePage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; external_reference?: string }>;
}) {
  const params = await searchParams;
  const reference = params.ref ?? params.external_reference ?? null;

  return (
    <main className="pago-page">
      <span className="pago-logo">ESTOY PARA MÁS</span>
      <section className="pago-card">
        <div className="pago-badge warn" aria-hidden="true">
          ⏳
        </div>
        <p className="pago-eyebrow">Pago en proceso</p>
        <h1>Tu pago se está procesando.</h1>
        <p>
          Algunos medios de pago (como efectivo o transferencias) tardan en
          acreditarse: desde unos minutos hasta 2 días hábiles. Tu entrada se
          confirma automáticamente apenas el pago sea aprobado y te avisamos por
          correo.
        </p>
        {reference && (
          <dl className="pago-detail">
            <div>
              <dt>Código</dt>
              <dd className="pago-ref">{reference}</dd>
            </div>
          </dl>
        )}
        {reference && (
          <p className="pago-note">
            Podés verificar el estado cuando quieras desde{" "}
            <a
              href={`/pago/exitoso?ref=${encodeURIComponent(reference)}`}
              style={{ textDecoration: "underline" }}
            >
              esta página de verificación
            </a>
            .
          </p>
        )}
        <div className="pago-actions">
          <a className="btn btn-primary" href="/estoy-para-mas">
            Volver al inicio
          </a>
        </div>
      </section>
    </main>
  );
}
