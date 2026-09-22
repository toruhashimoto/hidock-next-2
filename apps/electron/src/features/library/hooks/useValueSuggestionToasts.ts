/**
 * Coalesced value-classification suggestion toasts (F16/spec-003, Part F).
 *
 * Subscribes to `capture:value-classified` domain events (emitted ONLY by the
 * LIVE transcription path, for low/none results — see
 * electron/main/services/value-classification.ts + transcription.ts). The
 * backfill runner (value-backfill.ts) deliberately emits NO per-capture
 * events — only throttled progress + one final summary — so a large batch
 * can never spam this toaster; this hook only ever sees the live single-item
 * stream.
 *
 * Coalescing: events are buffered and flushed on a debounce window (default
 * 2.5s) so a short burst (e.g. several captures classified moments apart)
 * still produces exactly ONE toast, never one per capture:
 *  - 1 event  -> a toast naming the single capture, with a "Mark personal"
 *    action (opt-in, reversible — NEVER auto-applied).
 *  - N>1      -> one summary toast with a "Review" action (no per-row
 *    Mark-personal when aggregated — there's no single row to target).
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatValueReasons } from '@/features/library/utils/valueReasons'

interface ValueClassifiedPayload {
  recordingId: string
  captureId: string
  rating: 'low-value' | 'garbage'
  reasons: string[]
}

export interface UseValueSuggestionToastsOptions {
  /** Called after "Mark personal" succeeds, so the row's badge/pill refreshes. */
  refresh: (forceDeviceRefresh?: boolean) => Promise<void> | void
  /** Called when the aggregated (N>1) toast's "Review" action is clicked.
   *  Mounted on the Library page itself, this is typically just applying the
   *  low-value quality filter in place — no real route navigation needed. */
  onReview?: () => void
  /** Debounce window for coalescing rapid-fire events into one toast.
   *  Test-injectable; production default is 2.5s. */
  debounceMs?: number
}

/**
 * Mount ONCE (Library page or App shell) — see spec-003 Part F step 17.
 *
 * i18n note (Task 11c): this is a genuine React hook (always called from
 * within a component's render), not a plain data helper, so — unlike the
 * `utils/` modules in this feature — it CAN call `useTranslation()` directly.
 * This mirrors the existing precedent in `features/today/useTodayCaptures.ts`
 * / `useTodayCommits.ts` (Task 9), which do the same for the same reason.
 */
export function useValueSuggestionToasts({ refresh, onReview, debounceMs = 2500 }: UseValueSuggestionToastsOptions): void {
  const { t } = useTranslation('library')
  const bufferRef = useRef<ValueClassifiedPayload[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Refs so the subscription effect below never needs to re-subscribe just
  // because the caller passed a new refresh/onReview closure identity.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const onReviewRef = useRef(onReview)
  onReviewRef.current = onReview

  useEffect(() => {
    const onDomainEvent = window.electronAPI?.onDomainEvent
    if (!onDomainEvent) return

    const flush = () => {
      timerRef.current = null
      const events = bufferRef.current
      bufferRef.current = []
      if (events.length === 0) return

      import('@/components/ui/toaster').then(({ toast }) => {
        if (events.length === 1) {
          const { recordingId, rating, reasons } = events[0]
          const title = rating === 'garbage' ? t('useValueSuggestionToasts.markedGarbageTitle') : t('useValueSuggestionToasts.markedLowValueTitle')
          const description = formatValueReasons(reasons) || t('useValueSuggestionToasts.aiAssessedFallback')
          toast.info(title, description, {
            action: {
              label: t('useValueSuggestionToasts.markPersonalActionLabel'),
              onClick: () => {
                window.electronAPI.recordings
                  .markPersonal(recordingId, true)
                  .then(() => refreshRef.current(false))
                  .catch((e: unknown) => console.error('[useValueSuggestionToasts] markPersonal failed:', e))
              }
            },
            duration: 10000
          })
        } else {
          const n = events.length
          toast.info(
            t('useValueSuggestionToasts.multipleMarkedLowValueMessage', { count: n }),
            t('useValueSuggestionToasts.reviewLibraryMessage'),
            {
              action: {
                label: t('useValueSuggestionToasts.reviewActionLabel'),
                onClick: () => onReviewRef.current?.()
              },
              duration: 10000
            }
          )
        }
      })
    }

    const unsubscribe = onDomainEvent((event: { type?: string; payload?: unknown }) => {
      if (event?.type !== 'capture:value-classified') return
      const payload = event.payload as Partial<ValueClassifiedPayload> | undefined
      if (!payload?.recordingId || !payload?.captureId || !payload?.rating) return
      bufferRef.current.push({
        recordingId: payload.recordingId,
        captureId: payload.captureId,
        rating: payload.rating,
        reasons: Array.isArray(payload.reasons) ? payload.reasons : []
      })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, debounceMs)
    })

    return () => {
      unsubscribe?.()
      if (timerRef.current) clearTimeout(timerRef.current)
      bufferRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t`'s identity only
    // changes on an actual language switch (react-i18next), so including it here
    // is a deliberate re-subscribe-on-switch, not a missed dependency.
  }, [debounceMs, t])
}
