import { useCallback, useEffect, useState } from 'react'
import { usePlans } from '../chat-state'
import { markRoutineRunSeen, selectConversation, selectDiscussion, setConversationInspectorOpen, setRoutinesOpen, useCore, useWireLogShown } from '../core-store'
import { conversationState } from '../conversation-state'
import { agentLabel } from '../labels'
import { primaryProjectName } from './ProjectPicker'
import { BranchStatus } from './BranchStatus'
import { ConversationChat } from './ConversationChat'
import { ConversationInspector } from './ConversationInspector'
import { ConversationStatus } from './ConversationStatus'
import { beginHandoff, renameConversation } from './ConversationActions'
import { CloseIcon, HandoffIcon, InspectorIcon } from './icons'
import { DEFAULT_SIDE_PANEL_RATIO } from './side-panel-size'
import { EMPTY_FILE_TABS, useFileTabs } from '../file-tabs'
import { TitleEditor } from './TitleEditor'
import { useOpenTodoCount, useTodosSupported } from '../conversation-todos'

// Where a fork came from: a way back while the source is still here.
function ForkOrigin({ id }: { id: string }) {
  const source = useCore((state) => state.conversations[id])
  return (
    <span className="muted conversation-origin">
      {source
        ? <>从「<button type="button" className="link-button" onClick={() => selectConversation(id)}>{source.title}</button>」fork</>
        : 'fork 自一条已删除的会话'}
    </span>
  )
}

export function ConversationView({ id }: { id: string }) {
  const conversation = useCore((state) => state.conversations[id])
  // Stable, so the chat's surface is not rebuilt on every render.
  const openHandoff = useCallback(() => {
    const current = useCore.getState().conversations[id]
    if (current) beginHandoff(current)
  }, [id])
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const inspectorOpen = useCore((state) => state.conversationInspectorOpen)
  const [panelRatio, setPanelRatio] = useState(DEFAULT_SIDE_PANEL_RATIO)
  const files = useFileTabs((state) => state[id] ?? EMPTY_FILE_TABS)
  const plans = usePlans(id)
  const wire = useWireLogShown()
  const todosShown = useTodosSupported()
  const todoLeft = useOpenTodoCount(todosShown ? id : null)
  const routine = useCore((state) => state.routines.find((each) => each.id === conversation?.routineId) ?? null)
  const discussion = useCore((state) => (conversation?.discussionId ? state.discussions[conversation.discussionId] : undefined) ?? null)
  const routineId = conversation?.routineId ?? null
  const turn = conversation?.chat?.turn ?? null
  // Looking at a routine's conversation, with the window in front, is looking at its run: when
  // it opens, when the window comes back, and when the run ends while it is in view.
  useEffect(() => {
    if (!routineId) return
    const look = () => { if (document.hasFocus()) markRoutineRunSeen(id) }
    look()
    window.addEventListener('focus', look)
    return () => window.removeEventListener('focus', look)
  }, [id, routineId, turn])
  if (!conversation) return null
  // The agent starts with the next message and goes when idle: no continue or stop to press.
  // A managed workspace is Kando's own scratch folder: nothing of the user's to compare, but the
  // inspector still shows the agent's plans.
  const inspectable = conversation.projectPaths.length > 0
  const hasPanel = inspectable || plans.length > 0 || wire || files.tabs.length > 0 || todosShown
  const state = conversationState(conversation)
  const archived = conversation.archivedAt != null
  const action = async (run: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    await run()
    setBusy(false)
  }
  const rename = (title: string) => void action(() => renameConversation(id, title))
  return <section className="detail terminal-view conversation-view" aria-label={`${conversation.title} 的会话`}>
    <header className="detail-header conversation-header">
      <ConversationStatus conversation={conversation} />
      <div className="header-meta">
        {renaming
          ? <TitleEditor title={conversation.title} label="会话标题" onSave={rename} onDone={() => setRenaming(false)} />
          : <button type="button" className="terminal-view-title conversation-title" title={`${conversation.title}\n点击重命名`} disabled={busy} onClick={() => setRenaming(true)}>{conversation.title}</button>}
        <span className="muted">{agentLabel(conversation.agent)}</span>
        <span className="muted" title={conversation.projectPaths.join('\n') || conversation.workspacePath}>{primaryProjectName(conversation.projectPaths)}</span>
        <BranchStatus target={{ kind: 'conversation', id }} updatedAt={conversation.updatedAt} />
        <span className={state.failed ? 'conversation-exit-failed' : 'muted'} title={state.detail ?? undefined}>{state.label}</span>
        {archived && <span className="archived-tag">已归档</span>}
        {conversation.forkedFromId && <ForkOrigin id={conversation.forkedFromId} />}
        {conversation.routineId && (
          <span className="muted conversation-origin">
            来自定时任务{routine ? `「${routine.title}」` : ''} ·
            <button type="button" className="link-button" onClick={() => setRoutinesOpen(true)}>回到定时任务</button>
          </span>
        )}
        {conversation.discussionId && (
          <span className="muted conversation-origin" title="在这里发的消息只有这个成员看到，不进群聊">
            群聊{discussion ? `「${discussion.title}」` : ''}的成员 ·
            <button type="button" className="link-button" onClick={() => conversation.discussionId && selectDiscussion(conversation.discussionId)}>回到群聊</button>
          </span>
        )}
      </div>
      <div className="toolbar">
        {!conversation.discussionId && <button type="button" className="tool-button" aria-label="移交给其他智能体" data-tooltip="移交给其他智能体" disabled={busy || archived} onClick={openHandoff}><HandoffIcon /></button>}
        {hasPanel && (
          <button
            type="button"
            className="tool-button"
            aria-label={todoLeft > 0 ? `检查器，${todoLeft} 项待办` : '检查器'}
            aria-pressed={inspectorOpen}
            data-tooltip={inspectorOpen ? '收起检查器' : todoLeft > 0 ? `检查器 · ${todoLeft} 项待办` : inspectable ? '查看改动' : plans.length > 0 ? '查看计划' : wire ? '查看原始数据' : '查看待办'}
            onClick={() => setConversationInspectorOpen(!inspectorOpen)}
          >
            <InspectorIcon />
            {!inspectorOpen && todoLeft > 0 && <span className="tool-button-badge" aria-hidden="true">{todoLeft}</span>}
          </button>
        )}
        <span className="toolbar-separator" aria-hidden="true" />
        <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => selectConversation(null)}><CloseIcon /></button>
      </div>
    </header>
    <div className="terminal-body">
      <ConversationChat conversation={conversation} onHandoff={conversation.discussionId ? undefined : openHandoff} />
      {hasPanel && inspectorOpen && <ConversationInspector conversation={conversation} widthRatio={panelRatio} onWidthRatioChange={setPanelRatio} wire={wire} />}
    </div>
  </section>
}
