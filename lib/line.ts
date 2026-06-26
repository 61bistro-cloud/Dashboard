import crypto from "crypto";

/** Verify the X-Line-Signature header against the raw request body. */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null,
  channelSecret: string
): boolean {
  if (!signature) return false;
  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  try {
    const a = Buffer.from(hash);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Download the binary content of a LINE message (image/file). */
export async function getLineContent(
  messageId: string,
  channelToken: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: `Bearer ${channelToken}` } }
  );
  if (!res.ok) {
    throw new Error(`LINE content ${res.status} ${await res.text()}`);
  }
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

/** Send a text reply via a reply token (best-effort). */
export async function replyLine(
  replyToken: string,
  text: string,
  channelToken: string
): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}

export function extFromMime(mime: string): string {
  if (/png/i.test(mime)) return "png";
  if (/pdf/i.test(mime)) return "pdf";
  if (/webp/i.test(mime)) return "webp";
  return "jpg";
}
