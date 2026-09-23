/**
 * Renderer-side, plain-language descriptions of what each output template
 * produces. Mirrors the main-process definitions in
 * `electron/main/services/output-templates.ts` (kept a const map, not an IPC
 * fetch, because the templates are stable constants and the card must state the
 * concrete outcome synchronously, before the user decides to approve).
 *
 * Dogfood B7 — evidence at the decision point: an "Approve & Generate" button is
 * only decidable if the user can see WHAT will be generated and WHERE it goes.
 *
 * i18n note (Task 16-C): `TEMPLATE_INFO` below is independent renderer-authored
 * copy — its wording already differs from main's own `name`/`description`
 * (that's the "plain-language" rewrite the comment above describes), so it was
 * NOT translated by 16-C; that was a separate, larger task (ordinary UI-copy
 * translation), not the "main sent English, renderer prints it raw" bug 16-C
 * fixed. `ACTIONABLE_TYPE_LABELS`/`humanizeActionableType()` below were already
 * in scope for 16-C: main sends only the actionable's `type` id (no label at
 * all), the renderer invents the wording, and that renderer-invented English
 * is what showed up untranslated on the Actionables page and (via a second,
 * ad hoc humanization in `Today.tsx`) the Today screen's 次のアクション card. Both
 * call sites are translated via the `domain` catalogue's `actionableType.<id>.*`
 * keys, each keyed so its OWN pre-existing English fallback is preserved
 * unchanged (see `domain.json` and `Today.tsx` for why the two sites use
 * different key suffixes for the same id).
 *
 * i18n note (Task 17-C): the "separate, larger task" above is this one.
 * `TEMPLATE_INFO`, `UNKNOWN_TEMPLATE`, and `OUTPUT_DESTINATION` are the
 * renderer's own copy (independent of `domain.json`'s `outputTemplate.*`,
 * which mirrors main's wording instead — see Task 16-C's report for why
 * those two are deliberately kept separate). They route through the
 * `projects` catalogue's `templateInfo.*` keys. Every lookup carries its
 * current English literal as `defaultValue` so an unknown/future template id
 * — or a catalogue key that hasn't landed yet — never renders blank.
 */

import i18n from '@/i18n'

interface TemplateInfoEntry extends TemplateInfo {
  /** The catalogue id segment, e.g. `templateInfo.<id>.name`. */
  catalogueId: string
}

/** Resolve one field of a template through the live catalogue, English fallback intact. */
function localized(entry: TemplateInfoEntry): TemplateInfo {
  return {
    name: i18n.t(`projects:templateInfo.${entry.catalogueId}.name`, { defaultValue: entry.name }),
    description: i18n.t(`projects:templateInfo.${entry.catalogueId}.description`, { defaultValue: entry.description }),
    format: i18n.t(`projects:templateInfo.${entry.catalogueId}.format`, { defaultValue: entry.format }),
    actionLabel: i18n.t(`projects:templateInfo.${entry.catalogueId}.actionLabel`, { defaultValue: entry.actionLabel })
  }
}

/** Where every generated output lands, regardless of template. */
export function getOutputDestination(): string {
  return i18n.t('projects:templateInfo.outputDestination', {
    defaultValue: 'Saved as a Markdown file in your outputs folder and shown here to copy or open.'
  })
}

export interface TemplateInfo {
  /** Human name in plain words, e.g. "Meeting minutes". */
  name: string
  /** One-line description of the produced document. */
  description: string
  /** The concrete artifact format, e.g. "Markdown document". */
  format: string
  /** Verb-first label for the approve button, e.g. "Generate meeting minutes". */
  actionLabel: string
}

const TEMPLATE_INFO: Record<string, TemplateInfoEntry> = {
  meeting_minutes: {
    catalogueId: 'meeting_minutes',
    name: 'Meeting minutes',
    description: 'Formal minutes with attendees, decisions, and action items.',
    format: 'Markdown document',
    actionLabel: 'Generate meeting minutes'
  },
  interview_feedback: {
    catalogueId: 'interview_feedback',
    name: 'Interview feedback',
    description: 'Structured candidate assessment for an interview debrief.',
    format: 'Markdown document',
    actionLabel: 'Generate interview feedback'
  },
  project_status: {
    catalogueId: 'project_status',
    name: 'Project status report',
    description: 'Progress summary with blockers and next steps.',
    format: 'Markdown document',
    actionLabel: 'Generate status report'
  },
  action_items: {
    catalogueId: 'action_items',
    name: 'Action items summary',
    description: 'Consolidated list of action items with owners and due dates.',
    format: 'Markdown table',
    actionLabel: 'Generate action items'
  },
  claude_code_prompt: {
    catalogueId: 'claude_code_prompt',
    name: 'Claude Code handoff prompt',
    description: 'Ready-to-paste prompt for a Claude Code session to execute the follow-up work.',
    format: 'Markdown prompt',
    actionLabel: 'Generate Claude Code prompt'
  }
}

/** Fallback for an unknown / missing template id — honest generic wording. */
const UNKNOWN_TEMPLATE: TemplateInfoEntry = {
  catalogueId: 'unknown',
  name: 'Output',
  description: 'An AI-generated document from this knowledge source.',
  format: 'Markdown document',
  actionLabel: 'Approve & Generate'
}

/**
 * Resolve a template id to its plain-language info. Returns a generic fallback
 * (never throws) for unknown or null ids so the UI always has something to show.
 */
export function getTemplateInfo(templateId?: string | null): TemplateInfo {
  if (!templateId) return localized(UNKNOWN_TEMPLATE)
  return localized(TEMPLATE_INFO[templateId] ?? UNKNOWN_TEMPLATE)
}

/**
 * Human-readable label for an actionable's `type` enum. The raw values are
 * snake_case detection keys (e.g. `follow_up_work`, `decision_log`); rendering
 * them directly leaks the enum ("FOLLOW UP_WORK"). This maps the known types to
 * proper words and falls back to a title-cased de-underscored form for any
 * value not yet enumerated, so a new detection type never shows a raw key.
 */
const ACTIONABLE_TYPE_LABELS: Record<string, string> = {
  meeting_minutes: 'Meeting minutes',
  interview_feedback: 'Interview feedback',
  status_report: 'Status report',
  decision_log: 'Decision log',
  action_items: 'Action items',
  research_summary: 'Research summary',
  follow_up_work: 'Follow-up'
}

export function humanizeActionableType(type?: string | null): string {
  if (!type) return i18n.t('projects:templateInfo.suggestionFallback', { defaultValue: 'Suggestion' })
  const known = ACTIONABLE_TYPE_LABELS[type]
  if (known) return i18n.t(`domain:actionableType.${type}.label`, { defaultValue: known })
  const words = type.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
