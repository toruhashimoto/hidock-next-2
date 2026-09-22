/**
 * The language selector is the only UI control for a UI-language preference in
 * the app. There is no theme selector to sit beside — useTheme() is a reconciler
 * with no control wired to it — so this is built from scratch.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useUIStore } from '@/store/ui/useUIStore'
import i18n from '@/i18n'

const setLanguage = vi.fn()

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    language: useUIStore.getState().language,
    resolvedLanguage: 'en',
    setLanguage
  })
}))

afterEach(() => {
  void i18n.changeLanguage('en')
  useUIStore.setState({ language: 'system' })
  vi.clearAllMocks()
})

describe('Settings — language selector', () => {
  it('offers the three preferences and reports the active one', async () => {
    const { LanguageSettingsCard } = await import('../Settings')
    render(<LanguageSettingsCard />)

    const group = screen.getByRole('group', { name: 'Display language' })
    expect(group).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '日本語' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sets the preference when a language is picked', async () => {
    const { LanguageSettingsCard } = await import('../Settings')
    render(<LanguageSettingsCard />)

    fireEvent.click(screen.getByRole('button', { name: '日本語' }))

    await waitFor(() => expect(setLanguage).toHaveBeenCalledWith('ja'))
  })
})
