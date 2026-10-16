import QRCode from "qrcode";
import { ticketToken, ticketUrl } from "@/lib/site";

export const runtime = "nodejs";

/** GET /api/entrada/qr?c=CODIGO&t=FIRMA — PNG con el QR de la entrada. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("c") ?? "";
  const token = searchParams.get("t") ?? "";
  if (!/^EPM27-[A-Z0-9-]{6,30}$/.test(code) || token !== ticketToken(code)) {
    return new Response("No encontrado", { status: 404 });
  }
  const png = await QRCode.toBuffer(ticketUrl(code), { width: 480, margin: 1, color: { dark: "#33202F", light: "#FFFFFF" } });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
