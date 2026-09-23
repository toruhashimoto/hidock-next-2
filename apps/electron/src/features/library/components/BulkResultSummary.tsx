/**
 * BulkResultSummary - Dialog showing results after bulk operations complete
 *
 * Displays summary of succeeded/failed/cancelled items and provides retry functionality
 * for failed items with retryable errors.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BulkOperationResult } from '@/hooks/useBulkOperation'
import { LibraryError } from '@/features/library/utils/errorHandling'
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react'

export interface BulkResultSummaryProps {
  isOpen: boolean
  onClose: () => void
  operation: 'Download' | 'Transcribe' | 'Delete'
  result: BulkOperationResult
  onRetryFailed: (ids: string[]) => void
}

/**
 * Determine dialog title based on operation result.
 *
 * `operation` is a fixed 3-value union ('Download' | 'Transcribe' | 'Delete')
 * supplied by the (out-of-scope) caller, so it is resolved to its own
 * translated word via OPERATION_KEYS and interpolated into one of 3 complete
 * per-outcome templates — not concatenated from separately-translated
 * fragments (rule 1): each of the 9 reachable (operation × outcome)
 * combinations reads as one whole sentence to the Task 14/15 translator.
 */
const OPERATION_KEYS: Record<BulkResultSummaryProps['operation'], string> = {
  Download: 'bulkResultSummary.operationDownload',
  Transcribe: 'bulkResultSummary.operationTranscribe',
  Delete: 'bulkResultSummary.operationDelete'
}

function getTitle(t: TFunction, result: BulkOperationResult, operation: BulkResultSummaryProps['operation']): string {
  const op = t(OPERATION_KEYS[operation])
  if (result.wasAborted) {
    return t('bulkResultSummary.titleCancelled', { operation: op })
  }
  if (result.failed.length === 0) {
    return t('bulkResultSummary.titleComplete', { operation: op })
  }
  return t('bulkResultSummary.titleCompletedWithErrors', { operation: op })
}

/**
 * Get icon for error item based on retryability
 */
function ErrorIcon({ error }: { error: LibraryError }) {
  const { t } = useTranslation('library')
  if (error.retryable) {
    return <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" aria-label={t('bulkResultSummary.retryableErrorLabel')} />
  }
  return <XCircle className="h-4 w-4 text-destructive flex-shrink-0" aria-label={t('bulkResultSummary.permanentErrorLabel')} />
}

export function BulkResultSummary({ isOpen, onClose, operation, result, onRetryFailed }: BulkResultSummaryProps) {
  const { t } = useTranslation('library')
  // Filter retryable failed items
  const retryableItems = useMemo(() => result.failed.filter((f) => f.error.retryable), [result.failed])

  const hasRetryableErrors = retryableItems.length > 0

  const handleRetry = () => {
    const retryableIds = retryableItems.map((item) => item.id)
    onRetryFailed(retryableIds)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col" aria-describedby="bulk-result-description">
        <DialogHeader>
          <DialogTitle>{getTitle(t, result, operation)}</DialogTitle>
          <DialogDescription id="bulk-result-description">
            {t('bulkResultSummary.summaryDescription', { operation: t(OPERATION_KEYS[operation]).toLowerCase() })}
          </DialogDescription>
        </DialogHeader>

        {/* Summary Statistics */}
        <div className="grid grid-cols-3 gap-4 py-4">
          {/* Succeeded */}
          <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-green-50 dark:bg-green-950/20">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mb-2" aria-hidden="true" />
            <div className="text-2xl font-bold text-green-700 dark:text-green-300" aria-label={t('bulkResultSummary.succeededCountAriaLabel')}>
              {result.succeeded.length}
            </div>
            <div className="text-sm text-green-600 dark:text-green-400">{t('bulkResultSummary.succeededLabel')}</div>
          </div>

          {/* Failed */}
          <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-red-50 dark:bg-red-950/20">
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400 mb-2" aria-hidden="true" />
            <div className="text-2xl font-bold text-red-700 dark:text-red-300" aria-label={t('bulkResultSummary.failedCountAriaLabel')}>
              {result.failed.length}
            </div>
            <div className="text-sm text-red-600 dark:text-red-400">{t('bulkResultSummary.failedLabel')}</div>
          </div>

          {/* Cancelled */}
          <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gray-50 dark:bg-gray-950/20">
            <AlertCircle className="h-8 w-8 text-gray-600 dark:text-gray-400 mb-2" aria-hidden="true" />
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300" aria-label={t('bulkResultSummary.cancelledCountAriaLabel')}>
              {result.cancelled.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('bulkResultSummary.cancelledLabel')}</div>
          </div>
        </div>

        {/* Failed Items List */}
        {result.failed.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <h3 className="text-sm font-semibold mb-2">{t('bulkResultSummary.failedItemsHeading')}</h3>
            <dl className="space-y-3" aria-label={t('bulkResultSummary.failedItemsListAriaLabel')}>
              {result.failed.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 p-3 rounded-lg border bg-card text-card-foreground"
                  role="group"
                  aria-label={t('bulkResultSummary.failedItemAriaLabel', { id: item.id })}
                >
                  <ErrorIcon error={item.error} />
                  <div className="flex-1 min-w-0">
                    <dt className="text-sm font-medium truncate" title={item.id}>
                      {item.id}
                    </dt>
                    <dd className="text-sm text-muted-foreground mt-1">{item.error.message}</dd>
                    {item.error.details && (
                      <dd className="text-xs text-muted-foreground mt-1 italic">{item.error.details}</dd>
                    )}
                    {item.error.retryable && (
                      <dd className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">{t('bulkResultSummary.canBeRetriedLabel')}</dd>
                    )}
                  </div>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Footer Actions */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('bulkResultSummary.dismissButton')}
          </Button>
          {hasRetryableErrors && (
            <Button onClick={handleRetry} aria-label={t('bulkResultSummary.retryAriaLabel', { count: retryableItems.length })}>
              {t('bulkResultSummary.retryFailedButton', { count: retryableItems.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
