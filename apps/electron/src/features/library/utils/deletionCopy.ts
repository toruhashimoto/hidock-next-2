/**
 * Deletion-related copy (spec-005/F17 T5 §D2).
 *
 * Single source of truth for every delete/restore surface (SourceRow,
 * SourceReader, Library's confirm dialogs, DeletePermanentDialog,
 * Settings.tsx's legacy-graph disclosure) so the exact strings can never
 * drift between them. "Delete everywhere" and "Delete from computer" are
 * retired — every destructive item states its scope in the menu itself via
 * a muted second line (AC#1).
 *
 * i18n note (Task 11c; reactivity fixed in Task 11d — see below): every
 * export here is a plain string constant or a function returning a plain
 * string — never a React component — so none of them can call the
 * `useTranslation()` hook. They resolve copy via the shared `i18n` singleton
 * (`i18n.t(...)`) instead (task brief "approach 2"). This module is also
 * consumed by several already-committed Part A/B files (SourceRow.tsx,
 * SourceReader.tsx, SourceCard.tsx, Library.tsx, DeletePermanentDialog.tsx,
 * and Settings.tsx — which imports LEGACY_GRAPH_DISCLOSURE, see around line
 * 1332) that import these names directly and read the TITLE, LABEL and
 * SCOPE constants as plain values at render time — their call sites cannot
 * be changed here, so the exported shapes (plain `string`, not functions)
 * are preserved exactly.
 *
 * Task 11d fix — live on a language switch: the module-scope constants
 * below are `let`, not `const`. Task 11c originally resolved each of them
 * via `i18n.t()` exactly once, at module evaluation time, which froze them
 * for the life of the process — switching language at runtime in Settings
 * (whose own hint says "Changes apply immediately") left these particular
 * strings in the old language until the app restarted, while everything
 * else on screen switched. `loadDeletionCopy()` (bottom of this file)
 * re-resolves every one of them from the CURRENT language; it is called
 * once immediately (the initial value) and subscribed to i18n's
 * `languageChanged` event (the live refresh), so the key list is written
 * exactly once. This needs zero changes to any consumer: ES module named
 * imports are *live bindings*, so reassigning the binding here is visible
 * to every `import { LABEL_X } from './deletionCopy'` on its next read, and
 * all six consumer files above already call `useTranslation()` for their
 * own strings, so they already re-render on a language switch — that
 * re-render is what reads the refreshed binding. `ja/library.json` is still
 * `{}` at this stage of the project, so the fix has no observable effect
 * yet (Task 14 fills it in).
 */

import i18n from '@/i18n'

// Menu item labels. (Assigned by loadDeletionCopy() at the bottom of this
// file — see the file-level i18n note.)
export let LABEL_DELETE_FROM_DEVICE: string
export let LABEL_MOVE_TO_TRASH: string
export let LABEL_DELETE_PERMANENTLY: string
export let LABEL_RESTORE: string

// Muted second-line scope text shown under each destructive/restorative item.
export let SCOPE_DEVICE_DELETE: string
export let SCOPE_DEVICE_DELETE_SYNCED: string
export let SCOPE_DEVICE_NOT_CONNECTED: string
export let SCOPE_TRASH: string
// RE3-6 (round-3) — "all derived data" was absolute/false: legacy graph
// contributions from recordings analyzed by an earlier version can't be removed
// per-recording (see LEGACY_GRAPH_DISCLOSURE). This menu/aria scope text (used
// in SourceRow + SourceReader, where the full caveat doesn't fit) is scoped to
// "attributable" derived data so it's honest at every visible+accessible
// surface; the dialog still carries the full disclosure.
export let SCOPE_PERMANENT: string
export let SCOPE_RESTORE: string

/** Load-bearing aria-label join: folds the muted second line into the item's accessible name. */
export function ariaLabelWithScope(label: string, scope: string): string {
  return i18n.t('library:deletionCopy.ariaLabelWithScope', { label, scope })
}

// Confirm-dialog copy. Permanent delete uses the dedicated DeletePermanentDialog (§D6), not this.
export function softDeleteConfirmDescription(filename: string): string {
  return i18n.t('library:deletionCopy.softDeleteConfirmDescription', { filename })
}

export function deviceDeleteConfirmDescription(filename: string): string {
  return i18n.t('library:deletionCopy.deviceDeleteConfirmDescription', { filename })
}

// Trash-mode banner (§D1 step 8).
export let TRASH_MODE_BANNER: string

/**
 * RE-3 (Codex adversarial re-review round 2, orchestrator ruling — ONE honest
 * disclosure, shared across EVERY surface so the wording can't drift).
 *
 * Recordings analyzed by THIS version carry per-recording graph provenance, so
 * trashing excludes them and a permanent delete removes their attributed graph
 * facts. Recordings analyzed by an EARLIER version were woven into the
 * knowledge graph WITHOUT that provenance, so their contribution can't be
 * retracted per recording — it persists in Context Graph views AND Assistant
 * answers until a future full graph rebuild. The previous ARF-2 caveat
 * ("...until permanently deleted") was INACCURATE — permanent delete cannot
 * remove those legacy facts — and is replaced by this.
 */
export let LEGACY_GRAPH_DISCLOSURE: string

// spec-005/F17 T5 — success/partial-summary toast TITLES for the
// menu-triggered actions elsewhere in Library.tsx (soft delete, device-only
// delete, restore, bulk delete). Bodies stay inline at each call site
// (single-use, interpolating the filename/counts directly) — only the
// titles are shared copy. Phase-3 integration-review S1: these used to be
// literals that bypassed this module despite its single-source claim.
export let SUCCESS_MOVED_TO_TRASH_TITLE: string
export let SUCCESS_REMOVED_FROM_DEVICE_TITLE: string
export let SUCCESS_RESTORED_TITLE: string
export let PARTIAL_DELETE_TITLE: string

// =============================================================================
// spec-006/F17 T6 — permanent-delete OUTCOME copy (D2/D3/D5/AR3-2/AR3-3c/AR3-6a).
// The dialog's own body copy (impact sentence, graph-unknown warning) stays in
// DeletePermanentDialog.tsx per T5's §D6 ownership; this section covers the
// retry-safety line (shared with the dialog) and every completion/failure
// toast the execute path (Library.tsx's executeDeletePermanent) can show.
// =============================================================================

/** D2 — shown in DeletePermanentDialog regardless of whether the graph
 *  estimate is known: documents the AR3-1 fail-closed guarantee in plain
 *  language, so a refusal never reads as a mysterious dead end. */
export let GRAPH_CLEANUP_RETRY_SAFETY_LINE: string

// --- Failure (nothing deleted) ---------------------------------------------

export let FAILURE_NOTHING_DELETED_TITLE: string

/** AR3-1/AR3-3(a) — the local purge itself refused (fail-closed) because the
 *  graph cleanup seam is unavailable. Pairs with the AR3-3(c) escape-hatch
 *  toast action. */
export function graphCleanupFailedBody(filename: string): string {
  return i18n.t('library:deletionCopy.graphCleanupFailedBody', { filename })
}

export function genericPermanentDeleteFailedBody(filename: string): string {
  return i18n.t('library:deletionCopy.genericPermanentDeleteFailedBody', { filename })
}

/** AR3-3(c) — the failure toast's explicit second-action label. */
export let LABEL_DELETE_ANYWAY_SKIP_GRAPH: string

// --- Partial (local purge succeeded, something else did not) ---------------

/** D3 — device copy remains after a confirmed local purge (device delete
 *  failed OR AR3-6(a)'s TOCTOU re-check found the device no longer usable at
 *  execute time). Never the plain success toast in this case. */
export let DEVICE_COPY_REMAINS_TITLE: string

export function deviceCopyRemainsBody(filename: string): string {
  return i18n.t('library:deletionCopy.deviceCopyRemainsBody', { filename })
}

/** AR3-2 — one or more post-commit file-cleanup targets could not be
 *  confirmed removed; a bounded retry sweep will keep trying. Success is
 *  intentionally NOT claimed here. */
export let FILES_PENDING_TITLE: string

/** Resolves one cleanup "kind" (audio/wiki/artifact/vector, or a future
 *  unrecognized kind) to its display noun phrase. i18n.t() is called fresh
 *  per invocation (this is a function, not a module-scope constant), so it
 *  is reactive to a language switch even though the *_TITLE constants above
 *  are not — see the file-level note. */
function cleanupKindLabel(kind: string): string {
  switch (kind) {
    case 'audio':
      return i18n.t('library:deletionCopy.cleanupKindAudio')
    case 'wiki':
      return i18n.t('library:deletionCopy.cleanupKindWiki')
    case 'artifact':
      return i18n.t('library:deletionCopy.cleanupKindArtifact')
    case 'vector':
      return i18n.t('library:deletionCopy.cleanupKindVector')
    default:
      return i18n.t('library:deletionCopy.cleanupKindFallback', { kind })
  }
}

/** Serial "A, B and C" join (no Oxford comma — matches this file's original
 *  join shape verbatim). The comma glue is structural (rule 5: purely
 *  structural array-join glue is not translatable, matching the precedent
 *  Task 11a/11b established for Library.tsx/SourceReader.tsx's own array
 *  joins); the " and " conjunction is an actual English word, so it is
 *  extracted as its own key rather than left hardcoded — a bare "and" left
 *  in place would otherwise render as English inside an otherwise-Japanese
 *  sentence in Tasks 14-15. */
function joinParts(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(i18n.t('library:deletionCopy.listSeparator'))}${i18n.t('library:deletionCopy.listConjunction')}${parts[parts.length - 1]}`
}

export function filesPendingBody(filename: string, kinds: string[]): string {
  const unique = Array.from(new Set(kinds)).map((k) => cleanupKindLabel(k))
  const list = joinParts(unique) || i18n.t('library:deletionCopy.cleanupKindListFallback')
  return i18n.t('library:deletionCopy.filesPendingBody', { filename, list })
}

/** ADV49-1 (round 51, DELETION HONESTY) — the hard purge removed the
 *  authoritative rows but could NOT durably journal the failed file-cleanup
 *  targets (the ledger write itself failed), so they will NOT be auto-retried.
 *  This body deliberately does NOT promise an automatic retry — it tells the
 *  owner the file must be removed manually. */
export let FILES_UNRECOVERABLE_TITLE: string

export function filesUnrecoverableBody(filename: string, kinds: string[]): string {
  const unique = Array.from(new Set(kinds)).map((k) => cleanupKindLabel(k))
  const list = joinParts(unique) || i18n.t('library:deletionCopy.cleanupKindListFallback')
  return i18n.t('library:deletionCopy.filesUnrecoverableBody', { filename, list })
}

/** CX-T6-5 (fix round 2) — the device copy WAS removed and the local purge
 *  succeeded, but the view-bookkeeping reconciliation (markNotOnDevice: row
 *  flip + device-cache entry removal) failed — so the list may keep showing
 *  the file until the next authoritative device scan corrects it. Appended
 *  as a small note to the (warning-variant) completion toast; never claims
 *  the view is already consistent. */
export let VIEW_MAY_BE_STALE_NOTE: string

/** CX-T6-3 (fix round) — BOTH partial outcomes at once: the device copy
 *  wasn't removed AND local file cleanup is still pending. One toast that
 *  enumerates both; never a body that claims full local removal while the
 *  pending-cleanup ledger is non-empty. */
export let COMBINED_PARTIAL_TITLE: string

export function combinedPartialBody(filename: string, kinds: string[]): string {
  const unique = Array.from(new Set(kinds)).map((k) => cleanupKindLabel(k))
  const list = joinParts(unique) || i18n.t('library:deletionCopy.cleanupKindListFallback')
  return i18n.t('library:deletionCopy.combinedPartialBody', { filename, list })
}

// --- Success (D5 — actual counts, not the dialog's estimate) ---------------

export interface ActualRemovedCounts {
  transcripts?: number
  actionItems?: number
  embeddings?: number
  edgesRemoved?: number
}

/** D5 — the completion toast reports ACTUAL counts (unlike the dialog, which
 *  shows an estimate). Appends "and the device copy" only when the device
 *  branch also confirmed removal. */
export function actualRemovalSummary(removed: ActualRemovedCounts | undefined, alsoDeviceRemoved: boolean): string {
  const parts: string[] = []
  if (removed?.transcripts) parts.push(i18n.t('library:deletionCopy.transcriptCount', { count: removed.transcripts }))
  if (removed?.actionItems) parts.push(i18n.t('library:deletionCopy.actionItemCount', { count: removed.actionItems }))
  if (removed?.embeddings) parts.push(i18n.t('library:deletionCopy.embeddingCount', { count: removed.embeddings }))
  if (removed?.edgesRemoved) parts.push(i18n.t('library:deletionCopy.graphLinkCount', { count: removed.edgesRemoved }))
  const removedText = joinParts(parts) || i18n.t('library:deletionCopy.removedDataFallback')
  const deviceSuffix = alsoDeviceRemoved ? i18n.t('library:deletionCopy.deviceCopySuffix') : ''
  return i18n.t('library:deletionCopy.removedSummary', { text: `${removedText}${deviceSuffix}` })
}

export let SUCCESS_DELETED_PERMANENTLY_TITLE: string

/** ARF-4 — the skipGraphCleanup escape hatch was used, so the knowledge-graph
 *  residue is DEFERRED to an automatic retry sweep rather than removed now.
 *  This must NEVER surface as the plain "Deleted permanently" success toast —
 *  the plain success claim is honest only when no cleanup remains pending. */
export let GRAPH_CLEANUP_DEFERRED_TITLE: string

/** Appended to whichever completion body fires when graph cleanup was
 *  deferred, so no branch overclaims that the graph was fully cleaned. */
export let GRAPH_CLEANUP_DEFERRED_NOTE: string

export function graphCleanupDeferredBody(filename: string, alsoDeviceRemoved: boolean): string {
  const deviceSuffix = alsoDeviceRemoved ? i18n.t('library:deletionCopy.deviceCopySuffix') : ''
  return i18n.t('library:deletionCopy.graphCleanupDeferredBody', { filename, suffix: deviceSuffix })
}

/** The device-branch outcomes `executeDeletePermanent` can reach. 'queued'
 *  means the device was disconnected and the hardware erase is durably
 *  journaled for the next sweep (2026-07-22). */
export type DeviceDeleteOutcome = 'not-requested' | 'success' | 'partial' | 'queued'

export interface CompletionToastInputs {
  filename: string
  deviceOutcome: DeviceDeleteOutcome
  /** AR3-2 — true when the local purge's own post-commit file cleanup left something pending. */
  filesPending: boolean
  pendingKinds: string[]
  /** ADV49-1 (round 51) — true when the failed cleanup targets could NOT be
   *  durably journaled, so they will NOT be auto-retried; forces the honest
   *  "remove it manually" copy instead of the "will retry automatically" copy. */
  cleanupUnrecoverable?: boolean
  /** CX-T6-5/CX-T6-6 — true when the device copy WAS removed but the
   *  view-bookkeeping reconciliation or the local rebuild failed, so the
   *  list may still show it until the next authoritative device scan. */
  viewMayBeStale: boolean
  /** ARF-4 — true when the skipGraphCleanup escape hatch deferred graph
   *  cleanup to the retry sweep; forces a warning variant + honest note and
   *  forbids the plain success toast. */
  graphCleanupDeferred?: boolean
  removed: ActualRemovedCounts | undefined
}

export interface CompletionToast {
  variant: 'success' | 'warning'
  title: string
  body: string
}

/**
 * The permanent-delete completion-toast outcome ladder (T6 fix rounds
 * CX-T6-1..6), extracted to a pure function of its inputs so the priority
 * order — combined-partial > device-partial > files-pending > stale-view >
 * plain success — is unit-testable directly instead of only through the
 * rendered Library flow (phase-3 integration-review `/simplify` candidate
 * #2). `executeDeletePermanent` (Library.tsx) computes the inputs — live
 * device calls, IPC reconciliation, refreshLocal outcomes — and simply
 * dispatches whatever this returns; it owns no copy decisions of its own.
 */
export function selectCompletionToast(inputs: CompletionToastInputs): CompletionToast {
  const { filename, deviceOutcome, filesPending, pendingKinds, viewMayBeStale, graphCleanupDeferred, cleanupUnrecoverable, removed } = inputs
  const staleNote = viewMayBeStale ? ` ${VIEW_MAY_BE_STALE_NOTE}` : ''
  // ARF-4 — appended to EVERY partial branch so none overclaims the graph was
  // cleaned; when it is the SOLE caveat, its own dedicated branch below fires.
  const graphNote = graphCleanupDeferred ? GRAPH_CLEANUP_DEFERRED_NOTE : ''

  // ADV49-1 (round 51) — an UNRECOVERABLE file-cleanup failure (the failed
  // targets could not be durably journaled) must NEVER claim an automatic
  // retry. It takes priority over the normal files-pending branch and, when
  // combined with a device-copy-remains outcome, over the combined-partial
  // branch too, so no body promises a retry that can't happen.
  if (filesPending && cleanupUnrecoverable) {
    const deviceNote =
      deviceOutcome === 'partial' ? ` ${i18n.t('library:deletionCopy.deviceStillThereReconcileNote')}` : ''
    return {
      variant: 'warning',
      title: FILES_UNRECOVERABLE_TITLE,
      body: filesUnrecoverableBody(filename, pendingKinds) + deviceNote + staleNote + graphNote
    }
  }

  if (deviceOutcome === 'partial' && filesPending) {
    // CX-T6-3 — both partial outcomes must surface together; the
    // device-only body would otherwise overclaim full local removal.
    return {
      variant: 'warning',
      title: COMBINED_PARTIAL_TITLE,
      body: combinedPartialBody(filename, pendingKinds) + graphNote
    }
  }
  if (deviceOutcome === 'partial') {
    return { variant: 'warning', title: DEVICE_COPY_REMAINS_TITLE, body: deviceCopyRemainsBody(filename) + graphNote }
  }
  if (deviceOutcome === 'queued') {
    // 2026-07-22 — the hardware erase is durably journaled; honest "will
    // happen", never a silent partial nor a full success.
    return {
      variant: 'warning',
      title: i18n.t('library:deletionCopy.deletedPermanentlyDeviceQueuedTitle'),
      body: i18n.t('library:deletionCopy.deletedPermanentlyDeviceQueuedBody', { filename }) + graphNote,
    }
  }
  if (filesPending) {
    return {
      variant: 'warning',
      title: FILES_PENDING_TITLE,
      body: filesPendingBody(filename, pendingKinds) + staleNote + graphNote
    }
  }
  if (graphCleanupDeferred) {
    // ARF-4 — escape hatch used and nothing else pending: graph residue is
    // deferred to the sweep. NEVER the plain success toast.
    return {
      variant: 'warning',
      title: GRAPH_CLEANUP_DEFERRED_TITLE,
      body: graphCleanupDeferredBody(filename, deviceOutcome === 'success') + staleNote
    }
  }
  if (viewMayBeStale) {
    // Everything WAS deleted (local + device) — the honest partial path
    // applies: warning variant, with the stale-view note appended.
    return {
      variant: 'warning',
      title: SUCCESS_DELETED_PERMANENTLY_TITLE,
      body: `${actualRemovalSummary(removed, true)}${staleNote}`
    }
  }
  return {
    variant: 'success',
    title: SUCCESS_DELETED_PERMANENTLY_TITLE,
    body: actualRemovalSummary(removed, deviceOutcome === 'success')
  }
}

// =============================================================================
// Task 11d — live re-resolution on language switch (see the file-level i18n
// note above).
// =============================================================================

/**
 * Re-resolves every module-scope deletion-copy constant from the CURRENT
 * language. Also supplies the INITIAL value (called once, immediately
 * below), so the i18n key list exists in exactly one place rather than once
 * as an initializer per constant and again in a refresh handler. Subscribed
 * to i18n's `languageChanged` event so a live language switch in Settings
 * updates every consumer on its next render.
 */
function loadDeletionCopy(): void {
  LABEL_DELETE_FROM_DEVICE = i18n.t('library:deletionCopy.labelDeleteFromDevice')
  LABEL_MOVE_TO_TRASH = i18n.t('library:deletionCopy.labelMoveToTrash')
  LABEL_DELETE_PERMANENTLY = i18n.t('library:deletionCopy.labelDeletePermanently')
  LABEL_RESTORE = i18n.t('library:deletionCopy.labelRestore')

  SCOPE_DEVICE_DELETE = i18n.t('library:deletionCopy.scopeDeviceDelete')
  SCOPE_DEVICE_DELETE_SYNCED = i18n.t('library:deletionCopy.scopeDeviceDeleteSynced')
  SCOPE_DEVICE_NOT_CONNECTED = i18n.t('library:deletionCopy.scopeDeviceNotConnected')
  SCOPE_TRASH = i18n.t('library:deletionCopy.scopeTrash')
  SCOPE_PERMANENT = i18n.t('library:deletionCopy.scopePermanent')
  SCOPE_RESTORE = i18n.t('library:deletionCopy.scopeRestore')

  TRASH_MODE_BANNER = i18n.t('library:deletionCopy.trashModeBanner')
  LEGACY_GRAPH_DISCLOSURE = i18n.t('library:deletionCopy.legacyGraphDisclosure')

  SUCCESS_MOVED_TO_TRASH_TITLE = i18n.t('library:deletionCopy.successMovedToTrashTitle')
  SUCCESS_REMOVED_FROM_DEVICE_TITLE = i18n.t('library:deletionCopy.successRemovedFromDeviceTitle')
  SUCCESS_RESTORED_TITLE = i18n.t('library:deletionCopy.successRestoredTitle')
  PARTIAL_DELETE_TITLE = i18n.t('library:deletionCopy.partialDeleteTitle')

  GRAPH_CLEANUP_RETRY_SAFETY_LINE = i18n.t('library:deletionCopy.graphCleanupRetrySafetyLine')
  FAILURE_NOTHING_DELETED_TITLE = i18n.t('library:deletionCopy.failureNothingDeletedTitle')
  LABEL_DELETE_ANYWAY_SKIP_GRAPH = i18n.t('library:deletionCopy.labelDeleteAnywaySkipGraph')

  DEVICE_COPY_REMAINS_TITLE = i18n.t('library:deletionCopy.deviceCopyRemainsTitle')
  FILES_PENDING_TITLE = i18n.t('library:deletionCopy.filesPendingTitle')
  FILES_UNRECOVERABLE_TITLE = i18n.t('library:deletionCopy.filesUnrecoverableTitle')
  VIEW_MAY_BE_STALE_NOTE = i18n.t('library:deletionCopy.viewMayBeStaleNote')
  COMBINED_PARTIAL_TITLE = i18n.t('library:deletionCopy.combinedPartialTitle')

  SUCCESS_DELETED_PERMANENTLY_TITLE = i18n.t('library:deletionCopy.successDeletedPermanentlyTitle')
  GRAPH_CLEANUP_DEFERRED_TITLE = i18n.t('library:deletionCopy.graphCleanupDeferredTitle')
  GRAPH_CLEANUP_DEFERRED_NOTE = i18n.t('library:deletionCopy.graphCleanupDeferredNote')
}

loadDeletionCopy()
i18n.on('languageChanged', loadDeletionCopy)
