import { useEffect } from 'react'
import Markdown, { type Components } from 'react-markdown'
import { openGuide, openOverview, useCore } from '../core-store'
import { guideFor, guideImage } from '../guide-page'
import { t, useLocale } from '../i18n'
import { remarkPlugins } from '../markdown-syntax'
import { setPreference, usePreferences } from '../preferences'
import { newConversation } from './ConversationActions'

// Shown once, over the overview, to someone who has nothing in Antumi yet. Whoever already has
// work there is taken to know their way, and is never shown it unasked.
export function useFirstRunGuide(): void {
  const connected = useCore((s) => s.connection === 'connected')
  useEffect(() => {
    if (!connected || usePreferences.getState().guideSeen) return
    setPreference('guideSeen', true)
    const s = useCore.getState()
    if (s.overviewOpen && Object.keys(s.tasks).length === 0 && Object.keys(s.conversations).length === 0) openGuide()
  }, [connected])
}

// The guide is the app's own text: its images are bundled with it, its links go to the web.
const components: Components = {
  img: ({ node: _node, src, alt }) => {
    const url = typeof src === 'string' ? guideImage(src) : undefined
    // Taken at twice their size: shown at half their pixels, they read as the app does.
    return url ? <img src={url} alt={alt ?? ''} onLoad={(event) => { event.currentTarget.style.width = `${event.currentTarget.naturalWidth / 2}px` }} /> : null
  },
  a: ({ node: _node, href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>
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
      <div className="chat-markdown guide-markdown"><Markdown remarkPlugins={remarkPlugins} components={components}>{body}</Markdown></div>
    </section>
  )
}
