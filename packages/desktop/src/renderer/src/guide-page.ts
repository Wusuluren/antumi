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
