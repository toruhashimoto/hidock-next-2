/**
 * i18n core — initialisation contract shared by the app entry point and the
 * Vitest setup file. Both call initI18n(); it must be safe to call twice.
 */

import { describe, it, expect, vi } from 'vitest'
import { initI18n, SUPPORTED_LANGUAGES, NAMESPACES } from '../index'

describe('initI18n', () => {
  it('initialises with the requested language', () => {
    const i18n = initI18n('en')
    expect(i18n.language).toBe('en')
  })

  it('is safe to call twice and switches the language on the second call', () => {
    initI18n('en')
    const i18n = initI18n('ja')
    expect(i18n.language).toBe('ja')
    initI18n('en')
  })

  it('falls back to English for a key missing from the Japanese catalogue', () => {
    const i18n = initI18n('ja')
    // `fallbackLng: 'en'` means an untranslated key renders the English string
    // rather than the raw key, so a partial ja catalogue is never user-visible
    // as gibberish.
    expect(i18n.options.fallbackLng).toEqual(['en'])
    initI18n('en')
  })

  it('exposes the supported languages and namespaces', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'ja'])
    // Phase 2 (Task 17) is registering one namespace per surface in parallel;
    // this list is kept in sync with src/i18n/index.ts's NAMESPACES as each
    // lands, not owned by any single task.
    expect(NAMESPACES).toEqual(['common', 'layout', 'library', 'device', 'settings', 'today', 'domain', 'people', 'calendar', 'chat', 'projects'])
  })

  it('warns via console.warn when a key is missing from every catalogue (DEV only)', () => {
    // Regression test (review round 1): i18next only calls missingKeyHandler
    // when saveMissing is truthy — it gates the call site itself, not just
    // the "persist to a backend" behaviour. `saveMissing: false` with a
    // defined missingKeyHandler silently makes the handler dead code, in
    // every environment. This test fails loudly if that coupling breaks again.
    //
    // import.meta.env.DEV is true under Vitest (mode: 'test'), so the
    // console.warn path is directly exercisable here — no need to fall back
    // to asserting the raw saveMissing option value.
    expect(import.meta.env.DEV).toBe(true)

    const i18n = initI18n('en')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    i18n.t('__i18n_missing_key_regression_test__')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[i18n\] missing key: common:__i18n_missing_key_regression_test__$/)
    )

    warnSpy.mockRestore()
  })
})
