import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  X,
  ArrowUpRight,
  Crosshair,
  Pencil,
  UserPlus,
  Link2,
  GitMerge,
  Trash2,
  FileText,
  Users,
  FolderKanban,
  ListChecks,
  Loader2,
  Check,
  AlertTriangle,
  BadgeCheck,
  Sparkle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { entityColor, nodeTypeLabel } from './graph-theme'
import type { NodeDetail, Provenance, ProvenanceEntity, MergePreview, ContextGraphNode } from './types'
import { MergeIntoDialog } from '@/components/identity/MergeIntoDialog'

interface OpenTarget {
  type: string
  contactId?: string
  meetingId?: string
  projectId?: string
}

interface NodeInspectorProps {
  /** The graph node id being inspected. */
  nodeId: string
  /** Immediate header info before detail loads (from the clicked node). */
  fallback?: { type: string; label: string } | null
  isDark: boolean
  /** Center/pan-to the node in the canvas. */
  onLocate: (node: { id: string; type: string; label: string }) => void
  /** Navigate to an entity's detail page (person/meeting/project). */
  onOpenEntity: (target: OpenTarget) => void
  /** True when an entity has a dedicated page. */
  canOpen: (target: OpenTarget) => boolean
  /** Focus an entity in the current view (non-navigating). */
  onFocusEntity?: (entity: ProvenanceEntity) => void
  /** Called after the graph mutates so the parent can refresh. When a node was
   *  merged/renamed into another, `keeperId` is the surviving id; `removed` marks
   *  a deletion so the parent can clear its selection. */
  onChanged: (info: { keeperId?: string | null; removed?: boolean }) => void
  /** Provenance loaded — lets the parent highlight the evidence path. */
  onProvenanceLoaded?: (prov: Provenance | null) => void
  onClose: () => void
}

function formatDate(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** A labelled fact row in the "what this is" grid. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right min-w-0 break-words">{value}</span>
    </div>
  )
}

// Canonical, stored values — these strings are persisted via setPronouns() and
// echoed back as the node's `pronouns` field, so they stay the fixed English
// literals regardless of UI language (an identifier the graph stores, not
// itself a label). pronounPresetLabel() below supplies the translated DISPLAY
// text for the picker buttons without touching what gets saved.
const PRONOUN_PRESETS = ['He/Him', 'She/Her', 'They/Them'] as const

function pronounPresetLabel(t: (key: string) => string, preset: (typeof PRONOUN_PRESETS)[number]): string {
  switch (preset) {
    case 'He/Him':
      return t('graph.pronounPreset.heHim')
    case 'She/Her':
      return t('graph.pronounPreset.sheHer')
    case 'They/Them':
      return t('graph.pronounPreset.theyThem')
  }
}

/**
 * The node inspector: what a person (or any entity) IS, where it comes from, and
 * every edit the graph allows. Discoverability (identity + stats + aliases),
 * clickability (navigable sources), editability (rename-as-correction, convert to
 * contact, set identity, pronouns), and navigability (locate, merge, remove) —
 * all routed through the existing identity platform.
 */
export function NodeInspector({
  nodeId,
  fallback,
  isDark,
  onLocate,
  onOpenEntity,
  canOpen,
  onFocusEntity,
  onChanged,
  onProvenanceLoaded,
  onClose,
}: NodeInspectorProps) {
  const { t } = useTranslation('chat')
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [provenance, setProvenance] = useState<Provenance | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Editors / dialogs
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [editingPronouns, setEditingPronouns] = useState(false)
  const [pronounValue, setPronounValue] = useState('')
  const [confirmConvert, setConfirmConvert] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [detRes, provRes] = await Promise.all([
        window.electronAPI.contextGraph.nodeDetail(nodeId),
        window.electronAPI.contextGraph.provenance(nodeId),
      ])
      const det = detRes.success && detRes.data ? detRes.data : null
      setDetail(det)
      const prov = provRes.success && provRes.data ? (provRes.data as Provenance) : null
      setProvenance(prov)
      onProvenanceLoaded?.(prov)
    } catch {
      setDetail(null)
      setProvenance(null)
      onProvenanceLoaded?.(null)
    } finally {
      setLoading(false)
    }
  }, [nodeId, onProvenanceLoaded])

  useEffect(() => {
    void load()
  }, [load])

  const node = detail?.node ?? null
  const type = node?.type ?? fallback?.type ?? 'entity'
  const label = node?.label ?? fallback?.label ?? '…'
  const color = isDark ? entityColor(type).dark : entityColor(type).light
  const isPerson = type === 'person'
  const linked = detail?.linked ?? false
  const openTarget: OpenTarget | null = node
    ? { type: node.type, contactId: node.contactId, meetingId: node.meetingId, projectId: node.projectId }
    : null

  const refreshAfter = useCallback(
    (info: { keeperId?: string | null; removed?: boolean }) => {
      onChanged(info)
      if (!info.removed) void load()
    },
    [onChanged, load]
  )

  // ---- Actions -------------------------------------------------------------
  const doRename = useCallback(async () => {
    const next = renameValue.trim()
    if (!next || !node) return
    setBusy(true)
    try {
      const res = await window.electronAPI.contextGraph.rename(node.id, next)
      if (res.success && res.data) {
        const { outcome, scope, nodeId: keeperId } = res.data
        if (outcome === 'noop') {
          toast.info(t('graph.toast.renameNoChangeTitle'), t('graph.toast.renameNoChangeDescription'))
        } else if (outcome === 'merged') {
          toast.success(t('graph.toast.namesMergedTitle'), t('graph.toast.namesMergedDescription', { old: label, new: next }))
        } else {
          toast.success(
            t('graph.toast.nameCorrectedTitle'),
            scope === 'contact'
              ? t('graph.toast.nameCorrectedDescriptionContact', { label, new: next })
              : t('graph.toast.nameCorrectedDescriptionGraph', { new: next })
          )
        }
        setRenaming(false)
        refreshAfter({ keeperId })
      } else {
        toast.error(t('graph.toast.renameFailedTitle'), res.error ?? t('graph.unexpectedErrorFallback'))
      }
    } catch (e) {
      toast.error(t('graph.toast.renameFailedTitle'), e instanceof Error ? e.message : t('graph.unexpectedErrorFallback'))
    } finally {
      setBusy(false)
    }
  }, [renameValue, node, label, refreshAfter, t])

  const doSetPronouns = useCallback(
    async (value: string) => {
      if (!node) return
      setBusy(true)
      try {
        const res = await window.electronAPI.contextGraph.setPronouns(node.id, value)
        if (res.success) {
          toast.success(
            value ? t('graph.toast.pronounsSetTitle') : t('graph.toast.pronounsClearedTitle'),
            value ? t('graph.toast.pronounsSetDescription', { label, value }) : undefined
          )
          setEditingPronouns(false)
          refreshAfter({})
        } else {
          toast.error(t('graph.toast.setPronounsFailedTitle'), res.error ?? t('graph.unexpectedErrorFallback'))
        }
      } finally {
        setBusy(false)
      }
    },
    [node, label, refreshAfter, t]
  )

  const doConvert = useCallback(async () => {
    if (!node) return
    setBusy(true)
    try {
      const res = await window.electronAPI.contextGraph.convertToContact(node.id)
      if (res.success && res.data) {
        toast.success(
          res.data.reusedExisting ? t('graph.toast.linkedExistingTitle') : t('graph.toast.contactCreatedTitle'),
          t('graph.toast.contactCreatedDescription', { label })
        )
        setConfirmConvert(false)
        refreshAfter({ keeperId: res.data.nodeId })
      } else {
        toast.error(t('graph.toast.convertFailedTitle'), res.error ?? t('graph.unexpectedErrorFallback'))
      }
    } catch (e) {
      toast.error(t('graph.toast.convertFailedTitle'), e instanceof Error ? e.message : t('graph.unexpectedErrorFallback'))
    } finally {
      setBusy(false)
    }
  }, [node, label, refreshAfter, t])

  const doLink = useCallback(
    async (contactId: string, contactName: string) => {
      if (!node) return
      setBusy(true)
      try {
        const res = await window.electronAPI.contextGraph.linkContact(node.id, contactId)
        if (res.success && res.data) {
          toast.success(t('graph.toast.identitySetTitle'), t('graph.toast.identitySetDescription', { label, contact: contactName }))
          refreshAfter({ keeperId: res.data.nodeId })
        } else {
          toast.error(t('graph.toast.setIdentityFailedTitle'), res.error ?? t('graph.unexpectedErrorFallback'))
        }
      } finally {
        setBusy(false)
      }
    },
    [node, label, refreshAfter, t]
  )

  const doDelete = useCallback(async () => {
    if (!node) return
    setBusy(true)
    try {
      const res = await window.electronAPI.contextGraph.deleteNode(node.id)
      if (res.success && res.data?.removed) {
        toast.success(t('graph.toast.removedTitle'), t('graph.toast.removedDescription', { label, count: res.data.removedEdges }))
        setConfirmDelete(false)
        onProvenanceLoaded?.(null)
        refreshAfter({ removed: true })
      } else {
        toast.error(t('graph.toast.removeFailedTitle'), res.error ?? t('graph.toast.nothingToRemove'))
      }
    } finally {
      setBusy(false)
    }
  }, [node, label, refreshAfter, onProvenanceLoaded, t])

  const onMerged = useCallback(
    (keeperId: string, loserLabel: string) => {
      toast.success(t('graph.toast.mergedTitle'), t('graph.toast.mergedDescription', { loser: loserLabel, keeper: label }))
      onProvenanceLoaded?.(null)
      refreshAfter({ keeperId })
    },
    [label, refreshAfter, onProvenanceLoaded, t]
  )

  // ---- Render --------------------------------------------------------------
  const sources: Array<{ key: string; title: string; icon: typeof FileText; items: ProvenanceEntity[] }> = useMemo(
    () => [
      { key: 'meetings', title: t('graph.inspector.sources.meetings'), icon: FileText, items: provenance?.meetings ?? [] },
      { key: 'people', title: t('graph.inspector.sources.people'), icon: Users, items: provenance?.people ?? [] },
      { key: 'projects', title: t('graph.inspector.sources.projects'), icon: FolderKanban, items: provenance?.projects ?? [] },
      { key: 'actions', title: t('graph.inspector.sources.actions'), icon: ListChecks, items: provenance?.actions ?? [] },
    ],
    [provenance, t]
  )

  return (
    <aside className="w-80 shrink-0 border-l bg-muted/5 flex flex-col overflow-hidden" aria-label={t('graph.inspector.ariaLabel')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {nodeTypeLabel(type)}
            </span>
            {isPerson &&
              (linked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="h-3 w-3" />
                  {t('graph.inspector.badge.linkedContact')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  <Sparkle className="h-3 w-3" />
                  {t('graph.inspector.badge.extractedName')}
                </span>
              ))}
          </div>
          <h3 className="text-sm font-semibold mt-1 break-words leading-snug">{label}</h3>
          {detail?.pronouns && (
            <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {detail.pronouns}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label={t('graph.inspector.closeAriaLabel')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-4 overflow-auto">
        {loading && !detail ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('graph.inspector.loading')}
          </div>
        ) : (
          <>
            {/* What this is — net-new identity facts, never a re-print of the label. */}
            <section aria-label={t('graph.inspector.identitySectionAriaLabel')} className="rounded-lg border bg-background/40 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {t('graph.inspector.whatThisIsHeading')}
              </p>
              {isPerson && !linked && (
                <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                  {t('graph.inspector.extractedNameHint')}
                </p>
              )}
              <div className="divide-y divide-border/50">
                {detail?.role && <Fact label={t('graph.inspector.fact.role')} value={detail.role} />}
                {detail?.company && <Fact label={t('graph.inspector.fact.org')} value={detail.company} />}
                {detail?.email && <Fact label={t('graph.inspector.fact.email')} value={detail.email} />}
                <Fact
                  label={t('graph.inspector.fact.meetings')}
                  value={<span className="tabular-nums">{detail?.meetingCount ?? 0}</span>}
                />
                {(detail?.firstSeenMs || detail?.lastSeenMs) && (
                  <Fact
                    label={t('graph.inspector.fact.seen')}
                    value={
                      <span className="tabular-nums">
                        {detail?.firstSeenMs && detail?.lastSeenMs && detail.firstSeenMs !== detail.lastSeenMs
                          ? t('graph.inspector.fact.seenRange', { first: formatDate(detail?.firstSeenMs ?? null), last: formatDate(detail?.lastSeenMs ?? null) })
                          : formatDate(detail?.firstSeenMs ?? null)}
                      </span>
                    }
                  />
                )}
                {(detail?.peopleCount ?? 0) + (detail?.projectCount ?? 0) > 0 && (
                  <Fact
                    label={t('graph.inspector.fact.connections')}
                    value={
                      <span className="tabular-nums">
                        {[
                          detail?.peopleCount ? t('graph.inspector.fact.peopleCount', { count: detail.peopleCount }) : '',
                          detail?.projectCount ? t('graph.inspector.fact.projectsCount', { count: detail.projectCount }) : '',
                        ]
                          .filter(Boolean)
                          .join(t('graph.inspector.fact.listSeparator'))}
                      </span>
                    }
                  />
                )}
              </div>
              {detail && detail.aliases.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('graph.inspector.aliasesHeading')}</p>
                  <div className="flex flex-wrap gap-1">
                    {detail.aliases.map((a) => (
                      <span key={a} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Narrative */}
            {provenance?.narrative && (
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300 mb-1">
                  {t('graph.inspector.narrativeHeading')}
                </p>
                <p className="text-sm leading-relaxed text-foreground">{provenance.narrative}</p>
              </div>
            )}

            {/* Actions */}
            <section aria-label={t('graph.inspector.actionsSectionAriaLabel')} className="space-y-2">
              {renaming ? (
                <div className="rounded-lg border p-2 space-y-2">
                  <label htmlFor="ni-rename" className="text-[11px] font-medium text-muted-foreground">
                    {linked ? t('graph.inspector.rename.promptLinked') : t('graph.inspector.rename.promptUnlinked')}
                  </label>
                  <Input
                    id="ni-rename"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void doRename()
                      if (e.key === 'Escape') setRenaming(false)
                    }}
                    aria-label={t('graph.inspector.rename.newNameAriaLabel')}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={doRename} disabled={busy || !renameValue.trim()} className="gap-1.5">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {t('graph.inspector.rename.saveButton')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenaming(false)} disabled={busy}>
                      {t('graph.cancelButton')}
                    </Button>
                  </div>
                </div>
              ) : editingPronouns ? (
                <div className="rounded-lg border p-2 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">{t('graph.inspector.pronouns.heading')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRONOUN_PRESETS.map((p) => (
                      <Button key={p} size="sm" variant="outline" onClick={() => void doSetPronouns(p)} disabled={busy}>
                        {pronounPresetLabel(t, p)}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={pronounValue}
                      placeholder={t('graph.inspector.pronouns.customPlaceholder')}
                      onChange={(e) => setPronounValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void doSetPronouns(pronounValue)}
                      aria-label={t('graph.inspector.pronouns.customAriaLabel')}
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEditingPronouns(false)} disabled={busy}>
                      {t('graph.cancelButton')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => node && onLocate({ id: node.id, type: node.type, label: node.label })}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    {t('graph.inspector.actions.locate')}
                  </Button>
                  {openTarget && canOpen(openTarget) && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenEntity(openTarget)}>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      {t('graph.inspector.actions.openPage')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setRenameValue(label)
                      setRenaming(true)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('graph.inspector.actions.rename')}
                  </Button>
                  {isPerson && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setPronounValue(detail?.pronouns ?? '')
                        setEditingPronouns(true)
                      }}
                    >
                      <BadgeCheck className="h-3.5 w-3.5" />
                      {t('graph.inspector.actions.pronouns')}
                    </Button>
                  )}
                  {isPerson && !linked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setConfirmConvert(true)}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {t('graph.inspector.actions.toContact')}
                    </Button>
                  )}
                  {isPerson && !linked && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLinkOpen(true)}>
                      <Link2 className="h-3.5 w-3.5" />
                      {t('graph.inspector.actions.setIdentity')}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMergeOpen(true)}>
                    <GitMerge className="h-3.5 w-3.5" />
                    {t('graph.mergeButton')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('graph.inspector.actions.remove')}
                  </Button>
                </div>
              )}
            </section>

            {/* Clickable sources */}
            {sources.some((s) => s.items.length > 0) && (
              <section aria-label={t('graph.inspector.sourcesSectionAriaLabel')} className="space-y-3">
                {sources.map(({ key, title, icon: Icon, items }) =>
                  items.length === 0 ? null : (
                    <div key={key}>
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        <Icon className="h-3.5 w-3.5" />
                        {t('graph.inspector.sources.sectionHeading', { title, count: items.length })}
                      </p>
                      <ul className="space-y-0.5">
                        {items.map((e, i) => {
                          const navigable = canOpen({
                            type: e.type,
                            contactId: e.contactId,
                            meetingId: e.meetingId,
                            projectId: e.projectId,
                          })
                          return (
                            <li key={`${e.id}-${i}`}>
                              <button
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
                                onClick={() =>
                                  navigable
                                    ? onOpenEntity({
                                        type: e.type,
                                        contactId: e.contactId,
                                        meetingId: e.meetingId,
                                        projectId: e.projectId,
                                      })
                                    : onFocusEntity?.(e)
                                }
                                title={navigable ? t('graph.inspector.sources.openTooltip', { type: nodeTypeLabel(e.type) }) : t('graph.inspector.sources.focusTooltip')}
                                aria-label={navigable ? t('graph.inspector.sources.openAriaLabel', { label: e.label }) : t('graph.inspector.sources.focusAriaLabel', { label: e.label })}
                              >
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: isDark ? entityColor(e.type).dark : entityColor(e.type).light }}
                                />
                                <span className="truncate flex-1">{e.label}</span>
                                {e.dateMs != null && (
                                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                    {formatDate(e.dateMs)}
                                  </span>
                                )}
                                {navigable && (
                                  <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Convert-to-contact confirm */}
      <AlertDialog open={confirmConvert} onOpenChange={setConfirmConvert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('graph.inspector.convert.title', { label })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('graph.inspector.convert.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('graph.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doConvert() }} disabled={busy}>
              {busy ? t('graph.inspector.convert.confirmButtonBusy') : t('graph.inspector.convert.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('graph.inspector.delete.title', { label })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('graph.inspector.delete.description', { degree: detail?.degree ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('graph.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void doDelete() }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? t('graph.inspector.delete.confirmButtonBusy') : t('graph.inspector.delete.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set identity — reuse the contacts picker */}
      {node && (
        <MergeIntoDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          loserName={label}
          excludeIds={detail?.contactId ? [detail.contactId] : []}
          onPick={(contactId, contactName) => void doLink(contactId, contactName)}
        />
      )}

      {/* Merge two nodes */}
      {node && (
        <MergeNodeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          keeper={{ id: node.id, label, type }}
          isDark={isDark}
          onMerged={onMerged}
        />
      )}
    </aside>
  )
}

// ===========================================================================
// MergeNodeDialog — pick a second node, preview the blast radius, then commit.
// ===========================================================================

interface MergeNodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  keeper: { id: string; label: string; type: string }
  isDark: boolean
  onMerged: (keeperId: string, loserLabel: string) => void
}

function MergeNodeDialog({ open, onOpenChange, keeper, isDark, onMerged }: MergeNodeDialogProps) {
  const { t } = useTranslation('chat')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContextGraphNode[]>([])
  const [picked, setPicked] = useState<ContextGraphNode | null>(null)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setPicked(null)
      setPreview(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || picked) return
    let cancelled = false
    const t = setTimeout(async () => {
      const q = query.trim()
      if (!q) return setResults([])
      const res = await window.electronAPI.contextGraph.search(q)
      if (cancelled) return
      const list = res.success && res.data ? res.data : []
      // Same type, never the keeper itself.
      setResults(list.filter((n) => n.type === keeper.type && n.id !== keeper.id).slice(0, 8))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, open, picked, keeper.id, keeper.type])

  const choose = useCallback(
    async (n: ContextGraphNode) => {
      setPicked(n)
      const res = await window.electronAPI.contextGraph.mergePreview(keeper.id, n.id)
      if (res.success && res.data) setPreview(res.data)
    },
    [keeper.id]
  )

  const commit = useCallback(async () => {
    if (!picked) return
    setBusy(true)
    try {
      const res = await window.electronAPI.contextGraph.mergeNodes(keeper.id, picked.id)
      if (res.success && res.data) {
        onMerged(res.data.keeperId, picked.label)
        onOpenChange(false)
      } else {
        toast.error(t('graph.toast.mergeFailedTitle'), res.error ?? t('graph.unexpectedErrorFallback'))
      }
    } finally {
      setBusy(false)
    }
  }, [picked, keeper.id, onMerged, onOpenChange, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('graph.merge.title', { keeper: keeper.label })}</DialogTitle>
          <DialogDescription>
            {t('graph.merge.description', { type: nodeTypeLabel(keeper.type), keeper: keeper.label })}
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <>
            <Input
              value={query}
              autoFocus
              placeholder={t('graph.merge.searchPlaceholder', { type: nodeTypeLabel(keeper.type) })}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('graph.merge.searchAriaLabel')}
            />
            <div className="max-h-64 overflow-y-auto -mx-1 px-1">
              {results.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {query.trim() ? t('graph.merge.noMatches') : t('graph.merge.typeToSearch')}
                </p>
              ) : (
                results.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => void choose(n)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: isDark ? entityColor(n.type).dark : entityColor(n.type).light }}
                    />
                    <span className="truncate flex-1">{n.label}</span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {/* Blast radius — WHAT gets merged, before committing. */}
            <div className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{picked.label}</span>
                <span className="text-muted-foreground shrink-0">→</span>
                <span className="truncate font-medium">{keeper.label}</span>
              </div>
              {preview ? (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>
                    <Trans i18nKey="chat:graph.merge.previewEdgesFromLoser" values={{ count: preview.b?.edges ?? 0, loser: picked.label, keeper: keeper.label }}>
                      <span className="tabular-nums text-foreground">{{ count: preview.b?.edges ?? 0 } as unknown as string}</span> link(s) from
                      “{{ loser: picked.label } as unknown as string}” move onto “{{ keeper: keeper.label } as unknown as string}”.
                    </Trans>
                  </p>
                  {preview.shared > 0 && (
                    <p>
                      <Trans i18nKey="chat:graph.merge.previewSharedConnections" values={{ count: preview.shared }}>
                        <span className="tabular-nums text-foreground">{{ count: preview.shared } as unknown as string}</span> shared connection(s)
                        collapse into one.
                      </Trans>
                    </p>
                  )}
                  <p>
                    <Trans i18nKey="chat:graph.merge.previewResult" values={{ count: preview.resulting }}>
                      Result: <span className="tabular-nums text-foreground">{{ count: preview.resulting } as unknown as string}</span> link(s) on
                      the kept node.
                    </Trans>
                  </p>
                  {preview.contactMerge && (
                    <p className="flex items-start gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {t('graph.merge.contactMergeWarning')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('graph.merge.computingImpact')}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {picked && (
            <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setPreview(null) }} disabled={busy}>
              {t('graph.merge.backButton')}
            </Button>
          )}
          <Button size="sm" onClick={commit} disabled={!picked || busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
            {t('graph.mergeButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default NodeInspector
