import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "te", "kn", "ta"],
  defaultLocale: "en",
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  te: "తెలుగు",
  kn: "ಕನ್ನಡ",
  ta: "தமிழ்",
};
