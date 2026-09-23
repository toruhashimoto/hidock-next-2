import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Wrench, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAppStore } from '@/store/useAppStore'

interface CleanupResult {
  deletedFiles: string[]
  keptFiles: string[]
  clearedDbRecords: number
}

interface IntegrityIssue {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  filePath?: string
  filename?: string
  recordingId?: string
  suggestedAction: string
  autoRepairable: boolean
  details?: Record<string, unknown>
}

interface IntegrityReport {
  scanStarted: string
  scanCompleted: string
  totalIssues: number
  issuesByType: Record<string, number>
  issuesBySeverity: Record<string, number>
  issues: IntegrityIssue[]
  autoRepairableCount: number
}

interface RepairResult {
  issueId: string
  success: boolean
  action: string
  error?: string
}

interface PurgeResult {
  totalRecords: number
  deleted: number
  kept: number
  deletedFiles: string[]
}

export function HealthCheck() {
  const { t } = useTranslation()
  const invalidateRecordings = useAppStore((state) => state.invalidateUnifiedRecordings)
  const [scanning, setScanning] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [purging, setPurging] = useState(false)
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [repairResults, setRepairResults] = useState<RepairResult[]>([])
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null)
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runScan = async () => {
    setScanning(true)
    setError(null)
    setRepairResults([])
    try {
      const result = await window.electronAPI.integrity.runScan()
      setReport(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings:healthCheck.scanFailedFallback'))
    } finally {
      setScanning(false)
    }
  }

  const repairAll = async () => {
    if (!report) return
    setRepairing(true)
    setError(null)
    try {
      const results = await window.electronAPI.integrity.repairAll()
      setRepairResults(results)
      // Re-run scan to update the report
      const newReport = await window.electronAPI.integrity.runScan()
      setReport(newReport)
      // Invalidate recordings cache so Library reloads with fresh data
      invalidateRecordings()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings:healthCheck.repairFailedFallback'))
    } finally {
      setRepairing(false)
    }
  }

  const cleanupWronglyNamed = async () => {
    if (!confirm(t('settings:healthCheck.cleanupConfirm'))) {
      return
    }
    setCleaning(true)
    setError(null)
    setCleanupResult(null)
    try {
      const result = await window.electronAPI.integrity.cleanupWronglyNamed()
      setCleanupResult(result)
      // Invalidate recordings cache so Library reloads with fresh data
      invalidateRecordings()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings:healthCheck.cleanupFailedFallback'))
    } finally {
      setCleaning(false)
    }
  }

  const purgeMissingFiles = async () => {
    if (!confirm(t('settings:healthCheck.purgeConfirm'))) {
      return
    }
    setPurging(true)
    setError(null)
    setPurgeResult(null)
    try {
      const result = await window.electronAPI.integrity.purgeMissingFiles()
      setPurgeResult(result)
      // Invalidate recordings cache so Library reloads with fresh data
      invalidateRecordings()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings:healthCheck.purgeFailedFallback'))
    } finally {
      setPurging(false)
    }
  }

  const getSeverityIcon = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'high':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'low':
        return <AlertCircle className="h-4 w-4 text-blue-500" />
    }
  }

  const getTypeLabel = (type: string) => {
    const keys: Record<string, string> = {
      orphaned_download: 'orphanedDownload',
      missing_file: 'missingFile',
      orphaned_file: 'orphanedFile',
      date_mismatch: 'dateMismatch',
      size_mismatch: 'sizeMismatch',
      incomplete_download: 'incompleteDownload'
    }
    const key = keys[type]
    return key ? t(`settings:healthCheck.typeLabel.${key}`) : type
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings:healthCheck.title')}</CardTitle>
        <CardDescription>
          {t('settings:healthCheck.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button onClick={runScan} disabled={scanning || repairing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? t('settings:healthCheck.scanningButton') : t('settings:healthCheck.runButton')}
          </Button>

          {report && report.autoRepairableCount > 0 && (
            <Button variant="outline" onClick={repairAll} disabled={scanning || repairing}>
              <Wrench className={`h-4 w-4 mr-2 ${repairing ? 'animate-spin' : ''}`} />
              {repairing ? t('settings:healthCheck.repairingButton') : t('settings:healthCheck.repairAllButton', { count: report.autoRepairableCount })}
            </Button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Repair Results */}
        {repairResults.length > 0 && (
          <div className="p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg text-sm">
            <div className="font-medium text-green-700 dark:text-green-400 mb-1">
              {t('settings:healthCheck.repairCompleteTitle')}
            </div>
            <div className="text-green-600 dark:text-green-500">
              {t('settings:healthCheck.repairSummary', { repaired: repairResults.filter(r => r.success).length, total: repairResults.length })}
            </div>
          </div>
        )}

        {/* Cleanup Results */}
        {cleanupResult && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg text-sm">
            <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
              {t('settings:healthCheck.cleanupCompleteTitle')}
            </div>
            <div className="text-amber-600 dark:text-amber-500 space-y-1">
              <div>{t('settings:healthCheck.cleanupDeletedFiles', { count: cleanupResult.deletedFiles.length })}</div>
              <div>{t('settings:healthCheck.cleanupClearedRecords', { count: cleanupResult.clearedDbRecords })}</div>
              <div>{t('settings:healthCheck.cleanupKeptFiles', { count: cleanupResult.keptFiles.length })}</div>
            </div>
            <div className="text-xs text-amber-500 dark:text-amber-400 mt-2">
              {t('settings:healthCheck.cleanupReconnectHint')}
            </div>
          </div>
        )}

        {/* Report Summary */}
        {report && (
          <div className="space-y-3">
            {report.totalIssues === 0 ? (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-green-700 dark:text-green-400">{t('settings:healthCheck.allChecksPassed')}</span>
              </div>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <div className="text-2xl font-bold">{report.totalIssues}</div>
                    <div className="text-xs text-muted-foreground">{t('settings:healthCheck.totalIssuesLabel')}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-500">
                      {report.issuesBySeverity['high'] || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">{t('settings:healthCheck.highSeverityLabel')}</div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-500">
                      {report.autoRepairableCount}
                    </div>
                    <div className="text-xs text-muted-foreground">{t('settings:healthCheck.autoRepairableLabel')}</div>
                  </div>
                </div>

                {/* Issues by Type */}
                <div className="text-sm">
                  <div className="font-medium mb-2">{t('settings:healthCheck.issuesByTypeLabel')}</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(report.issuesByType).map(([type, count]) => (
                      <span
                        key={type}
                        className="px-2 py-1 bg-muted rounded text-xs"
                      >
                        {t('settings:healthCheck.issueTypeCount', { label: getTypeLabel(type), count })}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expand/Collapse Details */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full"
                >
                  {showDetails ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" /> {t('settings:healthCheck.hideDetails')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" /> {t('settings:healthCheck.showDetailsCount', { count: report.issues.length })}
                    </>
                  )}
                </Button>

                {/* Issue Details */}
                {showDetails && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {report.issues.map((issue) => (
                      <div
                        key={issue.id}
                        className="p-3 bg-muted/30 rounded-lg text-sm"
                      >
                        <div className="flex items-start gap-2">
                          {getSeverityIcon(issue.severity)}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{getTypeLabel(issue.type)}</div>
                            <div className="text-muted-foreground text-xs truncate">
                              {issue.description}
                            </div>
                            {issue.filename && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {t('settings:healthCheck.fileLabel', { filename: issue.filename })}
                              </div>
                            )}
                          </div>
                          {issue.autoRepairable && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 rounded">
                              {t('settings:healthCheck.autoFixBadge')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Scan Timestamp */}
            <div className="text-xs text-muted-foreground text-center">
              {t('settings:healthCheck.lastScanLabel', { datetime: new Date(report.scanCompleted).toLocaleString() })}
            </div>
          </div>
        )}

        {/* Initial State */}
        {!report && !scanning && (
          <div className="text-sm text-muted-foreground text-center py-4">
            {t('settings:healthCheck.emptyStateHint')}
          </div>
        )}

        {/* Advanced Operations Section */}
        <div className="pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex justify-between items-center"
          >
            <span className="font-medium">{t('settings:healthCheck.advancedOperations')}</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {showAdvanced && (
            <div className="mt-4 space-y-6 pl-2 border-l-2 border-muted ml-2">
              {/* Purge Result */}
              {purgeResult && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-sm">
                  <div className="font-medium text-red-700 dark:text-red-400 mb-1">
                    {t('settings:healthCheck.purgeCompleteTitle')}
                  </div>
                  <div className="text-red-600 dark:text-red-500 space-y-1">
                    <div>{t('settings:healthCheck.purgeTotalScanned', { count: purgeResult.totalRecords })}</div>
                    <div>{t('settings:healthCheck.purgeDeleted', { count: purgeResult.deleted })}</div>
                    <div>{t('settings:healthCheck.purgeKept', { count: purgeResult.kept })}</div>
                  </div>
                </div>
              )}

              {/* Purge Section - Nuclear Option */}
              <div>
                <div className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">{t('settings:healthCheck.purgeOrphanedHeading')}</div>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('settings:healthCheck.purgeOrphanedParagraph')}
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={purgeMissingFiles}
                  disabled={purging || cleaning || scanning || repairing}
                >
                  <Trash2 className={`h-4 w-4 mr-2 ${purging ? 'animate-pulse' : ''}`} />
                  {purging ? t('settings:healthCheck.purgingButton') : t('settings:healthCheck.purgeMissingFilesButton')}
                </Button>
              </div>

              {/* Cleanup Results */}
              {cleanupResult && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-lg text-sm">
                  <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                    {t('settings:healthCheck.cleanupCompleteTitle')}
                  </div>
                  <div className="text-amber-600 dark:text-amber-500 space-y-1">
                    <div>{t('settings:healthCheck.cleanupDeletedFiles', { count: cleanupResult.deletedFiles.length })}</div>
                    <div>{t('settings:healthCheck.cleanupClearedRecords', { count: cleanupResult.clearedDbRecords })}</div>
                    <div>{t('settings:healthCheck.cleanupKeptFiles', { count: cleanupResult.keptFiles.length })}</div>
                  </div>
                  <div className="text-xs text-amber-500 dark:text-amber-400 mt-2">
                    {t('settings:healthCheck.cleanupReconnectHint')}
                  </div>
                </div>
              )}

              {/* Cleanup Section */}
              <div>
                <div className="text-sm font-medium mb-2">{t('settings:healthCheck.resetDownloadedHeading')}</div>
                <p className="text-xs text-muted-foreground mb-3">
                  {t('settings:healthCheck.resetDownloadedParagraph')}
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={cleanupWronglyNamed}
                  disabled={cleaning || scanning || repairing || purging}
                >
                  <Trash2 className={`h-4 w-4 mr-2 ${cleaning ? 'animate-pulse' : ''}`} />
                  {cleaning ? t('settings:healthCheck.cleaningButton') : t('settings:healthCheck.deleteWronglyNamedButton')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
