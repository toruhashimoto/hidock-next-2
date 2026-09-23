/**
 * Language resolution — the small, framework-free core shared between the
 * pre-paint bootstrap (main.tsx, runs before React) and the React reconciler
 * (useLanguage). Mirrors src/lib/theme.ts so the two preferences behave alike.
 *
 * 'system' resolves through navigator.language rather than an IPC call to
 * app.getLocale(). The values agree — Electron sets Chromium's locale from the
 * same source — but navigator.language is readable synchronously, and the
 * pre-paint path cannot await an IPC round trip.
 */

import { initI18n, type SupportedLanguage } from '@/i18n'
import type { LanguagePreference } from '@/types/stores'
import { UI_STORE_KEY } from './theme'

export type { LanguagePreference } from '@/types/stores'

/** The OS/app locale collapsed to a supported language. */
export function systemLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

/** Collapse a preference to the concrete language to render. */
export function resolveLanguage(pref: LanguagePreference): SupportedLanguage {
  return pref === 'system' ? systemLanguage() : pref
}

/**
 * Best-effort read of the persisted language preference straight from
 * localStorage — used pre-paint, before the Zustand store has hydrated.
 * Returns 'system' when absent or unparseable.
 */
export function readPersistedLanguagePreference(): LanguagePreference {
  if (typeof localStorage === 'undefined') return 'system'
  try {
    const raw = localStorage.getItem(UI_STORE_KEY)
    if (!raw) return 'system'
    const parsed = JSON.parse(raw)
    const pref = parsed?.state?.language
    return pref === 'en' || pref === 'ja' || pref === 'system' ? pref : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Initialise i18next with the persisted (or system-default) language. Call this
 * once, synchronously, before React renders so there is no flash of English.
 */
export function bootstrapLanguage(): void {
  initI18n(resolveLanguage(readPersistedLanguagePreference()))
}
