/**
 * Library copy for recordings whose file on disk is shorter than their
 * transcript. The counts come from the main process
 * (download-service:truncated-recovery-plan); this only turns them into words.
 *
 * i18n note: Library.tsx reads both exports as plain strings, so neither can
 * call the `useTranslation()` hook. They resolve through the shared `i18n`
 * singleton at CALL time instead (the approach deletionCopy.ts takes) — never
 * at module scope, which would freeze the copy in whichever language happened
 * to be active on import.
 */

import i18n from '@/i18n'

export interface TruncatedRecoveryCounts {
  truncated: number
  recoverable: number
  deviceNotLarger: number
  notOnDevice: number
  heldBack: number
  deviceListKnown?: boolean
}

/**
 * Toast body: what was found, what the device can give back, what is gone.
 *
 * Every line is a whole sentence of its own, chosen by a count or a flag —
 * nothing is stitched together from fragments, so a locale is free to order
 * each sentence however it reads best. The hand-rolled English plurals this
 * used to carry (`file`/`files`, `hold`/`holds`, `is`/`are`, `match`/`matches`)
 * are i18next `_one`/`_other` keys now, which is also why a count that only
 * ever reads as one form passes its own named placeholder rather than `count`.
 */
export function describeTruncatedRecovery(counts: TruncatedRecoveryCounts | null, truncated: number): string {
  const lines = [i18n.t('library:truncatedRecovery.foundMessage', { count: truncated })]
  if (counts) {
    if (counts.recoverable > 0) {
      lines.push(i18n.t('library:truncatedRecovery.recoverableMessage', { recoverable: counts.recoverable }))
    }
    if (counts.deviceNotLarger > 0) {
      lines.push(i18n.t('library:truncatedRecovery.deviceNotLargerMessage', { count: counts.deviceNotLarger }))
    }
    if (counts.deviceListKnown === false) {
      lines.push(i18n.t('library:truncatedRecovery.deviceListUnknownMessage'))
    } else if (counts.notOnDevice > 0) {
      lines.push(i18n.t('library:truncatedRecovery.notOnDeviceMessage', { count: counts.notOnDevice }))
    }
    if (counts.heldBack > 0) {
      lines.push(i18n.t('library:truncatedRecovery.heldBackMessage', { heldBack: counts.heldBack }))
    }
  }
  lines.push(i18n.t('library:truncatedRecovery.unchangedMessage'))
  return lines.join(' ')
}

/** Label for the toast action that queues the recovery. */
export function recoverActionLabel(recoverable: number): string {
  return i18n.t('library:truncatedRecovery.recoverActionLabel', { recoverable })
}
