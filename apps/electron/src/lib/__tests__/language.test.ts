/**
 * Language core — the framework-free resolution shared by the pre-paint
 * bootstrap and the React reconciler. Mirrors src/lib/theme.ts.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  resolveLanguage,
  systemLanguage,
  readPersistedLanguagePreference,
  bootstrapLanguage
} from '../language'
import { UI_STORE_KEY } from '../theme'
import i18n from '@/i18n'

/** Point navigator.language at a fixed value for one assertion. */
function withNavigatorLanguage(value: string, run: () => void): void {
  const spy = vi.spyOn(navigator, 'language', 'get').mockReturnValue(value)
  try {
    run()
  } finally {
    spy.mockRestore()
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  void i18n.changeLanguage('en')
})

describe('systemLanguage', () => {
  it("returns 'ja' for any Japanese locale tag", () => {
    withNavigatorLanguage('ja', () => expect(systemLanguage()).toBe('ja'))
    withNavigatorLanguage('ja-JP', () => expect(systemLanguage()).toBe('ja'))
  })

  it("returns 'en' for every other locale", () => {
    withNavigatorLanguage('en-US', () => expect(systemLanguage()).toBe('en'))
    withNavigatorLanguage('de-DE', () => expect(systemLanguage()).toBe('en'))
    withNavigatorLanguage('', () => expect(systemLanguage()).toBe('en'))
  })
})

describe('resolveLanguage', () => {
  it('passes explicit preferences straight through', () => {
    expect(resolveLanguage('en')).toBe('en')
    expect(resolveLanguage('ja')).toBe('ja')
  })

  it("resolves 'system' through navigator.language", () => {
    withNavigatorLanguage('ja-JP', () => expect(resolveLanguage('system')).toBe('ja'))
    withNavigatorLanguage('en-GB', () => expect(resolveLanguage('system')).toBe('en'))
  })
})

describe('readPersistedLanguagePreference', () => {
  it("defaults to 'system' when nothing is stored", () => {
    expect(readPersistedLanguagePreference()).toBe('system')
  })

  it('reads the preference the UI store persisted', () => {
    localStorage.setItem(UI_STORE_KEY, JSON.stringify({ state: { language: 'ja' } }))
    expect(readPersistedLanguagePreference()).toBe('ja')
  })

  it("defaults to 'system' for unparseable or unknown values", () => {
    localStorage.setItem(UI_STORE_KEY, 'not json')
    expect(readPersistedLanguagePreference()).toBe('system')

    localStorage.setItem(UI_STORE_KEY, JSON.stringify({ state: { language: 'fr' } }))
    expect(readPersistedLanguagePreference()).toBe('system')
  })
})

describe('bootstrapLanguage', () => {
  it('initialises i18next with the persisted preference', () => {
    localStorage.setItem(UI_STORE_KEY, JSON.stringify({ state: { language: 'ja' } }))
    bootstrapLanguage()
    expect(i18n.language).toBe('ja')
  })
})
