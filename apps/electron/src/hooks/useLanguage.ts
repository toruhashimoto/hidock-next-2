/**
 * useLanguage — reconciles the persisted language preference with i18next.
 *
 * Responsibilities:
 *  - switch i18next whenever the preference changes;
 *  - mirror the preference into the app config (config.ui.language) best-effort,
 *    so the choice is durable beyond localStorage.
 *
 * The pre-paint bootstrap in main.tsx has already initialised i18next from
 * localStorage before React mounts, so this hook only keeps things in sync — it
 * never causes a flash of English.
 *
 * Mirrors hooks/useTheme.ts.
 */

import { useCallback, useEffect } from 'react'
import { useUIStore } from '@/store/ui/useUIStore'
import { useConfigStore } from '@/store/domain/useConfigStore'
import { resolveLanguage, type LanguagePreference } from '@/lib/language'
import i18n, { type SupportedLanguage } from '@/i18n'

export interface UseLanguageResult {
  /** The user's preference: 'en' | 'ja' | 'system'. */
  language: LanguagePreference
  /** The concrete language currently rendered. */
  resolvedLanguage: SupportedLanguage
  /** Set the preference (persists + applies + mirrors to config). */
  setLanguage: (language: LanguagePreference) => void
}

export function useLanguage(): UseLanguageResult {
  const language = useUIStore((s) => s.language)
  const setLanguagePref = useUIStore((s) => s.setLanguage)
  const configReady = useConfigStore((s) => s.configReady)
  const configLanguage = useConfigStore((s) => s.config?.ui?.language)

  // Apply on preference change.
  useEffect(() => {
    const resolved = resolveLanguage(language)
    if (i18n.language !== resolved) void i18n.changeLanguage(resolved)
  }, [language])

  // One-time adoption: if the user has never picked a language in THIS renderer
  // (localStorage still 'system') but config.json carries an explicit choice
  // from a prior session, adopt it. Avoids clobbering a fresh localStorage pick.
  useEffect(() => {
    if (!configReady) return
    if (language !== 'system') return
    if (configLanguage === 'en' || configLanguage === 'ja') {
      setLanguagePref(configLanguage)
    }
    // Only react to config readiness; `language` intentionally omitted so a later
    // manual switch back to 'system' isn't immediately overridden by config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configReady, configLanguage])

  const setLanguage = useCallback(
    (next: LanguagePreference) => {
      setLanguagePref(next)
      const resolved = resolveLanguage(next)
      if (i18n.language !== resolved) void i18n.changeLanguage(resolved)
      // Mirror to config, best-effort — a failure just leaves localStorage as
      // the source of truth. updateConfig already restores on error internally.
      void useConfigStore
        .getState()
        .updateConfig('ui', { language: next })
        .catch(() => {})
    },
    [setLanguagePref]
  )

  return { language, resolvedLanguage: resolveLanguage(language), setLanguage }
}
