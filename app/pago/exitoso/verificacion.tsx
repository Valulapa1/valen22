"use client";

import { useEffect, useRef, useState } from "react";

type StatusResponse = {
  status: "pending" | "confirmed" | "payment_failed" | "error";
  paymentStatus: string;
  eventName: string;
  quantity: number;
  reference: string;
  totalAmount: number;
  currency: string;
  emailMasked: string;
};

/**
 * Purchase para el Meta Pixel, con eventID = referencia de la compra: si la
 * persona recarga la página de éxito, Meta descarta los duplicados.
 */
function trackPurchase(data: StatusResponse) {
  try {
    const fbq = (window as { fbq?: (...args: unknown[]) => void }).fbq;
    if (typeof fbq !== "function") return;
    fbq(
      "track",
      "Purchase",
      {
        value: data.totalAmount,
        currency: data.currency,
        num_items: data.quantity,
      },
      { eventID: data.reference },
    );
  } catch {
    // la analítica nunca debe romper la página de confirmación
  }
}

type ViewState =
  | { kind: "verifying" }
  | { kind: "confirmed"; data: StatusResponse }
  | { kind: "still-pending"; data: StatusResponse | null }
  | { kind: "failed"; data: StatusResponse }
  | { kind: "no-reference" }
  | { kind: "error" };

const MAX_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 5000;

export function VerificacionPago({ reference }: { reference: string | null }) {
  const [view, setView] = useState<ViewState>(
    reference ? { kind: "verifying" } : { kind: "no-reference" },
  );
  const attempts = useRef(0);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      attempts.current += 1;
      let data: StatusResponse | null = null;
      try {
        const res = await fetch(
          `/api/registrations/status?ref=${encodeURIComponent(reference!)}`,
          { cache: "no-store" },
        );
        if (res.ok) data = (await res.json()) as StatusResponse;
        else if (res.status === 400 || res.status === 404) {
          if (!cancelled) setView({ kind: "error" });
          return;
        }
      } catch {
        // error de red: se reintenta abajo
      }
      if (cancelled) return;

      if (data?.status === "confirmed") {
        trackPurchase(data);
        setView({ kind: "confirmed", data });
        return;
      }
      if (data?.status === "payment_failed") {
        setView({ kind: "failed", data });
        return;
      }
      if (attempts.current >= MAX_ATTEMPTS) {
        setView({ kind: "still-pending", data });
        return;
      }
      timer = setTimeout(check, POLL_INTERVAL_MS);
    }

    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reference]);

  if (view.kind === "no-reference") {
    return (
      <section className="pago-card" aria-live="polite">
        <div className="pago-badge warn" aria-hidden="true">
          !
        </div>
        <h1>Falta la referencia del pago</h1>
        <p>
          No pudimos identificar tu inscripción desde esta URL. Si acabás de pagar,
          revisá el correo de Mercado Pago o escribinos por WhatsApp con tu
          comprobante.
        </p>
        <div className="pago-actions">
          <a className="btn btn-primary" href="/">
            Volver al inicio
          </a>
        </div>
      </section>
    );
  }

  if (view.kind === "verifying") {
    return (
      <section className="pago-card" aria-live="polite">
        <div className="pago-spinner" role="status" aria-label="Verificando" />
        <p className="pago-eyebrow">Un momento</p>
        <h1>Estamos verificando tu pago…</h1>
        <p>
          Consultamos directamente a Mercado Pago para confirmar tu inscripción.
          Esto suele tardar unos segundos. No cierres esta pestaña.
        </p>
      </section>
    );
  }

  if (view.kind === "confirmed") {
    const { data } = view;
    return (
      <section className="pago-card" aria-live="polite">
        <div className="pago-badge ok" aria-hidden="true">
          ✓
        </div>
        <p className="pago-eyebrow">Pago confirmado</p>
        <h1>Tu lugar está reservado.</h1>
        <p>El sábado 6 y domingo 7 de marzo te esperamos. Ya no hay vuelta atrás: estás adentro.</p>
        <dl className="pago-detail">
          <div>
            <dt>Evento</dt>
            <dd>{data.eventName}</dd>
          </div>
          <div>
            <dt>Entradas</dt>
            <dd>{data.quantity}</dd>
          </div>
          <div>
            <dt>Confirmación a</dt>
            <dd>{data.emailMasked}</dd>
          </div>
          <div>
            <dt>Código</dt>
            <dd className="pago-ref">{data.reference}</dd>
          </div>
        </dl>
        <p className="pago-note">
          Guardá el código de inscripción: es tu comprobante de entrada. La dirección
          exacta del salón se envía por correo antes del evento.
        </p>
        <div className="pago-actions">
          <a className="btn btn-primary" href="/">
            Volver al inicio
          </a>
        </div>
      </section>
    );
  }

  if (view.kind === "failed") {
    return (
      <section className="pago-card" aria-live="polite">
        <div className="pago-badge err" aria-hidden="true">
          ✕
        </div>
        <h1>El pago no se completó</h1>
        <p>
          Mercado Pago informó que este pago fue rechazado o cancelado. Podés volver
          a intentarlo desde la página del evento.
        </p>
        <div className="pago-actions">
          <a className="btn btn-primary" href="/#comprar">
            Intentar de nuevo
          </a>
          <a className="btn btn-outline" href="/">
            Volver al inicio
          </a>
        </div>
      </section>
    );
  }

  if (view.kind === "still-pending") {
    return (
      <section className="pago-card" aria-live="polite">
        <div className="pago-badge warn" aria-hidden="true">
          ⏳
        </div>
        <p className="pago-eyebrow">En proceso</p>
        <h1>Tu pago se está procesando</h1>
        <p>
          Mercado Pago todavía no nos confirmó el pago. Es normal con algunos medios
          de pago: puede tardar desde minutos hasta 2 días hábiles. Apenas se
          apruebe, tu entrada queda confirmada y te llega un correo.
        </p>
        {view.data && (
          <dl className="pago-detail">
            <div>
              <dt>Código</dt>
              <dd className="pago-ref">{view.data.reference}</dd>
            </div>
          </dl>
        )}
        <div className="pago-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              attempts.current = 0;
              setView({ kind: "verifying" });
            }}
          >
            Volver a verificar
          </button>
          <a className="btn btn-outline" href="/">
            Volver al inicio
          </a>
        </div>
        <p className="pago-note">
          ¿Pasaron más de 2 días? Escribinos por WhatsApp con tu código de
          inscripción y lo revisamos.
        </p>
      </section>
    );
  }

  return (
    <section className="pago-card" aria-live="polite">
      <div className="pago-badge warn" aria-hidden="true">
        !
      </div>
      <h1>No pudimos verificar tu pago</h1>
      <p>
        No encontramos una inscripción con esta referencia. Si el dinero se debitó,
        no te preocupes: el pago queda registrado en Mercado Pago. Escribinos por
        WhatsApp y lo resolvemos.
      </p>
      <div className="pago-actions">
        <a className="btn btn-primary" href="/">
          Volver al inicio
        </a>
      </div>
    </section>
  );
}
