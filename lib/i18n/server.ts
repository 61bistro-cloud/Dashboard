import { getLocale } from "next-intl/server";
import { createUi, supportedLocale } from "./core";
export async function getUi() {
  const locale = supportedLocale(await getLocale());
  return { ui: createUi(locale), uiLocale: locale };
}
