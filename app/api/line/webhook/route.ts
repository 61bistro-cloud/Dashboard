import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyLineSignature } from "@/lib/line";
import type { LineEvent } from "@/lib/line-webhook";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const signature = req.headers.get("x-line-signature");
  if (!signature) return new Response("bad signature", { status: 401 });
  const raw = await req.text();
  let body: { events: LineEvent[] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.events))
      return new Response("invalid events", { status: 400 });
    body = parsed;
  } catch {
    return new Response("invalid JSON", { status: 400 });
  }

  // Verify even LINE's empty-events handshake. A successful Verify must confirm
  // the saved secret works, not just that this URL is reachable.
  const businesses = await prisma.business.findMany({
    where: {
      lineChannelSecret: { not: null },
      lineChannelToken: { not: null },
    },
    select: { id: true, lineChannelSecret: true, lineChannelToken: true },
  });
  const biz = businesses.find((b) =>
    verifyLineSignature(raw, signature, b.lineChannelSecret!)
  );
  if (!biz) return new Response("bad signature", { status: 401 });

  // Verification needs no fiscal-month lookup, Google SDK, Drive or LINE calls.
  if (body.events.length === 0) return new Response("ok");
  const events = body.events.filter(
    (event) =>
      event &&
      event.type === "message" &&
      event.message &&
      ["text", "image", "file"].includes(event.message.type)
  );
  if (events.length === 0) return new Response("ok");

  // after() keeps the serverless invocation alive after the HTTP response.
  // Load the Google SDK only for real messages, outside LINE's timeout window.
  after(async () => {
    try {
      const { processLineEvents } = await import("@/lib/line-webhook");
      await processLineEvents({ id: biz.id }, biz.lineChannelToken!, events);
    } catch (error) {
      console.error("[line/webhook] background processing failed", error);
    }
  });
  return new Response("ok");
}
