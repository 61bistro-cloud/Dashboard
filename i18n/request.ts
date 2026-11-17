import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, supportedLocale } from "@/lib/i18n/core";
export default getRequestConfig(async () => ({
  locale: supportedLocale((await cookies()).get(LOCALE_COOKIE)?.value),
  messages: {},
}));
