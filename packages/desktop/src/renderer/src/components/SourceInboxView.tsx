import { useEffect, useState, type ReactNode } from 'react'
import type { SourceInbox, SourceIssue, Task } from '@kando/protocol'
import { openConversationDraft, perform, selectConversation, selectTask, setInboxOpen, setInboxTab, setSettingsOpen, useCore, useSourceInvestigateSupported } from '../core-store'
import { defaultAgent } from '../default-agent'
import { sourceProblemText } from '../labels'
import { activeInboxes, inboxKey, inboxTab, investigationProjects, type ActiveInbox } from '../source-inboxes'
import { CloseIcon, GearIcon, InboxIcon, RefreshIcon } from './icons'

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

function updatedOn(ms: number): string {
  const date = new Date(ms)
  const day = `${date.getMonth() + 1}月${date.getDate()}日`
  return date.getFullYear() === new Date().getFullYear() ? day : `${date.getFullYear()}年${day}`
}

export const settingsSectionOf = (provider: string) => `source-${provider}`

function IssueRow({ issue, name, busy, investigating = false, children }: { issue: SourceIssue; name: string; busy: boolean; investigating?: boolean; children: ReactNode }) {
  return (
    <li className="inbox-row" aria-busy={busy || undefined}>
      <div className="inbox-row-text">
        <div className="inbox-row-meta">
          <a className="inbox-key" href={issue.url} target="_blank" rel="noreferrer" data-tooltip={`在 ${name} 中打开`} data-tooltip-align="start">
            {issue.key}
          </a>
          {issue.priority && <span className="inbox-priority">{issue.priority}</span>}
          {issue.type && <span>{issue.type}</span>}
          <span className="inbox-status" data-category={issue.statusCategory}>
            {issue.status}
          </span>
          {issue.updatedAt !== null && <span>更新于 {updatedOn(issue.updatedAt)}</span>}
          {investigating && <span className="inbox-investigating">排查中</span>}
        </div>
        <div className="inbox-row-title">{issue.title}</div>
      </div>
      <div className="inbox-row-actions">{children}</div>
    </li>
  )
}

// One tab per inbox. What waits behind the others is out of sight, so each tab carries its count
// and whether its last sync failed.
function InboxTabs({ active, selected }: { active: readonly ActiveInbox[]; selected: string }) {
  return (
    <div className="inbox-tabs" role="tablist" aria-label="任务来源">
      {active.map(({ key, inbox, name }) => (
        <button key={key} type="button" role="tab" aria-selected={key === selected} onClick={() => setInboxTab(key)}>
          {name}
          {inbox.problem && <span className="inbox-tab-alert" role="img" aria-label="同步失败" />}
          {inbox.items.length > 0 && <span className="count">{inbox.items.length}</span>}
        </button>
      ))}
    </div>
  )
}

// One source instance's share of the inbox; each issue becomes a task, is looked into in a
// conversation first, or is set aside. Under tabs, the tabs take the place of its name.
function InboxSection({
  inbox,
  name,
  tabs,
  onImported
}: {
  inbox: SourceInbox
  name: string
  tabs?: ReactNode
  onImported: (task: Task) => void
}) {
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const investigateSupported = useSourceInvestigateSupported()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const target = { provider: inbox.provider, instance: inbox.instance }

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key)
    await action()
    setBusyKey(null)
  }
  const importIssue = (key: string) =>
    act(key, async () => {
      const task = await perform((rpc) => rpc.call('sources.import', { ...target, key, agent: defaultAgent(tasks) }))
      if (task) {
        onImported(task)
      }
    })
  // The new-conversation page, with the issue on it: the agent, projects and mode are picked there.
  const investigate = (issue: SourceIssue) => openConversationDraft(investigationProjects(inboxKey(inbox)),
    { provider: inbox.provider, instance: inbox.instance, key: issue.key, title: issue.title, url: issue.url, source: name })
  // The conversation looking into it, while it is still here to open.
  const lookedInto = (issue: SourceIssue) => (issue.conversationId && conversations[issue.conversationId] ? issue.conversationId : null)
  const dismiss = (key: string) => act(key, () => perform((rpc) => rpc.call('sources.dismiss', { ...target, key })))
  const restore = (key: string) => act(key, () => perform((rpc) => rpc.call('sources.restore', { ...target, key })))
  const refresh = () => void perform((rpc) => rpc.call('sources.refresh', target))
  const openSettings = () => setSettingsOpen(true, settingsSectionOf(inbox.provider))

  return (
    <section className="inbox-section" aria-label={`${name} 收件箱`}>
      <header className="inbox-section-header">
        {tabs ?? (
          <>
            <h3>{name}</h3>
            <span className="muted">{inbox.items.length} 个待处理</span>
          </>
        )}
        <div className="toolbar">
          <span className="muted inbox-synced">
            {inbox.refreshing ? '同步中…' : inbox.refreshedAt !== null ? `${clock(inbox.refreshedAt)} 同步` : ''}
          </span>
          <button type="button" className="tool-button" aria-label="立即同步" data-tooltip="立即同步" aria-busy={inbox.refreshing || undefined} onClick={refresh}>
            <RefreshIcon />
          </button>
          <button type="button" className="tool-button" aria-label={`${name} 设置`} data-tooltip={`${name} 设置`} onClick={openSettings}>
            <GearIcon />
          </button>
        </div>
      </header>

      <div className="inbox-section-body" role={tabs ? 'tabpanel' : undefined}>
        {inbox.problem && (
          <p className="inbox-error" role="alert">
            同步失败：{sourceProblemText(inbox.problem)}
            <button type="button" className="link-button" onClick={openSettings}>
              检查设置
            </button>
          </p>
        )}

        {inbox.items.length > 0 ? (
          <ul className="inbox-list">
            {inbox.items.map((issue) => {
              const conversationId = lookedInto(issue)
              return (
              <IssueRow key={issue.key} issue={issue} name={name} busy={busyKey === issue.key} investigating={conversationId !== null}>
                {conversationId && (
                  <button type="button" className="button primary" onClick={() => selectConversation(conversationId)}>
                    看会话
                  </button>
                )}
                <button type="button" className={conversationId ? 'button' : 'button primary'} disabled={busyKey !== null} onClick={() => void importIssue(issue.key)}>
                  导入任务
                </button>
                {investigateSupported && !conversationId && (
                  <button type="button" className="button" disabled={busyKey !== null} data-tooltip="开一个只读会话查清原因，确认后可以就在会话里修" onClick={() => investigate(issue)}>
                    会话排查
                  </button>
                )}
                <button type="button" className="button ghost" disabled={busyKey !== null} onClick={() => void dismiss(issue.key)}>
                  忽略
                </button>
              </IssueRow>
              )
            })}
          </ul>
        ) : (
          <p className="inbox-empty">
            {inbox.refreshedAt !== null
              ? '没有新的 issue：符合条件的都已经导入或忽略了。'
              : inbox.problem
                ? '同步成功后，issue 会出现在这里。'
                : '正在第一次同步…'}
          </p>
        )}

        {inbox.dismissed.length > 0 && (
          <div className="inbox-dismissed">
            <button type="button" className="link-button" aria-expanded={showDismissed} onClick={() => setShowDismissed(!showDismissed)}>
              {showDismissed ? '收起' : '查看'}已忽略的 {inbox.dismissed.length} 个
            </button>
            {showDismissed && (
              <ul className="inbox-list">
                {inbox.dismissed.map((issue) => (
                  <IssueRow key={issue.key} issue={issue} name={name} busy={busyKey === issue.key}>
                    <button type="button" className="button" disabled={busyKey !== null} onClick={() => void restore(issue.key)}>
                      恢复
                    </button>
                  </IssueRow>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// Every task source that is set up and signed in: one section, or a tab each once there are two.
// A page of its own, opened from the sidebar, so it closes as the overview does.
function InboxHeader() {
  return (
    <header className="worktrees-header">
      <div className="worktrees-heading">
        <h2>收件箱</h2>
        <p className="muted">从任务来源同步来的 issue：导入成任务，或先开会话排查。</p>
      </div>
      <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => setInboxOpen(false)}>
        <CloseIcon />
      </button>
    </header>
  )
}

export function SourceInboxView() {
  const sources = useCore((s) => s.sources)
  const inboxes = useCore((s) => s.inboxes)
  const wanted = useCore((s) => s.inboxTab)
  const [imported, setImported] = useState<Task | null>(null)
  const active = activeInboxes(sources, inboxes)
  const tabbed = active.length > 1
  const selected = tabbed ? inboxTab(active, wanted) : null

  // Pin the tab once it is shown, so importing its last issue does not switch to another source.
  useEffect(() => {
    if (selected !== null && selected !== wanted) {
      setInboxTab(selected)
    }
  }, [selected, wanted])

  if (active.length === 0) {
    const first = sources?.[0]
    return (
      <section className="worktrees-page inbox-page" aria-label="收件箱">
        <InboxHeader />
        <div className="inbox-setup">
          <InboxIcon />
          <p>还没有连接任务来源。在设置里填好地址并登录后，分给你的 issue 会自动出现在这里。</p>
          <button type="button" className="button primary" onClick={() => setSettingsOpen(true, first ? settingsSectionOf(first.provider) : null)}>
            去设置
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="worktrees-page inbox-page" aria-label="收件箱">
      <InboxHeader />
      {imported && (
        <p className="restore-bar" role="status">
          已导入为任务「{imported.title}」，下一步给它选上项目。
          <button type="button" className="link-button" onClick={() => selectTask(imported.id)}>
            打开任务
          </button>
        </p>
      )}
      {active
        .filter((entry) => !tabbed || entry.key === selected)
        .map(({ key, inbox, name }) => (
          <InboxSection
            key={key}
            inbox={inbox}
            name={name}
            tabs={selected !== null ? <InboxTabs active={active} selected={selected} /> : undefined}
            onImported={setImported}
          />
        ))}
    </section>
  )
}
