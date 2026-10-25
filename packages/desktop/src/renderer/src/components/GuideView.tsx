import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import { openOverview, setSettingsOpen, useCore } from '../core-store'
import { guideFor, guideImage, guideSections, guideSettingsSection, type GuideSection } from '../guide-page'
import { guideStepDone } from '../guide-steps'
import { getLocale, t, useLocale } from '../i18n'
import { remarkPlugins } from '../markdown-syntax'
import { usePreferences } from '../preferences'
import { newConversation } from './ConversationActions'

// The guide is the app's own text: its images are bundled with it, its links go to the web.
const components: Components = {
  img: ({ node: _node, src, alt }) => {
    const url = typeof src === 'string' ? guideImage(src) : undefined
    // Taken at twice their size: shown at half their pixels, they read as the app does.
    return url ? <img src={url} alt={alt ?? ''} onLoad={(event) => { event.currentTarget.style.width = `${event.currentTarget.naturalWidth / 2}px` }} /> : null
  },
  a: ({ node: _node, href, children }) => {
    const section = href ? guideSettingsSection(href) : null
    if (section) return <a href={href} onClick={(event) => { event.preventDefault(); setSettingsOpen(true, section) }}>{children}</a>
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>
  }
}

// Markdown drops a link it does not know the scheme of; the guide's own settings links stay.
function urlTransform(url: string): string {
  return guideSettingsSection(url) ? url : defaultUrlTransform(url)
}

// A step already done here folds away under its heading, saying what stands, and opens on a click.
function Section({ section }: { section: GuideSection }) {
  const environment = useCore((s) => s.environment)
  const providers = useCore((s) => s.modelProviders)
  const disabled = usePreferences((s) => s.disabledAgents)
  const done = section.step ? guideStepDone(section.step, { environment, disabled, providers, locale: getLocale() }) : null
  const text = section.heading ? `## ${section.heading}\n\n${section.body}` : section.body
  if (!done || !section.heading) return <Markdown remarkPlugins={remarkPlugins} components={components} urlTransform={urlTransform}>{text}</Markdown>
  return (
    <details className="guide-step-done">
      <summary>
        <h2>{section.heading}</h2>
        <span className="guide-step-status"><span className="environment-pill" data-level="ok">{t('GuideView.stepDone')}</span>{done}</span>
      </summary>
      <Markdown remarkPlugins={remarkPlugins} components={components} urlTransform={urlTransform}>{section.body}</Markdown>
    </details>
  )
}

export function GuideView() {
  const locale = useLocale((s) => s.locale)
  const { title, body } = guideFor(locale)
  return (
    <section className="worktrees-page guide-page" aria-label={t('GuideView.guide')}>
      <header className="worktrees-header">
        <div className="worktrees-heading">
          <h2>{title}</h2>
        </div>
        <button type="button" className="button" onClick={openOverview}>{t('GuideView.backToOverview')}</button>
        <button type="button" className="button primary" onClick={() => newConversation()}>{t('GuideView.startFirstConversation')}</button>
      </header>
      <div className="chat-markdown guide-markdown">
        {guideSections(body).map((section, index) => <Section key={section.heading ?? index} section={section} />)}
      </div>
    </section>
  )
}
