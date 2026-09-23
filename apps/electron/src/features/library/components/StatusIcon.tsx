import { Cloud, HardDrive, Check, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UnifiedRecording } from '@/types/unified-recording'

interface StatusIconProps {
  recording: UnifiedRecording
  showError?: boolean
  showLabel?: boolean
}

export function StatusIcon({ recording, showError = false, showLabel = false }: StatusIconProps) {
  const { t } = useTranslation('library')

  // Show error state if applicable
  if (showError) {
    return (
      <div
        className="flex items-center gap-1 text-destructive"
        role="img"
        aria-label={t('statusIcon.processingErrorLabel')}
        title={t('statusIcon.processingErrorLabel')}
      >
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {showLabel && <span className="text-xs hidden sm:inline">{t('statusIcon.errorLabel')}</span>}
      </div>
    )
  }

  switch (recording.location) {
    case 'device-only':
      return (
        <div
          className="flex items-center gap-1 text-orange-600 dark:text-orange-400"
          role="img"
          aria-label={t('statusIcon.onDeviceOnlyLabel')}
          title={t('statusIcon.onDeviceOnlyLabel')}
        >
          <Cloud className="h-4 w-4" aria-hidden="true" />
          {showLabel && <span className="text-xs hidden sm:inline">{t('statusIcon.onDeviceLabel')}</span>}
        </div>
      )
    case 'local-only':
      return (
        <div
          className="flex items-center gap-1 text-blue-600 dark:text-blue-400"
          role="img"
          aria-label={t('statusIcon.downloadedLabel')}
          title={t('statusIcon.downloadedLabel')}
        >
          <HardDrive className="h-4 w-4" aria-hidden="true" />
          {showLabel && <span className="text-xs hidden sm:inline">{t('statusIcon.downloadedLabel')}</span>}
        </div>
      )
    case 'both':
      return (
        <div
          className="flex items-center gap-1 text-green-600 dark:text-green-400"
          role="img"
          aria-label={t('statusIcon.syncedLabel')}
          title={t('statusIcon.syncedLabel')}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {showLabel && <span className="text-xs hidden sm:inline">{t('statusIcon.syncedLabel')}</span>}
        </div>
      )
    default:
      return null
  }
}
