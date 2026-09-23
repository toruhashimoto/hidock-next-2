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
import enLibrary from './locales/en/library.json'
import jaLibrary from './locales/ja/library.json'
import enSettings from './locales/en/settings.json'
import jaSettings from './locales/ja/settings.json'
import enDevice from './locales/en/device.json'
import jaDevice from './locales/ja/device.json'
import enToday from './locales/en/today.json'
import jaToday from './locales/ja/today.json'
import enDomain from './locales/en/domain.json'
import jaDomain from './locales/ja/domain.json'
import enPeople from './locales/en/people.json'
import jaPeople from './locales/ja/people.json'
import enCalendar from './locales/en/calendar.json'
import jaCalendar from './locales/ja/calendar.json'
import enChat from './locales/en/chat.json'
import jaChat from './locales/ja/chat.json'

export const SUPPORTED_LANGUAGES = ['en', 'ja'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const NAMESPACES = ['common', 'layout', 'library', 'device', 'settings', 'today', 'domain', 'people', 'calendar', 'chat'] as const

const resources = {
  en: { common: enCommon, layout: enLayout, library: enLibrary, settings: enSettings, device: enDevice, today: enToday, domain: enDomain, people: enPeople, calendar: enCalendar, chat: enChat },
  ja: { common: jaCommon, layout: jaLayout, library: jaLibrary, settings: jaSettings, device: jaDevice, today: jaToday, domain: jaDomain, people: jaPeople, calendar: jaCalendar, chat: jaChat }
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
