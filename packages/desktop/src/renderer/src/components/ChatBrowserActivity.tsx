import { localized, t } from '../i18n'
import type { ChatItem, ChatToolStatus } from '@antumi/protocol'
import { browserActivity } from '../browser-activity'
import { toolLabel } from '../chat-tools'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
const SETTLED: Record<Exclude<ChatToolStatus, 'running'>, string> = localized(() => ({
  done: t('ChatBrowserActivity.browserActionCompleted'), failed: t('ChatBrowserActivity.browserActionFailed'), denied: t('ChatBrowserActivity.browserActionDenied'), interrupted: t('ChatBrowserActivity.browserActionInterrupted')
}))

// A schematic, never a screenshot: motion follows the actual tool action, not a simulated workflow.
export function ChatBrowserActivity({ tool, status = tool.status }: { tool: ToolItem; status?: ChatToolStatus }) {
  const activity = browserActivity(tool)
  if (!activity) return null
  return (
    <div className="chat-browser-activity" data-status={status} data-action={activity.action}>
      <div key={`${tool.stageId}/${tool.id}`} className="chat-browser-scene" aria-hidden="true">
        <div className="chat-browser-window">
          <div className="chat-browser-chrome">
            <span className="chat-browser-window-dots"><i /><i /><i /></span>
            <span className="chat-browser-address" title={activity.address ?? undefined}>{activity.address ?? t('BrowserSidePanel.browser')}</span>
            <span className="chat-browser-schematic">{t('ChatBrowserActivity.illustration')}</span>
          </div>
          <div className="chat-browser-loading" />
          <div className="chat-browser-page">
            <div className="chat-browser-page-label">{toolLabel(tool.name, tool.display)}</div>
            <div className="chat-browser-page-line" /><div className="chat-browser-page-line" data-short />
            <div className="chat-browser-page-field"><span className="chat-browser-typed" /></div>
            <div className="chat-browser-page-line" />
          </div>
          <span className="chat-browser-click-ring" /><span className="chat-browser-cursor" />
        </div>
      </div>
      <div className="chat-browser-activity-caption" role="status">
        <span className="chat-browser-activity-dot" aria-hidden="true" />
        <span>{status === 'running' ? activity.label : SETTLED[status]}</span>
      </div>
    </div>
  )
}
