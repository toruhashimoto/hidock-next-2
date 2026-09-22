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
 * (that's the "plain-language" rewrite the comment above describes), so it is
 * NOT translated here; doing so is a separate, larger task (ordinary UI-copy
 * translation), not the "main sent English, renderer prints it raw" bug this
 * task fixes. `ACTIONABLE_TYPE_LABELS`/`humanizeActionableType()` below ARE in
 * scope: main sends only the actionable's `type` id (no label at all), the
 * renderer invents the wording, and that renderer-invented English is what
 * showed up untranslated on the Actionables page and (via a second, ad hoc
 * humanization in `Today.tsx`) the Today screen's 次のアクション card. Both call
 * sites are translated via the `domain` catalogue's `actionableType.<id>.*`
 * keys, each keyed so its OWN pre-existing English fallback is preserved
 * unchanged (see `domain.json` and `Today.tsx` for why the two sites use
 * different key suffixes for the same id).
 */

import i18n from '@/i18n'

/** Where every generated output lands, regardless of template. */
export const OUTPUT_DESTINATION =
  'Saved as a Markdown file in your outputs folder and shown here to copy or open.'

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

const TEMPLATE_INFO: Record<string, TemplateInfo> = {
  meeting_minutes: {
    name: 'Meeting minutes',
    description: 'Formal minutes with attendees, decisions, and action items.',
    format: 'Markdown document',
    actionLabel: 'Generate meeting minutes'
  },
  interview_feedback: {
    name: 'Interview feedback',
    description: 'Structured candidate assessment for an interview debrief.',
    format: 'Markdown document',
    actionLabel: 'Generate interview feedback'
  },
  project_status: {
    name: 'Project status report',
    description: 'Progress summary with blockers and next steps.',
    format: 'Markdown document',
    actionLabel: 'Generate status report'
  },
  action_items: {
    name: 'Action items summary',
    description: 'Consolidated list of action items with owners and due dates.',
    format: 'Markdown table',
    actionLabel: 'Generate action items'
  },
  claude_code_prompt: {
    name: 'Claude Code handoff prompt',
    description: 'Ready-to-paste prompt for a Claude Code session to execute the follow-up work.',
    format: 'Markdown prompt',
    actionLabel: 'Generate Claude Code prompt'
  }
}

/** Fallback for an unknown / missing template id — honest generic wording. */
const UNKNOWN_TEMPLATE: TemplateInfo = {
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
  if (!templateId) return UNKNOWN_TEMPLATE
  return TEMPLATE_INFO[templateId] ?? UNKNOWN_TEMPLATE
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
  if (!type) return 'Suggestion'
  const known = ACTIONABLE_TYPE_LABELS[type]
  if (known) return i18n.t(`domain:actionableType.${type}.label`, { defaultValue: known })
  const words = type.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
