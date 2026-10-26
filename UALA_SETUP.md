# Cobrar con Ualá Bis

La web ofrece "Pagar con Ualá" además de Mercado Pago y transferencia. El botón
aparece solo cuando estas variables están cargadas en Vercel
(Settings → Environment Variables → Production):

| Variable | Valor (app Ualá → Ualá Bis → Integración en tiendas online → API Cobros Online) |
| --- | --- |
| `UALA_USERNAME` | username |
| `UALA_CLIENT_ID` | client_id |
| `UALA_CLIENT_SECRET` | client_secret_id |
| `UALA_ENV` | `prueba` con las credenciales de prueba · `produccion` con las de producción |

Después de cambiar variables: Deployments → último deploy → Redeploy.

Cómo funciona:
- `/api/uala/pagar` crea la orden con el importe de la reserva guardada y manda a la persona al pago de Ualá.
- `/api/uala/webhook` recibe el aviso de Ualá; el estado y el importe se consultan siempre a Ualá.
- `/pago/exitoso` también le pregunta a Ualá, por si el aviso tarda.
- Pago aprobado (PROCESSED o APPROVED) → reserva pagada, mail con la entrada y aviso a Valen.
