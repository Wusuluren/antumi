import type { UiLocale } from '@antumi/protocol'
import zh from '../../../../../docs/GETTING-STARTED.md?raw'
import en from '../../../../../docs/GETTING-STARTED.en.md?raw'
import { t } from './i18n'

// The guide's screenshots, bundled; the guide names them relative to docs/, as GitHub shows it.
const IMAGES = import.meta.glob<string>('../../../../../docs/assets/guide/*.png', { eager: true, query: '?url', import: 'default' })

export function guideImage(src: string): string | undefined {
  return IMAGES[`../../../../../docs/${src}`]
}

// The guide's own heading names the page; the rest is its body.
export function guidePage(text: string): { title: string; body: string } {
  const match = /^# (.+)\n+/.exec(text)
  const title = match?.[1]
  return match && title ? { title, body: text.slice(match[0].length) } : { title: t('GuideView.guide'), body: text }
}

export function guideFor(locale: UiLocale): { title: string; body: string } {
  return guidePage(locale === 'en' ? en : zh)
}

// `antumi:settings/<section>`: a place in Settings the guide names, opened by a click in the app.
// GitHub drops a link of an unknown scheme and shows its text, so the guide still reads there.
export function guideSettingsSection(href: string): string | null {
  return /^antumi:settings\/([a-z-]+)$/.exec(href)?.[1] ?? null
}

// A step the guide can tell is done here, named by a comment under its heading
// (`<!-- guide-step: agents -->`). GitHub hides it; the app's Markdown would print it, so it is cut.
export type GuideStep = 'agents' | 'providers'
export type GuideSection = { heading: string | null; step: GuideStep | null; body: string }

const STEP_MARK = /<!--\s*guide-step:\s*([a-z-]+)\s*-->\n*/

function guideStep(text: string): GuideStep | null {
  const name = STEP_MARK.exec(text)?.[1]
  return name === 'agents' || name === 'providers' ? name : null
}

// The body split at its `## ` headings, the text before the first one a section of its own.
export function guideSections(body: string): GuideSection[] {
  return body.split(/^(?=## )/m).filter((part) => part.trim()).map((part) => {
    const heading = /^## (.+)\n*/.exec(part)
    return heading?.[1]
      ? { heading: heading[1].trim(), step: guideStep(part), body: part.slice(heading[0].length).replace(STEP_MARK, '') }
      : { heading: null, step: null, body: part }
  })
}
