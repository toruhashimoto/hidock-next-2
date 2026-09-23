import { X, Download, Wand2, Trash2, CheckSquare, Square, EyeOff, Skull } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface BulkActionsBarProps {
  selectedCount: number
  totalCount: number
  deviceConnected: boolean
  isProcessing: boolean
  progress?: { current: number; total: number }
  disabledActions?: {
    download?: boolean
    process?: boolean
    delete?: boolean
  }
  showDownload?: boolean
  showProcess?: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onDownload: () => void
  onProcess: () => void
  onDelete: () => void
  /** Mark all selected recordings personal (ignore). Optional. */
  onMarkPersonal?: () => void
  /** HARD purge of every selected row (tombstones + cache + optional device). Optional. */
  onDeletePermanent?: () => void
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  deviceConnected,
  isProcessing,
  progress,
  disabledActions = {},
  showDownload = true,
  showProcess = true,
  onSelectAll,
  onDeselectAll,
  onDownload,
  onProcess,
  onDelete,
  onMarkPersonal,
  onDeletePermanent
}: BulkActionsBarProps) {
  const { t } = useTranslation('library')
  if (selectedCount === 0) return null

  const allSelected = selectedCount === totalCount && totalCount > 0

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-6 py-3',
        'bg-primary/5 border-b border-primary/20',
        'animate-in slide-in-from-top-2 duration-200'
      )}
      role="toolbar"
      aria-label={t('bulkActionsBar.toolbarAriaLabel')}
    >
      <div className="flex items-center gap-3">
        {/* Selection Toggle */}
        {showDownload && <Button
          variant="ghost"
          size="sm"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="gap-2"
          aria-label={allSelected ? t('bulkActionsBar.deselectAllAriaLabel') : t('bulkActionsBar.selectAllAriaLabel')}
        >
          {allSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {allSelected ? t('bulkActionsBar.deselectAllButton') : t('bulkActionsBar.selectAllButton')}
        </Button>}

        {/* Selection Count */}
        <span className="text-sm text-muted-foreground">
          {t('bulkActionsBar.selectionCountLabel', { selected: selectedCount, total: totalCount })}
        </span>

        {/* Progress Indicator */}
        {isProcessing && progress && (
          <div className="flex items-center gap-2 ml-4">
            <Progress value={(progress.current / progress.total) * 100} className="w-32 h-2" />
            <span className="text-xs text-muted-foreground">
              {t('bulkActionsBar.progressCounter', { current: progress.current, total: progress.total })}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Download Action */}
        {showProcess && <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={!deviceConnected || isProcessing || disabledActions.download}
          className="gap-2"
          title={!deviceConnected ? t('bulkActionsBar.deviceNotConnectedTitle') : t('bulkActionsBar.downloadFromDeviceTitle')}
        >
          <Download className="h-4 w-4" />
          {t('bulkActionsBar.downloadButton')}
        </Button>}

        {/* Process/Transcribe Action */}
        <Button
          variant="outline"
          size="sm"
          onClick={onProcess}
          disabled={isProcessing || disabledActions.process}
          className="gap-2"
          title={t('bulkActionsBar.transcribeTitle')}
        >
          <Wand2 className="h-4 w-4" />
          {isProcessing ? t('bulkActionsBar.processingButton') : t('bulkActionsBar.transcribeButton')}
        </Button>

        {/* Mark Personal Action */}
        {onMarkPersonal && (
          <Button
            variant="outline"
            size="sm"
            onClick={onMarkPersonal}
            disabled={isProcessing}
            className="gap-2"
            title={t('bulkActionsBar.markPersonalTitle')}
          >
            <EyeOff className="h-4 w-4" />
            {t('bulkActionsBar.markPersonalButton')}
          </Button>
        )}

        {/* Delete Action — SOFT: moves selected rows to Trash (restorable). */}
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          disabled={isProcessing || disabledActions.delete}
          className="gap-2"
          title={t('bulkActionsBar.moveToTrashTitle')}
        >
          <Trash2 className="h-4 w-4" />
          {t('bulkActionsBar.moveToTrashButton')}
        </Button>

        {/* Permanent delete — HARD cascade per row (tombstones + cache + optional device copy). */}
        {onDeletePermanent && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDeletePermanent}
            disabled={isProcessing || disabledActions.delete}
            className="gap-2 text-destructive hover:text-destructive border-destructive/40"
            title={t('bulkActionsBar.deletePermanentlyTitle')}
          >
            <Skull className="h-4 w-4" />
            {t('bulkActionsBar.deletePermanentlyButton')}
          </Button>
        )}

        {/* Clear Selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeselectAll}
          className="ml-2"
          aria-label={t('bulkActionsBar.clearSelectionAriaLabel')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
