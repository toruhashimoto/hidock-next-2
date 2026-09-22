import { Mic, Plus, SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface EmptyStateProps {
  hasRecordings: boolean
  onNavigateToDevice: () => void
  onAddRecording: () => void
  selectedOutsideFilters?: boolean
  onRevealSelected?: () => void
}

export function EmptyState({
  hasRecordings,
  onNavigateToDevice,
  onAddRecording,
  selectedOutsideFilters = false,
  onRevealSelected
}: EmptyStateProps) {
  const { t } = useTranslation('library')
  return (
    <Card className="animate-rise-in border-border/70 shadow-sm">
      <CardContent className="flex flex-col items-center py-16 text-center">
        {/* Soft haloed icon — carries the same elevation language as the rest of the app. */}
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          {hasRecordings ? <SearchX className="h-8 w-8" aria-hidden="true" /> : <Mic className="h-8 w-8" aria-hidden="true" />}
        </div>
        {!hasRecordings ? (
          <>
            <h3 className="text-lg font-semibold mb-2 text-foreground">{t('emptyState.noRecordingsTitle')}</h3>
            <p className="max-w-sm text-sm text-muted-foreground mb-5 leading-relaxed">
              {t('emptyState.noRecordingsMessage')}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={onNavigateToDevice}>{t('emptyState.goToDeviceButton')}</Button>
              <Button variant="outline" onClick={onAddRecording}>
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('emptyState.importFileButton')}
              </Button>
            </div>
          </>
        ) : selectedOutsideFilters ? (
          <>
            <h3 className="mb-2 text-lg font-semibold text-foreground">{t('emptyState.selectedOutsideFiltersTitle')}</h3>
            <p className="mb-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t('emptyState.selectedOutsideFiltersMessage')}
            </p>
            {onRevealSelected && (
              <Button variant="outline" onClick={onRevealSelected}>{t('emptyState.showSourceButton')}</Button>
            )}
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-2 text-foreground">{t('emptyState.noMatchingCapturesTitle')}</h3>
            <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
              {t('emptyState.noMatchingCapturesMessage')}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
