/**
 * Floating action bar shown when one or more actionables are selected. Offers
 * bulk Dismiss and bulk Generate, plus a Clear-selection escape. Presentational
 * only — the page owns the selection set and performs the IPC work.
 */

import { useTranslation } from 'react-i18next'
import { Sparkles, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface BulkActionBarProps {
  count: number
  onDismiss: () => void
  onGenerate: () => void
  onClear: () => void
  busy?: boolean
}

export function BulkActionBar({ count, onDismiss, onGenerate, onClear, busy = false }: BulkActionBarProps) {
  const { t } = useTranslation('projects')
  if (count <= 0) return null
  return (
    <div
      role="region"
      aria-label={t('bulkActionBar.regionAriaLabel')}
      className="animate-rise-in fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 bg-card border rounded-xl shadow-lg"
    >
      <span className="text-sm font-medium whitespace-nowrap">
        {t('bulkActionBar.selectedCountLabel', { count })}
      </span>
      <div className="h-5 w-px bg-border" aria-hidden />
      <Button size="sm" className="gap-2" onClick={onGenerate} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {t('bulkActionBar.generateButton')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="gap-2 text-muted-foreground hover:text-destructive"
        onClick={onDismiss}
        disabled={busy}
      >
        <X className="h-4 w-4" />
        {t('bulkActionBar.dismissButton')}
      </Button>
      <div className="h-5 w-px bg-border" aria-hidden />
      <Button size="sm" variant="ghost" onClick={onClear} disabled={busy} aria-label={t('bulkActionBar.clearSelectionAriaLabel')}>
        {t('bulkActionBar.clearButton')}
      </Button>
    </div>
  )
}
