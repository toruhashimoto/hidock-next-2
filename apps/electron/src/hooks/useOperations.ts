import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/components/ui/toaster'
import { useTranscriptionStore } from '@/store/features/useTranscriptionStore'
import {
  cancelDownloads,
  cancelDownloadsComplete,
  requestScopedDownloads,
  markDownloadPriority,
  releaseDownloadBookkeeping,
  clearAllDownloadBookkeeping,
  markDownloadCancelled,
  clearDownloadCancelled,
  drainDownloadQueue,
  isRetryableDownloadItem
} from '@/hooks/useDownloadOrchestrator'
import type { UnifiedRecording } from '@/types/unified-recording'
import { hasLocalPath, isDeviceOnly } from '@/types/unified-recording'
import type { AppConfig } from '@/types'
import { getHiDockDeviceService } from '@/services/hidock-device'

/**
 * Centralized hook for all download and transcription operations.
 *
 * Every component that triggers downloads or transcriptions MUST use this hook
 * instead of calling IPC directly. This ensures:
 * - Consistent toast notifications
 * - Store updates for sidebar panel
 * - Error handling with user-visible messages
 * - DRY: single place to change operation behavior
 */
export function useOperations() {
  const { t } = useTranslation()
  const addToQueue = useTranscriptionStore((s) => s.addToQueue)

  const validateTranscriptionConfig = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.electronAPI.config.get()
      const config = result?.success ? (result.data as AppConfig) : null
      const provider = config?.transcription?.provider || 'gemini'

      if (provider === 'gemini') {
        const apiKey = config?.transcription?.geminiApiKey
        if (!apiKey || apiKey.trim() === '') {
          toast({
            title: t('layout:operationsToasts.apiKeyRequiredTitle'),
            description: t('layout:operationsToasts.apiKeyRequiredDescription'),
            variant: 'error'
          })
          return false
        }
      }

      if (provider === 'local-asr') {
        const asrPath = config?.transcription?.localAsrPath
        if (!asrPath || asrPath.trim() === '') {
          toast({
            title: t('layout:operationsToasts.asrPathRequiredTitle'),
            description: t('layout:operationsToasts.asrPathRequiredDescription'),
            variant: 'error'
          })
          return false
        }

        const diarize = config?.transcription?.localAsrDiarize !== false
        const hfToken = config?.transcription?.localAsrHfToken
        if (diarize && (!hfToken || hfToken.trim() === '')) {
          toast({
            title: t('layout:operationsToasts.hfTokenRequiredTitle'),
            description: t('layout:operationsToasts.hfTokenRequiredDescription'),
            variant: 'error'
          })
          return false
        }
      }

      return true
    } catch (e) {
      console.error('Failed to check transcription configuration:', e)
      toast({ title: t('layout:operationsToasts.configErrorTitle'), description: t('layout:operationsToasts.configErrorDescription'), variant: 'error' })
      return false
    }
  }, [t])

  // ── Transcription ──────────────────────────────────────

  const queueTranscription = useCallback(async (recording: UnifiedRecording) => {
    if (!hasLocalPath(recording)) {
      toast({ title: t('layout:operationsToasts.cannotTranscribeTitle'), description: t('layout:operationsToasts.fileNotAvailableDescription'), variant: 'error' })
      return false
    }
    if (recording.transcriptionStatus === 'processing') {
      return false
    }

    if (!(await validateTranscriptionConfig())) {
      return false
    }

    try {
      // The same primary control is labelled "Re-transcribe" for a completed
      // recording. Route that click through the explicit reprocess IPC so the
      // queue row records a provider override and the main process can
      // distinguish corrective user work from an automatic/background retry.
      // Previously this branch returned false above, making the primary
      // Re-transcribe button a no-op while the dropdown happened to work.
      if (recording.transcriptionStatus === 'complete') {
        const configResult = await window.electronAPI.config.get()
        const configuredProvider = configResult?.success
          ? (configResult.data as AppConfig)?.transcription?.provider
          : undefined
        const provider = configuredProvider === 'local-asr' || configuredProvider === 'vibevoice'
          ? configuredProvider
          : 'gemini'
        const result = await window.electronAPI.recordings.reprocessWith(recording.id, provider)
        if (!result?.success || !result.queueItemId) {
          toast({
            title: t('layout:operationsToasts.failedToRetranscribeTitle'),
            description: result?.error || t('layout:operationsToasts.couldNotAddCorrectiveDescription'),
            variant: 'error'
          })
          return false
        }
        addToQueue(result.queueItemId, recording.id, recording.filename)
        toast({ title: t('layout:operationsToasts.retranscriptionQueuedTitle'), description: recording.filename })
        return true
      }

      await window.electronAPI.recordings.updateStatus(recording.id, 'pending')
      // Single explicit request → priority: jumps ahead of the recency-ordered backlog.
      const queueItemId = await window.electronAPI.recordings.addToQueue(recording.id, true)
      if (!queueItemId) {
        toast({ title: t('layout:operationsToasts.failedToQueueTranscriptionTitle'), description: t('layout:operationsToasts.couldNotAddToQueueDescription'), variant: 'error' })
        return false
      }
      addToQueue(queueItemId, recording.id, recording.filename)
      toast({ title: t('layout:operationsToasts.transcriptionQueuedTitle'), description: recording.filename })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('common:errors.unknown')
      toast({ title: t('layout:operationsToasts.failedToQueueTranscriptionTitle'), description: msg, variant: 'error' })
      return false
    }
  }, [addToQueue, validateTranscriptionConfig, t])

  const reprocessWithVibeVoice = useCallback(async (recording: UnifiedRecording) => {
    if (!hasLocalPath(recording)) {
      toast({ title: t('layout:operationsToasts.cannotRetranscribeTitle'), description: t('layout:operationsToasts.fileNotAvailableDescription'), variant: 'error' })
      return false
    }
    if (recording.transcriptionStatus === 'processing') {
      toast({ title: t('layout:operationsToasts.alreadyInProgressTitle'), description: recording.filename })
      return false
    }

    try {
      const result = await window.electronAPI.recordings.reprocessWith(recording.id, 'vibevoice')
      if (!result?.success) {
        toast({ title: t('layout:operationsToasts.failedToRetranscribeTitle'), description: result?.error || t('layout:operationsToasts.couldNotQueueVibevoiceDescription'), variant: 'error' })
        return false
      }
      if (result.queueItemId) {
        addToQueue(result.queueItemId, recording.id, recording.filename)
      }
      toast({ title: t('layout:operationsToasts.retranscribingVibevoiceTitle'), description: recording.filename })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('common:errors.unknown')
      toast({ title: t('layout:operationsToasts.failedToRetranscribeTitle'), description: msg, variant: 'error' })
      return false
    }
  }, [addToQueue, t])

  const queueBulkTranscriptions = useCallback(async (recordings: UnifiedRecording[]) => {
    const eligible = recordings.filter(
      (r) => hasLocalPath(r) && r.transcriptionStatus !== 'processing' && r.transcriptionStatus !== 'complete'
    )
    if (eligible.length === 0) {
      toast({ title: t('layout:operationsToasts.noRecordingsToTranscribeTitle'), description: t('layout:operationsToasts.allAlreadyTranscribedDescription') })
      return 0
    }

    if (!(await validateTranscriptionConfig())) {
      return 0
    }

    let queued = 0
    for (const recording of eligible) {
      try {
        await window.electronAPI.recordings.updateStatus(recording.id, 'pending')
        // Bulk: no priority flag — these sort by recording date (newest first),
        // so a single explicit request can still jump ahead of the whole batch.
        const queueItemId = await window.electronAPI.recordings.addToQueue(recording.id)
        if (queueItemId) {
          addToQueue(queueItemId, recording.id, recording.filename)
          queued++
        }
      } catch (e) {
        console.error('Failed to queue:', recording.filename, e)
      }
    }

    // Original ternary was `queued > 1` — singular at BOTH 0 and 1, unlike i18next's
    // default English plural rule. Fake the plural-category count (1 vs 2) so
    // `_one`/`_other` resolve the same way, while `{{queued}}` interpolates the real number.
    toast({
      title: t('layout:operationsToasts.transcriptionsQueuedTitle', { count: queued > 1 ? 2 : 1, queued }),
      description: t('layout:operationsToasts.processingWillBeginDescription')
    })
    return queued
  }, [addToQueue, validateTranscriptionConfig, t])

  const cancelTranscription = useCallback(async (recordingId: string) => {
    try {
      await window.electronAPI.recordings.cancelTranscription(recordingId)
      // TQ-03 FIX: Find and remove queue item by recordingId, not by item ID
      const store = useTranscriptionStore.getState()
      const items = Array.from(store.queue.values())
      const item = items.find((i) => i.recordingId === recordingId)
      if (item) {
        store.remove(item.id)
      }
      toast({ title: t('layout:operationsToasts.transcriptionCancelledTitle') })
    } catch (e) {
      console.error('Failed to cancel transcription:', e)
    }
  }, [t])

  const cancelAllTranscriptions = useCallback(async () => {
    try {
      const result = await window.electronAPI.recordings.cancelAllTranscriptions()
      useTranscriptionStore.getState().clear()
      toast({
        title: t('layout:operationsToasts.allTranscriptionsCancelledTitle'),
        description: t('layout:operationsToasts.itemsRemovedFromQueueDescription', { n: result.count })
      })
    } catch (e) {
      console.error('Failed to cancel transcriptions:', e)
    }
  }, [t])

  // ── Downloads ──────────────────────────────────────────

  const queueDownload = useCallback(async (recording: UnifiedRecording) => {
    if (!isDeviceOnly(recording)) return false

    try {
      // Slice 1: register the explicit scope BEFORE enqueueing so the orchestrator
      // only downloads this file (not the whole pending queue) when auto-download is off.
      requestScopedDownloads([recording.deviceFilename])
      // Defect C: a single explicit download jumps ahead of the recency-ordered backlog.
      markDownloadPriority([recording.deviceFilename])
      await window.electronAPI.downloadService.queueDownloads([{
        filename: recording.deviceFilename,
        size: recording.size,
        dateCreated: recording.dateRecorded.toISOString()
      }])
      // A restored pending row may already exist in the main-process queue while
      // the renderer's explicit-request scope was lost during restart. Re-registering
      // above plus an explicit drain makes the visible Download/Start action actually
      // start that row instead of leaving it in a permanent "pending" state.
      drainDownloadQueue()
      toast({ title: t('layout:operationsToasts.downloadQueuedTitle'), description: recording.filename })
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('common:errors.unknown')
      toast({ title: t('device:fileList.downloadFailedShort'), description: msg, variant: 'error' })
      return false
    }
  }, [t])

  const queueBulkDownloads = useCallback(async (recordings: UnifiedRecording[]) => {
    const eligible = recordings.filter(isDeviceOnly)
    if (eligible.length === 0) return 0

    try {
      // Slice 1: explicit scope = exactly the requested recordings.
      requestScopedDownloads(eligible.map((r) => r.deviceFilename))
      await window.electronAPI.downloadService.queueDownloads(
        eligible.map((r) => ({
          filename: r.deviceFilename,
          size: r.size,
          dateCreated: r.dateRecorded.toISOString()
        }))
      )
      drainDownloadQueue()
      // Original ternary was `eligible.length > 1` — singular at BOTH 0 and 1. Fake the
      // plural-category count (1 vs 2) so `_one`/`_other` resolve the same way, while
      // `{{n}}` interpolates the real number.
      toast({ title: t('layout:operationsToasts.bulkDownloadsQueuedTitle', { count: eligible.length > 1 ? 2 : 1, n: eligible.length }) })
      return eligible.length
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('common:errors.unknown')
      toast({ title: t('layout:operationsToasts.downloadsFailedTitle'), description: msg, variant: 'error' })
      return 0
    }
  }, [t])

  /**
   * Cancel a single in-progress or pending download. Awaits the main-process
   * settlement (Phase-1 contract: aborts the in-flight USB transfer and resolves only
   * after the device has settled), so the caller can reflect the 'cancelling' →
   * 'cancelled' transition. Releases the file's scope/priority bookkeeping so the
   * orchestrator does not auto-requeue it; it stays retryable by explicit re-download.
   */
  const cancelDownload = useCallback(async (filename: string) => {
    // Finding 1: mark this file as user-cancelled in the renderer orchestrator BEFORE
    // awaiting, so when the aborted transfer resolves-false back in processDownload it
    // is recognized as a cancellation (surfaced as 'cancelled', no error toast/log, not
    // counted as a failure) rather than a USB failure. A per-file cancel only aborts the
    // MAIN-process transfer, so the renderer queue signal alone can't tell them apart.
    markDownloadCancelled(filename)
    try {
      releaseDownloadBookkeeping(filename)
      const res = await window.electronAPI.downloadService.cancel(filename)
      if (res?.success === false) {
        // Nothing was cancelled (e.g. already terminal / not in flight) — drop the
        // marker so a genuinely running transfer is never mislabeled as cancelled.
        clearDownloadCancelled(filename)
        toast({ title: t('layout:operationsToasts.couldNotCancelDownloadTitle'), description: res.error || filename, variant: 'error' })
        return false
      }
      toast({ title: t('layout:operationsToasts.downloadCancelledTitle'), description: filename })
      return true
    } catch (e) {
      clearDownloadCancelled(filename)
      const msg = e instanceof Error ? e.message : t('common:errors.unknown')
      toast({ title: t('layout:operationsToasts.couldNotCancelDownloadTitle'), description: msg, variant: 'error' })
      return false
    }
  }, [t])

  const cancelAllDownloads = useCallback(async () => {
    try {
      // Immediate renderer-side stop (abort the loop + deviceSyncing=false) for snappy
      // UI, then AWAIT the single main-process cancelAll which owns the USB abort +
      // drain and empties the queue. Don't flip durable state before it resolves.
      cancelDownloads()
      await window.electronAPI.downloadService.cancelAll()
      clearAllDownloadBookkeeping()
      toast({ title: t('layout:operationsToasts.allDownloadsCancelledTitle') })
    } catch (e) {
      console.error('Failed to cancel downloads:', e)
      toast({ title: t('layout:operationsToasts.couldNotCancelDownloadsTitle'), variant: 'error' })
    } finally {
      cancelDownloadsComplete()
    }
  }, [t])

  const retryFailedDownloads = useCallback(async (): Promise<number> => {
    const deviceService = getHiDockDeviceService()
    if (!deviceService.isConnected()) {
      toast({ title: t('layout:operationsToasts.connectToRetryDownloadsTitle'), variant: 'error' })
      return 0
    }

    try {
      const state = await window.electronAPI.downloadService.getState()
      const failed = state.queue.filter((item) => isRetryableDownloadItem(item))
      if (failed.length === 0) return 0
      requestScopedDownloads(failed.map((item) => item.filename))
      const result = await window.electronAPI.downloadService.retryFailed(true, false)
      if (result.count === 0) {
        for (const item of failed) releaseDownloadBookkeeping(item.filename)
        toast({ title: t('layout:operationsToasts.noDownloadsRetriedTitle'), description: result.error, variant: 'error' })
        return 0
      }
      drainDownloadQueue()
      // Standard i18next English rule (singular at 1, plural at 0 and 2+) matches the
      // original `=== 1` ternary exactly, so the real count drives pluralization directly.
      toast({ title: t('layout:operationsToasts.downloadsQueuedForRetryTitle', { count: result.count }) })
      return result.count
    } catch (e) {
      const message = e instanceof Error ? e.message : t('common:errors.unknown')
      toast({ title: t('layout:operationsToasts.couldNotRetryDownloadsTitle'), description: message, variant: 'error' })
      return 0
    }
  }, [t])

  return {
    // Transcription
    queueTranscription,
    reprocessWithVibeVoice,
    queueBulkTranscriptions,
    cancelTranscription,
    cancelAllTranscriptions,
    // Downloads
    queueDownload,
    queueBulkDownloads,
    cancelDownload,
    cancelAllDownloads,
    retryFailedDownloads
  }
}
