import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ruCommon from "../../../public/locales/ru/common.json";
import enCommon from "../../../public/locales/en/common.json";

export const LANGUAGE_STORAGE_KEY = "declare.lang";

function detectInitialLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "ru" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  const browserLang = navigator.language?.toLowerCase() ?? "";
  return browserLang.startsWith("en") ? "en" : "ru";
}

i18n.use(initReactI18next).init({
  resources: {
    ru: { common: ruCommon },
    en: { common: enCommon },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "ru",
  supportedLngs: ["ru", "en"],
  defaultNS: "common",
  ns: ["common"],
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export function setLanguage(lang: "ru" | "en"): void {
  i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export default i18n;
