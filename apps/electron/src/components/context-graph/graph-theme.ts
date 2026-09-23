/**
 * Context Graph entity colors. One hue per node type, with a light + dark
 * variant so the canvas reads clearly in both themes. Kept consistent with the
 * app's entity palette (people = sky, meetings = violet, projects = amber).
 *
 * i18n note (Task 17-D): `label` on every entry below is a `get` accessor, not
 * a plain data property. Reading `i18n.t(...)` once into a plain field at
 * module-evaluation time would freeze it in whatever language was active at
 * import — a `get label()` instead calls `i18n.t()` fresh on every access, so
 * it always reflects the current language even though this object is built
 * once at module scope. Mirrors the established pattern in
 * `features/library/utils/sourceType.ts` (`BUILTIN_ARTIFACT_TYPES`).
 */

import i18n from '@/i18n'

export interface EntityColor {
  /** Fill for light theme. */
  light: string
  /** Fill for dark theme. */
  dark: string
  /** Human label for the legend. */
  readonly label: string
}

export const ENTITY_COLORS: Record<string, EntityColor> = {
  person: { light: '#0284c7', dark: '#38bdf8', get label() { return i18n.t('chat:graph.nodeTypePlural.person') } }, // sky
  meeting: { light: '#7c3aed', dark: '#a78bfa', get label() { return i18n.t('chat:graph.nodeTypePlural.meeting') } }, // violet
  project: { light: '#d97706', dark: '#fbbf24', get label() { return i18n.t('chat:graph.nodeTypePlural.project') } }, // amber
  topic: { light: '#059669', dark: '#34d399', get label() { return i18n.t('chat:graph.nodeTypePlural.topic') } }, // emerald
  decision: { light: '#0891b2', dark: '#22d3ee', get label() { return i18n.t('chat:graph.nodeTypePlural.decision') } }, // cyan
  action_item: { light: '#e11d48', dark: '#fb7185', get label() { return i18n.t('chat:graph.nodeTypePlural.action_item') } }, // rose
  risk: { light: '#dc2626', dark: '#f87171', get label() { return i18n.t('chat:graph.nodeTypePlural.risk') } }, // red
  next_step: { light: '#0d9488', dark: '#2dd4bf', get label() { return i18n.t('chat:graph.nodeTypePlural.next_step') } }, // teal
  skill: { light: '#c026d3', dark: '#e879f9', get label() { return i18n.t('chat:graph.nodeTypePlural.skill') } }, // fuchsia
}

export const FALLBACK_COLOR: EntityColor = {
  light: '#64748b',
  dark: '#94a3b8',
  get label() { return i18n.t('chat:graph.nodeTypePlural.other') }
}

/**
 * Human-friendly singular label for a node type (e.g. `action_item` →
 * "action item"), used in sentences ("Search a {{type}}…") rather than the
 * plural legend. A function, not a lookup table with frozen strings, so it
 * reads the current language on every call. Unknown types fall back to the
 * same underscore-to-space transform the code used before this was
 * catalogued, so a not-yet-catalogued type still renders something sane.
 */
export function nodeTypeLabel(type: string): string {
  return i18n.t(`chat:graph.nodeType.${type}`, { defaultValue: type.replace(/_/g, ' ') })
}

export function entityColor(type: string): EntityColor {
  return ENTITY_COLORS[type] ?? FALLBACK_COLOR
}

/** Concrete fill for a node type in the active theme. */
export function colorForType(type: string, isDark: boolean): string {
  const c = entityColor(type)
  return isDark ? c.dark : c.light
}

// ---------------------------------------------------------------------------
// Strata — the reasoning bands the lens lays nodes out in (top → down)
// ---------------------------------------------------------------------------

import type { Stratum } from './types'

/** Bands top-to-bottom: strategy at the top, the evidence it rests on at the bottom. */
export const STRATA_ORDER: readonly Stratum[] = [
  'strategic',
  'operational',
  'people',
  'evidence',
] as const

/** Which stratum each node type belongs to (mirrors the knowledge-graph package). */
const STRATUM_OF: Record<string, Stratum> = {
  decision: 'strategic',
  risk: 'strategic',
  project: 'operational',
  action_item: 'operational',
  next_step: 'operational',
  topic: 'operational',
  person: 'people',
  skill: 'people',
  meeting: 'evidence',
}

export function stratumOf(type: string): Stratum {
  return STRATUM_OF[type] ?? 'operational'
}

export interface StratumStyle {
  /** Crisp band name shown in the left rail + as the canvas band tag. */
  readonly label: string
  /** One-line description of what the band holds. */
  readonly hint: string
  /** Faint band-fill tint (theme-specific), drawn behind the nodes. */
  bgLight: string
  bgDark: string
  /** High-contrast band-label color (≥4.5:1 on the app background). */
  labelLight: string
  labelDark: string
}

/**
 * Band styling. Fills are deliberately faint (low-alpha) so nodes read on top;
 * the label colors are full-strength slate that clears 4.5:1 on both themes.
 * `label`/`hint` are `get` accessors for the same reason as `ENTITY_COLORS`
 * above — see the file-level i18n note.
 */
export const STRATUM_STYLES: Record<Stratum, StratumStyle> = {
  strategic: {
    get label() { return i18n.t('chat:graph.stratum.strategic.label') },
    get hint() { return i18n.t('chat:graph.stratum.strategic.hint') },
    bgLight: 'rgba(8,145,178,0.06)', // cyan
    bgDark: 'rgba(34,211,238,0.07)',
    labelLight: '#334155',
    labelDark: '#cbd5e1',
  },
  operational: {
    get label() { return i18n.t('chat:graph.stratum.operational.label') },
    get hint() { return i18n.t('chat:graph.stratum.operational.hint') },
    bgLight: 'rgba(217,119,6,0.055)', // amber
    bgDark: 'rgba(251,191,36,0.06)',
    labelLight: '#334155',
    labelDark: '#cbd5e1',
  },
  people: {
    get label() { return i18n.t('chat:graph.stratum.people.label') },
    get hint() { return i18n.t('chat:graph.stratum.people.hint') },
    bgLight: 'rgba(2,132,199,0.055)', // sky
    bgDark: 'rgba(56,189,248,0.06)',
    labelLight: '#334155',
    labelDark: '#cbd5e1',
  },
  evidence: {
    get label() { return i18n.t('chat:graph.stratum.evidence.label') },
    get hint() { return i18n.t('chat:graph.stratum.evidence.hint') },
    bgLight: 'rgba(124,58,237,0.055)', // violet
    bgDark: 'rgba(167,139,250,0.06)',
    labelLight: '#334155',
    labelDark: '#cbd5e1',
  },
}

/** The node types that have a dedicated entity page to click through to. */
export const NAVIGABLE_TYPES = new Set(['person', 'meeting', 'project'])

/** Human-friendly name for an edge relation (e.g. HAS_NEXT_STEP → "has next step"). */
export function relationLabel(edgeType: string): string {
  return edgeType.toLowerCase().replace(/_/g, ' ')
}
