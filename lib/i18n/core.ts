import messages from "./messages.json";

export type Locale = "th" | "en";
export const LOCALE_COOKIE = "dashboard-locale";
export function supportedLocale(value?: string): Locale {
  return value === "en" ? "en" : "th";
}
const dictionary = messages as Record<string, { th?: string; en?: string }>;
export type Ui = (
  source: string,
  values?: Record<string, string | number | null | undefined>
) => string;
// Recognize previously displayed feedback when the user switches language.
const aliases = new Map<string, { th?: string; en?: string; source: string }>();
for (const [source, translations] of Object.entries(dictionary)) {
  for (const label of [source, translations.th, translations.en]) {
    if (label && !aliases.has(label))
      aliases.set(label, { ...translations, source });
  }
}
const templates = [...aliases.entries()]
  .filter(([source]) => /\{v\d+\}/.test(source))
  .sort(
    ([a], [b]) =>
      b.replace(/\{v\d+\}/g, "").length - a.replace(/\{v\d+\}/g, "").length
  )
  .map(([source, translations]) => {
    const keys: string[] = [];
    const pattern = source
      .split(/(\{v\d+\})/)
      .map((part) => {
        if (/^\{v\d+\}$/.test(part)) {
          keys.push(part.slice(1, -1));
          return "([\\s\\S]*?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return { expression: new RegExp(`^${pattern}$`), keys, translations };
  });

/** Only call for application-owned interface text, never user-entered records. */
export function createUi(locale: Locale): Ui {
  return (source, values) => {
    const entry = aliases.get(source);
    let translated = entry && (entry[locale] ?? entry.source);
    let params = values;
    // Server actions retain their original messages. Translate at the UI boundary.
    if (translated === undefined && !values) {
      for (const template of templates) {
        const match = template.expression.exec(source);
        if (match) {
          translated =
            template.translations[locale] ?? template.translations.source;
          params = Object.fromEntries(
            template.keys.map((key, i) => [key, match[i + 1]])
          );
          break;
        }
      }
    }
    return (translated ?? source).replace(/\{(v\d+)\}/g, (token, key) =>
      params && key in params ? String(params[key] ?? "") : token
    );
  };
}

export function displayMonth(label: string, locale: Locale): string {
  if (locale === "th") return label;
  // Fiscal labels are application-owned; convert only Thai month and B.E. year tokens.
  let result = label;
  for (const [source, translation] of Object.entries(dictionary)) {
    if (
      source.length >= 3 &&
      /^(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|[ก-๙]{1,2}\.[ก-๙]{1,2}\.)$/.test(
        source
      )
    ) {
      result = result.replaceAll(source, translation.en ?? source);
    }
  }
  return result.replace(/\b25\d{2}\b/g, (year) => String(Number(year) - 543));
}
export const dateLocale = (locale: Locale) =>
  locale === "en" ? "en-GB" : "th-TH";
