import { useHelper, useHelperSupported } from '../helper-conversations'
import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { usePlans } from '../chat-state'
import { markRoutineRunSeen, openBeside, selectConversation, selectDiscussion, setConversationInspectorOpen, setRoutinesOpen, useCore, useWireLogShown } from '../core-store'
import { conversationState } from '../conversation-state'
import { agentLabel } from '../labels'
import { primaryProjectName } from './ProjectPicker'
import { BranchStatus } from './BranchStatus'
import { SourceLink } from './SourceLink'
import { ConversationChat } from './ConversationChat'
import { ConversationInspector } from './ConversationInspector'
import { ConversationStatus } from './ConversationStatus'
import { beginHandoff, renameConversation } from './ConversationActions'
import { CloseIcon, InspectorIcon, SplitIcon } from './icons'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { DEFAULT_SIDE_PANEL_RATIO } from './side-panel-size'
import { EMPTY_FILE_TABS, useFileTabs } from '../file-tabs'
import { TitleEditor } from './TitleEditor'
import { useOpenTodoCount, useTodosSupported } from '../conversation-todos'
import { CONVERSATION_DRAG_TYPE, draggedConversation } from '../conversation-drag'
import type { ConversationPane } from './conversation-pane'
import type { Conversation } from '@antumi/protocol'

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

// Whether the conversation has anything for the inspector to show, and what its button says.
export function useConversationPanel(conversation: Conversation | undefined) {
  const id = conversation?.id ?? ''
  const helperSupported = useHelperSupported(conversation)
  const files = useFileTabs((state) => state[id] ?? EMPTY_FILE_TABS)
  const plans = usePlans(id)
  const wire = useWireLogShown()
  const todosShown = useTodosSupported()
  const todoLeft = useOpenTodoCount(todosShown && conversation ? id : null)
  // A managed workspace is Antumi's own scratch folder: nothing of the user's to compare, but the
  // inspector still shows the agent's plans.
  const inspectable = (conversation?.projectPaths.length ?? 0) > 0
  const hasPanel = helperSupported || inspectable || plans.length > 0 || wire || files.tabs.length > 0 || todosShown
  const hint = todoLeft > 0 ? `检查器 · ${todoLeft} 项待办` : inspectable ? '查看改动' : plans.length > 0 ? '查看计划' : wire ? '查看原始数据' : '查看待办'
  return { hasPanel, wire, todoLeft, hint }
}

// One conversation: the whole pane, or, in a split, one of its two columns (pane), whose header
// says which and closes the column rather than the conversation. A split's inspector is its own.
export function ConversationView({ id, pane }: { id: string; pane?: ConversationPane & { onClose: () => void } }) {
  const conversation = useCore((state) => state.conversations[id])
  const helperSupported = useHelperSupported(conversation)
  const helper = useHelper(helperSupported ? id : null)
  // Stable, so the chat's surface is not rebuilt on every render.
  const openHandoff = useCallback(() => {
    const current = useCore.getState().conversations[id]
    if (current) beginHandoff(current)
  }, [id])
  const [renaming, setRenaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const inspectorOpen = useCore((state) => state.conversationInspectorOpen)
  const [panelRatio, setPanelRatio] = useState(DEFAULT_SIDE_PANEL_RATIO)
  const { hasPanel, wire, todoLeft, hint } = useConversationPanel(conversation)
  // A conversation dragged from the list over the right half opens there, beside this one.
  const [dropping, setDropping] = useState(false)
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
  const state = conversationState(conversation)
  const archived = conversation.archivedAt != null
  const action = async (run: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    await run()
    setBusy(false)
  }
  const rename = (title: string) => void action(() => renameConversation(id, title))
  const inspecting = inspectorOpen && (!pane || pane.active)
  const dropProps = pane ? {} : {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(CONVERSATION_DRAG_TYPE) || draggedConversation() === id) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (!dropping) setDropping(true)
    },
    onDragLeave: (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDropping(false)
    },
    onDrop: (event: DragEvent) => {
      const dropped = event.dataTransfer.getData(CONVERSATION_DRAG_TYPE)
      setDropping(false)
      if (dropped && dropped !== id) {
        event.preventDefault()
        openBeside(dropped)
      }
    }
  }
  return <section
    className="detail terminal-view conversation-view"
    aria-label={pane ? `第 ${pane.index + 1} 列：${conversation.title}` : `${conversation.title} 的会话`}
    data-split-pane={pane ? pane.index + 1 : undefined}
    data-pane-active={pane ? pane.active : undefined}
    // Working anywhere in a column brings it to the front, the click or key going on as it was.
    onPointerDownCapture={pane && !pane.active ? pane.focus : undefined}
    onFocusCapture={pane && !pane.active ? pane.focus : undefined}
    {...dropProps}
  >
    <header className="detail-header conversation-header">
      {pane && <button type="button" className="pane-chip" data-active={pane.active} aria-label={`第 ${pane.index + 1} 列${pane.active ? '，当前' : ''}（${PRIMARY_KEY_LABEL}${pane.index + 1}）`} data-tooltip={`${PRIMARY_KEY_LABEL}${pane.index + 1}`} onClick={pane.focus}>{pane.index + 1}</button>}
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
        {conversation.source && <span className="muted conversation-origin">排查 {conversation.source.name}<SourceLink source={conversation.source} /></span>}
        {conversation.routineId && (
          <span className="muted conversation-origin">
            来自定时任务{routine ? `「${routine.title}」` : ''} ·
            <button type="button" className="link-button" onClick={() => setRoutinesOpen(true, 'routines')}>回到定时任务</button>
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
        {hasPanel && (
          <button
            type="button"
            className="tool-button"
            aria-label={todoLeft > 0 ? `检查器，${todoLeft} 项待办` : '检查器'}
            aria-pressed={inspecting}
            data-tooltip={inspecting ? '收起检查器' : hint}
            onClick={() => setConversationInspectorOpen(!inspecting)}
          >
            <InspectorIcon />
            {helper?.chat?.turn === 'awaiting' && <span className="helper-attention-dot tool-button-dot" role="img" aria-label="小助手等你处理" />}
            {!inspecting && todoLeft > 0 && <span className="tool-button-badge" aria-hidden="true">{todoLeft}</span>}
          </button>
        )}
        <span className="toolbar-separator" aria-hidden="true" />
        {pane
          ? <button type="button" className="tool-button" aria-label="关闭这一列" data-tooltip="关闭这一列" onClick={pane.onClose}><CloseIcon /></button>
          : <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => selectConversation(null)}><CloseIcon /></button>}
      </div>
    </header>
    <div className="terminal-body">
      <ConversationChat conversation={conversation} onHandoff={conversation.discussionId ? undefined : openHandoff} />
      {!pane && hasPanel && inspectorOpen && <ConversationInspector conversation={conversation} widthRatio={panelRatio} onWidthRatioChange={setPanelRatio} wire={wire} />}
    </div>
    {dropping && <div className="split-drop" aria-hidden="true"><SplitIcon /><strong>松开，在右侧分屏打开</strong></div>}
  </section>
}
