/**
 * useLanguage — reconciles the persisted language preference with i18next and
 * mirrors the choice into config.json. useTheme has no hook-level test, so this
 * is a new one rather than a copy of an existing pattern.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLanguage } from '../useLanguage'
import { useUIStore } from '@/store/ui/useUIStore'
import { useConfigStore } from '@/store/domain/useConfigStore'
import i18n from '@/i18n'

// Full snapshot of useConfigStore, captured fresh before each test and restored
// afterwards. Two of the tests below swap in a stub `updateConfig` via
// `useConfigStore.setState({ updateConfig } as never)` — a PARTIAL merge (Zustand's
// default), so the stub is the only field that changes and nothing puts the real
// implementation back once the test ends. Restoring the full snapshot with the
// `replace = true` form of setState undoes that regardless of which field a given
// test stubbed, so later tests in this file (and later files, if Vitest's per-file
// module isolation is ever relaxed) never inherit a stubbed store.
let originalConfigState: ReturnType<typeof useConfigStore.getState>

beforeEach(() => {
  useUIStore.setState({ language: 'system' })
  originalConfigState = useConfigStore.getState()
})

afterEach(() => {
  void i18n.changeLanguage('en')
  useConfigStore.setState(originalConfigState, true)
  vi.restoreAllMocks()
})

describe('useLanguage', () => {
  it('applies the preference to i18next', async () => {
    const { result } = renderHook(() => useLanguage())

    act(() => result.current.setLanguage('ja'))

    await waitFor(() => expect(i18n.language).toBe('ja'))
    expect(result.current.language).toBe('ja')
    expect(result.current.resolvedLanguage).toBe('ja')
  })

  it('mirrors the choice into config.ui.language', async () => {
    const updateConfig = vi.fn().mockResolvedValue(undefined)
    useConfigStore.setState({ updateConfig } as never)

    const { result } = renderHook(() => useLanguage())
    act(() => result.current.setLanguage('ja'))

    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith('ui', { language: 'ja' }))
  })

  it('survives a failing config mirror', async () => {
    const updateConfig = vi.fn().mockRejectedValue(new Error('disk full'))
    useConfigStore.setState({ updateConfig } as never)

    const { result } = renderHook(() => useLanguage())
    act(() => result.current.setLanguage('ja'))

    // localStorage remains the source of truth; the rejection must not surface.
    await waitFor(() => expect(useUIStore.getState().language).toBe('ja'))
  })
})
