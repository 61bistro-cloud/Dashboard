import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import jsQR from "jsqr";
export const contentFingerprint = (buffer: Uint8Array) =>
  createHash("sha256").update(buffer).digest("hex");
export async function qrFingerprint(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  if (
    !/^image\/(?:jpeg|png)$/.test(mimeType) ||
    buffer.length > 10 * 1024 * 1024
  )
    return null;
  try {
    const { data, info } = await sharp(buffer, { limitInputPixels: 25_000_000 })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const qr = jsQR(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      info.width,
      info.height
    );
    return qr?.data ? contentFingerprint(Buffer.from(qr.data)) : null;
  } catch {
    return null;
  }
}
