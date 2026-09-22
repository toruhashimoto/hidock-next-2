/**
 * TranscriptUpgradeButton
 *
 * Library toolbar maintenance action for old (pre-speaker-turns) transcripts.
 * Opens a dialog that scans the corpus and reports how many flat transcripts
 * would be text-reformatted (cheap, automatic) vs. flagged for a costly audio
 * re-transcription (the user's call). From here the user can kick the
 * lowest-priority reformat pass, or select the flagged recordings so the
 * existing bulk "Process All" action can re-transcribe them.
 *
 * Self-contained: manages its own state and IPC calls. The transcriptUpgrade
 * IPC namespace is accessed defensively so the button degrades gracefully until
 * the preload bridge exposes it (see preload wiring note in the PR).
 */

import { useCallback, useState } from 'react'
import { Sparkles, RefreshCw, Wand2, ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toaster'
import { useLibraryStore } from '@/store/useLibraryStore'

interface UpgradeScan {
  totalTranscripts: number
  legacyTotal: number
  toReformat: number
  recommendedRetranscription: number
  alreadyReformatted: number
  threshold: number
}

type IpcResult<T> = { success: true; data: T } | { success: false; error?: { message?: string } }

interface TranscriptUpgradeAPI {
  scan: (req?: { threshold?: number }) => Promise<IpcResult<UpgradeScan>>
  run: (req?: { threshold?: number }) => Promise<IpcResult<UpgradeScan>>
  getRecommended: () => Promise<IpcResult<string[]>>
}

/** Defensive accessor: null until the preload bridge exposes the namespace. */
function getUpgradeApi(): TranscriptUpgradeAPI | null {
  const api = (window as unknown as { electronAPI?: { transcriptUpgrade?: TranscriptUpgradeAPI } }).electronAPI
  return api?.transcriptUpgrade ?? null
}

export function TranscriptUpgradeButton({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [scan, setScan] = useState<UpgradeScan | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const refreshScan = useCallback(async () => {
    const api = getUpgradeApi()
    if (!api) {
      setUnavailable(true)
      return
    }
    setLoading(true)
    try {
      const res = await api.scan()
      if (res.success) {
        setScan(res.data)
        setUnavailable(false)
      } else {
        toast.error(t('library:transcriptUpgradeButton.scanFailedTitle'), res.error?.message)
      }
    } catch (e) {
      toast.error(t('library:transcriptUpgradeButton.scanFailedTitle'), e instanceof Error ? e.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [])

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (next) void refreshScan()
    },
    [refreshScan]
  )

  const onReformat = useCallback(async () => {
    const api = getUpgradeApi()
    if (!api) return
    setRunning(true)
    try {
      const res = await api.run()
      if (res.success) {
        setScan(res.data)
        toast.success(
          t('library:transcriptUpgradeButton.upgradeStartedTitle'),
          t('library:transcriptUpgradeButton.upgradeStartedMessage', { count: res.data.toReformat })
        )
      } else {
        toast.error(t('library:transcriptUpgradeButton.upgradeFailedTitle'), res.error?.message)
      }
    } catch (e) {
      toast.error(t('library:transcriptUpgradeButton.upgradeFailedTitle'), e instanceof Error ? e.message : undefined)
    } finally {
      setRunning(false)
    }
  }, [])

  const onSelectFlagged = useCallback(async () => {
    const api = getUpgradeApi()
    if (!api) return
    try {
      const res = await api.getRecommended()
      if (!res.success) {
        toast.error(t('library:transcriptUpgradeButton.loadFlaggedFailedTitle'), res.error?.message)
        return
      }
      const ids = res.data
      if (ids.length === 0) {
        toast.info(
          t('library:transcriptUpgradeButton.nothingToSelectTitle'),
          t('library:transcriptUpgradeButton.nothingToSelectMessage')
        )
        return
      }
      useLibraryStore.getState().selectAll(ids)
      setOpen(false)
      toast.success(
        t('library:transcriptUpgradeButton.selectedFlaggedTitle'),
        t('library:transcriptUpgradeButton.selectedFlaggedMessage', { count: ids.length })
      )
    } catch (e) {
      toast.error(t('library:transcriptUpgradeButton.loadFlaggedFailedTitle'), e instanceof Error ? e.message : undefined)
    }
  }, [])

  return (
    <>
      <Button
        variant={compact ? 'ghost' : 'outline'}
        size={compact ? 'icon-sm' : 'sm'}
        onClick={() => onOpenChange(true)}
        title={t('library:transcriptUpgradeButton.triggerTitle')}
        aria-label={compact ? t('library:transcriptUpgradeButton.triggerAriaLabel') : undefined}
      >
        <Sparkles className={compact ? 'h-4 w-4' : 'h-4 w-4 mr-2'} aria-hidden="true" />
        {!compact && t('library:transcriptUpgradeButton.triggerLabel')}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('library:transcriptUpgradeButton.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('library:transcriptUpgradeButton.description')}</DialogDescription>
          </DialogHeader>

          {unavailable ? (
            <p className="text-sm text-muted-foreground py-2">{t('library:transcriptUpgradeButton.unavailable')}</p>
          ) : loading && !scan ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t('library:transcriptUpgradeButton.scanning')}
            </div>
          ) : scan ? (
            <div className="grid grid-cols-2 gap-3 py-2">
              <Stat label={t('library:transcriptUpgradeButton.statFlatTranscripts')} value={scan.legacyTotal} />
              <Stat label={t('library:transcriptUpgradeButton.statAlreadyReformatted')} value={scan.alreadyReformatted} />
              <Stat label={t('library:transcriptUpgradeButton.statToReformat')} value={scan.toReformat} accent="primary" />
              <Stat
                label={t('library:transcriptUpgradeButton.statFlagged')}
                value={scan.recommendedRetranscription}
                accent="orange"
              />
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectFlagged}
              disabled={unavailable || !scan || scan.recommendedRetranscription === 0}
              title={t('library:transcriptUpgradeButton.selectFlaggedTitle')}
            >
              <ListChecks className="h-4 w-4 mr-2" />
              {t('library:transcriptUpgradeButton.selectFlaggedButton')}
            </Button>
            <Button
              size="sm"
              onClick={onReformat}
              disabled={unavailable || running || !scan || scan.toReformat === 0}
            >
              {running ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('library:transcriptUpgradeButton.starting')}
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  {t('library:transcriptUpgradeButton.reformatNowButton', { count: scan?.toReformat ?? 0 })}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'primary' | 'orange' }) {
  const color =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'orange'
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-foreground'
  return (
    <div className="rounded-md border p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
