/**
 * i18n core — the single place i18next is configured.
 *
 * Two callers initialise it: src/main.tsx (the app, pre-paint, with the
 * language the user persisted) and src/test/setup.ts (Vitest, always 'en').
 * Calling initI18n() more than once must therefore be harmless: the second and
 * later calls only switch the active language.
 *
 * Catalogues are imported statically rather than lazy-loaded. They are small,
 * and a synchronous init is what lets main.tsx render the correct language on
 * the first paint instead of flashing English.
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en/common.json'
import jaCommon from './locales/ja/common.json'
import enLayout from './locales/en/layout.json'
import jaLayout from './locales/ja/layout.json'
import enSettings from './locales/en/settings.json'
import jaSettings from './locales/ja/settings.json'
import enDevice from './locales/en/device.json'
import jaDevice from './locales/ja/device.json'

export const SUPPORTED_LANGUAGES = ['en', 'ja'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const NAMESPACES = ['common', 'layout', 'library', 'device', 'settings', 'today'] as const

const resources = {
  en: { common: enCommon, layout: enLayout, settings: enSettings, device: enDevice },
  ja: { common: jaCommon, layout: jaLayout, settings: jaSettings, device: jaDevice }
}

export function initI18n(lng: SupportedLanguage): typeof i18n {
  if (i18n.isInitialized) {
    if (i18n.language !== lng) void i18n.changeLanguage(lng)
    return i18n
  }

  void i18n.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    ns: NAMESPACES,
    defaultNS: 'common',
    resources,
    // React escapes interpolated values itself; letting i18next escape them too
    // double-encodes apostrophes and ampersands in the English catalogue.
    interpolation: { escapeValue: false },
    // A key with no translation renders the English string (fallbackLng). In
    // development we also want to know about it. i18next only invokes
    // missingKeyHandler when saveMissing is truthy (it gates the call site,
    // not just the "save to backend" behaviour) — saveMissing: false here
    // would silently make the handler below dead code in every environment.
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (_lngs, ns, key) => console.warn(`[i18n] missing key: ${ns}:${key}`)
      : undefined,
    react: {
      // Catalogues are bundled, so nothing suspends. Turning this off keeps
      // components out of Suspense boundaries they do not otherwise need.
      useSuspense: false
    }
  })

  return i18n
}

export default i18n
