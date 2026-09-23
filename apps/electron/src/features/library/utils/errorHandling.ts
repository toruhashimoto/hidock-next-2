/**
 * Error Handling Utilities for Library
 *
 * Provides consistent error handling for audio playback, downloads, and transcription.
 *
 * i18n note (Task 11c): these are plain functions (not React components), so
 * `useTranslation()` is unavailable. `parseError`/`getErrorMessage`/
 * `getRecoveryAction` are all consumed directly — with fixed call signatures
 * — by several files outside this task's scope (hooks/useAudioPlayback.ts,
 * hooks/useBulkOperation.ts, hooks/useDownloadOrchestrator.ts,
 * store/useLibraryStore.ts), so their exported signatures cannot change.
 * They resolve copy via the shared `i18n` singleton (`i18n.t(...)`, task
 * brief "approach 2") instead of taking a `t` parameter. Unlike the
 * module-scope constants in deletionCopy.ts, every translated value here is
 * built freshly *inside* a function body on each call, so all three
 * functions are fully reactive to a language switch (no restart needed).
 */

import i18n from '@/i18n'

export type LibraryErrorType =
  | 'audio_not_found'
  | 'audio_codec_error'
  | 'audio_permission_denied'
  | 'download_failed'
  | 'download_interrupted'
  | 'download_disk_full'
  | 'transcription_failed'
  | 'transcription_timeout'
  | 'transcription_rate_limit'
  | 'device_disconnected'
  | 'network_error'
  | 'unknown'

export interface LibraryError {
  type: LibraryErrorType
  message: string
  recoverable: boolean
  retryable: boolean
  details?: string
  sourceId?: string
}

/**
 * Parse an error and return a structured LibraryError
 */
export function parseError(error: unknown, context: string = ''): LibraryError {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorName = error instanceof Error ? error.name : ''

  // Audio playback errors
  if (context.includes('audio') || context.includes('play')) {
    if (errorName === 'NotFoundError' || errorMessage.includes('not found')) {
      return {
        type: 'audio_not_found',
        message: i18n.t('library:errorHandling.audioNotFoundMessage'),
        recoverable: false,
        retryable: false,
        details: i18n.t('library:errorHandling.audioNotFoundDetails')
      }
    }
    if (errorName === 'NotSupportedError' || errorMessage.includes('codec') || errorMessage.includes('format')) {
      return {
        type: 'audio_codec_error',
        message: i18n.t('library:errorHandling.audioCodecErrorMessage'),
        recoverable: false,
        retryable: false,
        details: i18n.t('library:errorHandling.audioCodecErrorDetails')
      }
    }
    if (errorName === 'NotAllowedError' || errorMessage.includes('permission')) {
      return {
        type: 'audio_permission_denied',
        message: i18n.t('library:errorHandling.audioPermissionDeniedMessage'),
        recoverable: true,
        retryable: true,
        details: i18n.t('library:errorHandling.audioPermissionDeniedDetails')
      }
    }
  }

  // Download errors
  if (context.includes('download')) {
    if (errorMessage.includes('disk') || errorMessage.includes('space') || errorMessage.includes('full')) {
      return {
        type: 'download_disk_full',
        message: i18n.t('library:errorHandling.downloadDiskFullMessage'),
        recoverable: true,
        retryable: true,
        details: i18n.t('library:errorHandling.downloadDiskFullDetails')
      }
    }
    if (errorMessage.includes('disconnect') || errorMessage.includes('USB')) {
      return {
        type: 'download_interrupted',
        message: i18n.t('library:errorHandling.downloadInterruptedMessage'),
        recoverable: true,
        retryable: true,
        details: i18n.t('library:errorHandling.downloadInterruptedDetails')
      }
    }
    return {
      type: 'download_failed',
      message: i18n.t('library:errorHandling.downloadFailedMessage'),
      recoverable: true,
      retryable: true,
      details: errorMessage
    }
  }

  // Transcription errors
  if (context.includes('transcri') || context.includes('process')) {
    if (errorMessage.includes('timeout')) {
      return {
        type: 'transcription_timeout',
        message: i18n.t('library:errorHandling.transcriptionTimeoutMessage'),
        recoverable: true,
        retryable: true,
        details: i18n.t('library:errorHandling.transcriptionTimeoutDetails')
      }
    }
    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return {
        type: 'transcription_rate_limit',
        message: i18n.t('library:errorHandling.transcriptionRateLimitMessage'),
        recoverable: true,
        retryable: true,
        details: i18n.t('library:errorHandling.transcriptionRateLimitDetails')
      }
    }
    return {
      type: 'transcription_failed',
      message: i18n.t('library:errorHandling.transcriptionFailedMessage'),
      recoverable: true,
      retryable: true,
      details: errorMessage
    }
  }

  // Device errors
  if (errorMessage.includes('device') || errorMessage.includes('USB') || errorMessage.includes('disconnect')) {
    return {
      type: 'device_disconnected',
      message: i18n.t('library:errorHandling.deviceDisconnectedMessage'),
      recoverable: true,
      retryable: true,
      details: i18n.t('library:errorHandling.deviceDisconnectedDetails')
    }
  }

  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection')) {
    return {
      type: 'network_error',
      message: i18n.t('library:errorHandling.networkErrorMessage'),
      recoverable: true,
      retryable: true,
      details: i18n.t('library:errorHandling.networkErrorDetails')
    }
  }

  // Unknown error
  return {
    type: 'unknown',
    message: i18n.t('library:errorHandling.unknownErrorMessage'),
    recoverable: true,
    retryable: true,
    details: errorMessage
  }
}

/**
 * Get user-friendly message for an error type
 */
export function getErrorMessage(type: LibraryErrorType): string {
  const messages: Record<LibraryErrorType, string> = {
    audio_not_found: i18n.t('library:errorHandling.friendlyAudioNotFound'),
    audio_codec_error: i18n.t('library:errorHandling.friendlyAudioCodecError'),
    audio_permission_denied: i18n.t('library:errorHandling.friendlyAudioPermissionDenied'),
    download_failed: i18n.t('library:errorHandling.friendlyDownloadFailed'),
    download_interrupted: i18n.t('library:errorHandling.friendlyDownloadInterrupted'),
    download_disk_full: i18n.t('library:errorHandling.friendlyDownloadDiskFull'),
    transcription_failed: i18n.t('library:errorHandling.friendlyTranscriptionFailed'),
    transcription_timeout: i18n.t('library:errorHandling.friendlyTranscriptionTimeout'),
    transcription_rate_limit: i18n.t('library:errorHandling.friendlyTranscriptionRateLimit'),
    device_disconnected: i18n.t('library:errorHandling.friendlyDeviceDisconnected'),
    network_error: i18n.t('library:errorHandling.friendlyNetworkError'),
    unknown: i18n.t('library:errorHandling.friendlyUnknown')
  }
  return messages[type]
}

/**
 * Get recovery action for an error type
 */
export function getRecoveryAction(
  type: LibraryErrorType
): { label: string; action: 'retry' | 'dismiss' | 'settings' | 'device' | 'delete' } | null {
  switch (type) {
    case 'audio_not_found':
      return { label: i18n.t('library:errorHandling.recoveryRemoveFromLibrary'), action: 'delete' }
    case 'audio_codec_error':
      return { label: i18n.t('library:errorHandling.recoveryRedownload'), action: 'retry' }
    case 'audio_permission_denied':
      return { label: i18n.t('library:errorHandling.recoveryOpenSettings'), action: 'settings' }
    case 'download_failed':
    case 'download_interrupted':
    case 'download_disk_full':
      return { label: i18n.t('library:errorHandling.recoveryRetryDownload'), action: 'retry' }
    case 'transcription_failed':
    case 'transcription_timeout':
      return { label: i18n.t('library:errorHandling.recoveryRetryTranscription'), action: 'retry' }
    case 'transcription_rate_limit':
      return { label: i18n.t('library:errorHandling.recoveryDismiss'), action: 'dismiss' }
    case 'device_disconnected':
      return { label: i18n.t('library:errorHandling.recoveryGoToDevice'), action: 'device' }
    case 'network_error':
      return { label: i18n.t('library:errorHandling.recoveryRetry'), action: 'retry' }
    case 'unknown':
      return { label: i18n.t('library:errorHandling.recoveryDismiss'), action: 'dismiss' }
    default:
      return null
  }
}

/**
 * Retry logic with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; context?: string } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, context = '' } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const parsedError = parseError(error, context)

      // Don't retry non-retryable errors
      if (!parsedError.retryable) {
        throw error
      }

      // Don't retry after max attempts
      if (attempt === maxRetries) {
        throw error
      }

      // Exponential backoff: 1s, 2s, 4s, ...
      const delay = baseDelay * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
