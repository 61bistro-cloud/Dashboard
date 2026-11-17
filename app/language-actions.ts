"use server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, supportedLocale } from "@/lib/i18n/core";
export async function setLanguage(locale: string) {
  (await cookies()).set(LOCALE_COOKIE, supportedLocale(locale), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
