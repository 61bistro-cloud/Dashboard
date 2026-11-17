import { useLocale } from "next-intl";
import { createUi, supportedLocale } from "./core";
export function useUi() {
  const locale = supportedLocale(useLocale());
  return { ui: createUi(locale), uiLocale: locale };
}
