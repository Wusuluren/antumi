import { useMemo } from 'react'
import { localized, t } from '../i18n'
import type { ChatItem, ChatToolStatus } from '@antumi/protocol'
import { browserActivity } from '../browser-activity'
import { browserRunTabs, hostLine } from '../chat-browser'
import { toolLabel, toolRunStatus } from '../chat-tools'
import { showBrowserTab } from '../core-store'
import { ExternalIcon } from './icons'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
const SETTLED: Record<Exclude<ChatToolStatus, 'running'>, string> = localized(() => ({
  done: t('ChatBrowserWindow.browserActionCompleted'), failed: t('ChatBrowserWindow.browserActionFailed'), denied: t('ChatBrowserWindow.browserActionDenied'), interrupted: t('ChatBrowserWindow.browserActionInterrupted')
}))

// A turn's browser work as a small browser window: a schematic, never a screenshot, whose motion
// follows the call running. Its tabs are the ones the turn left open, each a way into the panel.
export function ChatBrowserWindow({ tools }: { tools: readonly ToolItem[] }) {
  const tabs = useMemo(() => browserRunTabs(tools), [tools])
  const tool = tools.find((each) => each.status === 'running') ?? tools.at(-1)
  const activity = tool ? browserActivity(tool) : null
  if (!tool || !activity) return null
  const status = toolRunStatus(tools).status
  const { open, current, closed } = tabs
  const caption = status === 'running' ? activity.label : SETTLED[status]
  // Nothing left to open: what became of the tabs is all there is to say.
  if (status !== 'running' && !open.length && closed) {
    return (
      <div className="chat-browser-activity" data-status={status} data-gone>
        <div className="chat-browser-gone">{t('ChatBrowserWindow.tabsClosed', { count: closed })}</div>
      </div>
    )
  }
  const address = current ? hostLine(current.url) : activity.address
  const label = status === 'running' ? toolLabel(tool.name, tool.display) : current?.title || address || toolLabel(tool.name, tool.display)
  return (
    <div className="chat-browser-activity" data-status={status} data-action={activity.action}>
      <div key={`${tool.stageId}/${tool.id}`} className="chat-browser-scene" data-tabs={open.length > 0 || undefined}>
        <div className="chat-browser-window">
          {open.length > 0 && (
            <div className="chat-browser-tabs">
              {open.map((tab) => {
                const name = tab.title || hostLine(tab.url)
                return (
                  <button key={tab.id} type="button" className="chat-browser-tab" data-active={tab.id === current?.id || undefined} title={t('ChatBrowserWindow.openTab', { title: name })} onClick={() => showBrowserTab(tab.id)}>
                    <i className="chat-browser-tab-dot" aria-hidden="true" /><span>{name}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="chat-browser-bar">
            <span className="chat-browser-address mono" title={current?.url ?? activity.address ?? undefined}>{address ?? t('BrowserSidePanel.browser')}</span>
            {current && (
              <button type="button" className="chat-browser-open" title={t('ChatBrowserWindow.openInPanel')} onClick={() => showBrowserTab(current.id)}>
                {t('ChatBrowserCard.open')}<ExternalIcon />
              </button>
            )}
          </div>
          <div className="chat-browser-loading" aria-hidden="true" />
          <div className="chat-browser-body" aria-hidden="true">
            <div className="chat-browser-page">
              <div className="chat-browser-page-label">{label}</div>
              <div className="chat-browser-page-line" /><div className="chat-browser-page-line" data-short />
              <div className="chat-browser-page-field"><span className="chat-browser-typed" /></div>
              <div className="chat-browser-page-button" />
            </div>
            <span className="chat-browser-click-ring" /><span className="chat-browser-cursor" />
          </div>
        </div>
      </div>
      <div className="chat-browser-activity-caption" role="status">
        <span className="chat-browser-activity-dot" aria-hidden="true" />
        <span>{caption}</span>
      </div>
    </div>
  )
}
