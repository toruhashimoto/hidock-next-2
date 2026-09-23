import { useTranslation } from 'react-i18next'
import type { UnifiedRecording } from '@/types/unified-recording'
import { formatBytes, formatDuration } from '@/lib/utils'

interface MultiSelectionSummaryProps {
  recordings: UnifiedRecording[]
  mode: 'library' | 'trash'
}

const PREVIEW_LIMIT = 20

export function MultiSelectionSummary({ recordings, mode }: MultiSelectionSummaryProps) {
  const { t } = useTranslation('library')
  const totalBytes = recordings.reduce((total, recording) => total + Math.max(0, recording.size || 0), 0)
  const totalDuration = recordings.reduce((total, recording) => total + Math.max(0, recording.duration || 0), 0)
  const remainingCount = Math.max(0, recordings.length - PREVIEW_LIMIT)

  return (
    <section
      aria-labelledby="multi-selection-heading"
      className="h-full space-y-5 overflow-y-auto p-6"
      data-testid="multi-selection-summary"
    >
      <div>
        <h2 id="multi-selection-heading" className="text-xl font-semibold">
          {t('multiSelectionSummary.sourcesSelectedHeading', { count: recordings.length })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('multiSelectionSummary.totalsSummary', {
            count: recordings.length,
            size: formatBytes(totalBytes),
            duration: formatDuration(totalDuration)
          })}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">{t('multiSelectionSummary.availableActionsHeading')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'library'
            ? t('multiSelectionSummary.bulkActionsHintLibrary')
            : t('multiSelectionSummary.bulkActionsHintTrash')}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium">{t('multiSelectionSummary.selectedSourcesHeading')}</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {recordings.slice(0, PREVIEW_LIMIT).map((recording) => (
            <li key={recording.id} className="truncate" title={recording.title || recording.filename}>
              {recording.title || recording.filename}
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="text-muted-foreground">{t('multiSelectionSummary.moreItemsLabel', { count: remainingCount })}</li>
          )}
        </ul>
      </div>
    </section>
  )
}
