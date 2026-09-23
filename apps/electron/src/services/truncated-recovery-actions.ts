/**
 * The Library toast's "Recover N from the device" action.
 *
 * The main process rebuilds the plan and queues the replacements in the
 * ordinary download queue, so they show up in the download progress UI like
 * any other download. Queued files are registered as an explicit request
 * (requestScopedDownloads) so they are processed even with auto-download off,
 * the same way a Library "Download" click is.
 */

import i18n from '@/i18n'
import { toast } from '@/components/ui/toaster'
import { requestScopedDownloads, drainDownloadQueue } from '@/hooks/useDownloadOrchestrator'

export async function recoverTruncated(): Promise<number> {
  try {
    const result = await window.electronAPI.downloadService.recoverTruncated()
    const queued = result?.queued ?? []
    if (queued.length === 0) {
      toast.info(
        i18n.t('library:truncatedRecovery.nothingQueuedTitle'),
        // The main process's own reason wins when it gave one; it is already a
        // sentence and this renderer has no key for whatever it says.
        result?.skipped?.[0]?.reason ?? i18n.t('library:truncatedRecovery.nothingQueuedMessage')
      )
      return 0
    }
    requestScopedDownloads(queued)
    drainDownloadQueue()
    toast.success(
      i18n.t('library:truncatedRecovery.queuedTitle', { count: queued.length }),
      i18n.t('library:truncatedRecovery.queuedMessage')
    )
    return queued.length
  } catch (e) {
    toast.error(
      i18n.t('library:truncatedRecovery.errorTitle'),
      e instanceof Error ? e.message : i18n.t('common:errors.unknown')
    )
    return 0
  }
}
