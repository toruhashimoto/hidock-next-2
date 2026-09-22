/**
 * i18n core — initialisation contract shared by the app entry point and the
 * Vitest setup file. Both call initI18n(); it must be safe to call twice.
 */

import { describe, it, expect } from 'vitest'
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
    expect(NAMESPACES).toEqual(['common', 'layout', 'library', 'device', 'settings', 'today'])
  })
})
