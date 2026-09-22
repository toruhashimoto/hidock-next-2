/**
 * useDeviceConnection — the single source of truth for the device connect/
 * disconnect control shared by the titlebar status pill and the Device Sync page.
 *
 * Both surfaces MUST derive their status from the same store selectors and route
 * through the same connect/disconnect calls so their behavior can never drift.
 *
 * Status is derived from the app store (updated by OperationController from the
 * device service's connection/status listeners):
 *   - `connected`    → deviceState.connected is true
 *   - `connecting`   → a connect attempt is in flight (store step in-progress, or
 *                      this call site just kicked one off)
 *   - `disconnected` → otherwise
 *
 * ⛔ USB SAFETY (see CLAUDE.md): connecting is guarded by a MODULE-level in-flight
 * flag so two surfaces (titlebar + sync page) can never launch overlapping
 * connect attempts. One click = one attempt. We never auto-retry on failure.
 */

import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeviceState, useConnectionStatus } from '@/store/useAppStore'
import { getHiDockDeviceService } from '@/services/hidock-device'
import { toast } from '@/components/ui/toaster'

export type DeviceConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'failed'

/**
 * Shared across every hook instance: guarantees a single USB connect attempt is
 * in flight at a time, no matter which surface initiated it.
 */
let connectInFlight = false

export interface UseDeviceConnectionOptions {
  /**
   * Surface connect/disconnect failures as a toast. Defaults to `true` (the
   * titlebar pill has no room for an inline error). The Device Sync page passes
   * `false` because it renders its own inline error banner from the store.
   */
  toastErrors?: boolean
}

export interface UseDeviceConnection {
  status: DeviceConnectionStatus
  isConnected: boolean
  isConnecting: boolean
  isDisconnected: boolean
  /** A prior connect attempt failed (device present-but-unreachable). */
  isFailed: boolean
  /** Formatted device model when connected (e.g. "H1E"), otherwise null. */
  deviceModel: string | null
  /** Human label for the control: model name / "Connecting…" / "Connect device". */
  label: string
  /** Extra context for the failed state (e.g. the device-busy hint), else null. */
  failedHint: string | null
  /** Kick off one connect attempt. Returns whether it succeeded. Never retries. */
  connect: () => Promise<boolean>
  /** Disconnect the device. */
  disconnect: () => Promise<void>
}

export function useDeviceConnection(
  options: UseDeviceConnectionOptions = {}
): UseDeviceConnection {
  const { toastErrors = true } = options
  const { t } = useTranslation()
  const deviceState = useDeviceState()
  const connectionStatus = useConnectionStatus()

  // Bridges the gap between click and the store reflecting the attempt, so the
  // initiating surface shows "connecting" immediately.
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  const step = connectionStatus.step
  const storeConnecting = step !== 'idle' && step !== 'ready' && step !== 'error'
  const isConnected = deviceState.connected
  const isConnecting = !isConnected && (storeConnecting || pending)
  // A just-failed connect attempt (device present-but-unreachable). Superseded the
  // moment a retry starts (isConnecting) or a connect succeeds.
  const isFailed = !isConnected && !isConnecting && !!connectionStatus.connectFailed
  const isDisconnected = !isConnected && !isConnecting && !isFailed

  const status: DeviceConnectionStatus = isConnected
    ? 'connected'
    : isConnecting
      ? 'connecting'
      : isFailed
        ? 'failed'
        : 'disconnected'

  const failedHint = isFailed
    ? connectionStatus.devicePresent
      ? t('layout:deviceConnection.hintDeviceBusy')
      : t('layout:deviceConnection.hintUnreachable')
    : null

  const deviceModel = isConnected
    ? deviceState.model && deviceState.model !== 'unknown'
      ? deviceState.model.replace('hidock-', '').toUpperCase()
      : t('layout:toast.deviceConnectedFallbackModel')
    : null

  const label = isConnected
    ? deviceModel ?? t('layout:toast.deviceConnectedFallbackModel')
    : isConnecting
      ? t('layout:deviceConnection.connectingLabel')
      : isFailed
        ? t('layout:deviceConnection.connectionFailedLabel')
        : t('layout:titleBar.connectDevice')

  const connect = useCallback(async (): Promise<boolean> => {
    const service = getHiDockDeviceService()
    // USB SAFETY: never launch a second attempt while one is in flight or the
    // device is already connected.
    if (connectInFlight || service.isConnected()) return false

    connectInFlight = true
    pendingRef.current = true
    setPending(true)
    try {
      const success = await service.connect()
      if (!success && toastErrors) {
        toast({
          title: t('layout:deviceConnection.connectFailedToastTitle'),
          description: t('layout:deviceConnection.connectFailedToastDescription'),
          variant: 'error'
        })
      }
      return success
    } catch (e) {
      if (toastErrors) {
        toast({
          title: t('layout:deviceConnection.connectFailedToastTitle'),
          description: e instanceof Error ? e.message : t('common:errors.unknown'),
          variant: 'error'
        })
      }
      return false
    } finally {
      connectInFlight = false
      pendingRef.current = false
      setPending(false)
    }
  }, [toastErrors, t])

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      await getHiDockDeviceService().disconnect()
    } catch (e) {
      if (toastErrors) {
        toast({
          title: t('layout:deviceConnection.disconnectFailedToastTitle'),
          description: e instanceof Error ? e.message : t('common:errors.unknown'),
          variant: 'error'
        })
      }
    }
  }, [toastErrors, t])

  return {
    status,
    isConnected,
    isConnecting,
    isDisconnected,
    isFailed,
    deviceModel,
    label,
    failedHint,
    connect,
    disconnect
  }
}
