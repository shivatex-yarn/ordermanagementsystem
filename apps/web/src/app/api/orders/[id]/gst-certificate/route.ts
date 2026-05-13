import { withAuth } from "@/lib/with-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return new Response("Invalid order id", { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: { gstCopyUrl: true },
  });
  if (!order) return new Response("Not found", { status: 404 });
  if (!order.gstCopyUrl) return new Response("No GST certificate on file", { status: 404 });

  // Parse JSON payload: { url: "data:<mime>;base64,<data>", name: "<filename>" }
  let dataUrl: string;
  let fileName = "gst-certificate";
  try {
    const parsed = JSON.parse(order.gstCopyUrl);
    dataUrl = parsed?.url ?? order.gstCopyUrl;
    if (parsed?.name) fileName = parsed.name;
  } catch {
    dataUrl = order.gstCopyUrl;
  }

  // Decode base64 data URI
  if (!dataUrl.startsWith("data:")) {
    // Legacy plain URL — redirect directly
    return Response.redirect(dataUrl, 302);
  }

  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return new Response("Malformed certificate data", { status: 500 });

  const meta = dataUrl.slice(5, commaIdx); // strip "data:"
  const mime = meta.split(";")[0];
  const b64 = dataUrl.slice(commaIdx + 1);
  const bytes = Buffer.from(b64, "base64");

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": bytes.length.toString(),
      // inline so View opens in browser tab; download link uses ?download=1
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
