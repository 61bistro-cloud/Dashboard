import { randomBytes, timingSafeEqual } from "node:crypto";
export const GOOGLE_STATE_COOKIE = "drive-oauth-state";
export function newGoogleState(
  userId: string,
  businessId: number,
  now = Date.now()
) {
  const nonce = randomBytes(32).toString("base64url");
  return {
    state: nonce,
    cookie: JSON.stringify({
      nonce,
      userId,
      businessId,
      expires: now + 600000,
    }),
  };
}
export function validGoogleState(
  cookie: string | undefined,
  state: string | null,
  userId: string,
  businessId: number,
  now = Date.now()
): boolean {
  try {
    if (!cookie || !state || state.length > 128) return false;
    const data = JSON.parse(cookie);
    if (
      data.userId !== userId ||
      data.businessId !== businessId ||
      typeof data.expires !== "number" ||
      now >= data.expires ||
      typeof data.nonce !== "string"
    )
      return false;
    const a = Buffer.from(data.nonce),
      b = Buffer.from(state);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
export function googleStateBusiness(cookie: string | undefined): number | null {
  try {
    const id = JSON.parse(cookie ?? "").businessId;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
