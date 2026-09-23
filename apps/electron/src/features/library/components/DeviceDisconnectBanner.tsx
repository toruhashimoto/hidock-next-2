import { AlertCircle, RefreshCw, Usb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface DeviceDisconnectBannerProps {
  show: boolean
  isReconnecting: boolean
  onNavigateToDevice: () => void
  onRetry?: () => void
}

export function DeviceDisconnectBanner({
  show,
  isReconnecting,
  onNavigateToDevice,
  onRetry
}: DeviceDisconnectBannerProps) {
  const { t } = useTranslation('library')
  if (!show) return null

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-800">
      <div className="flex items-center gap-3">
        {isReconnecting ? (
          <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400 animate-spin" />
        ) : (
          <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        )}
        <div>
          <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
            {isReconnecting ? t('deviceDisconnectBanner.reconnectingTitle') : t('deviceDisconnectBanner.disconnectedTitle')}
          </p>
          <p className="text-xs text-orange-600 dark:text-orange-400">
            {isReconnecting
              ? t('deviceDisconnectBanner.reconnectingMessage')
              : t('deviceDisconnectBanner.disconnectedMessage')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && !isReconnecting && (
          <Button variant="outline" size="sm" onClick={onRetry} className="border-orange-300 dark:border-orange-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('deviceDisconnectBanner.retryButton')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateToDevice}
          className="border-orange-300 dark:border-orange-700"
        >
          <Usb className="h-4 w-4 mr-2" />
          {t('deviceDisconnectBanner.goToDeviceButton')}
        </Button>
      </div>
    </div>
  )
}
