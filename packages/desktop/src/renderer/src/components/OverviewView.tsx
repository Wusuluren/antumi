import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatDecision } from '@antumi/protocol'
import { quickApproval, type ActionableItem } from '../attention'
import {
  openAttentionItem, perform, refreshAttentionSummaries, selectConversation, selectTask, setConversationInspectorOpen,
  setConversationInspectorTab, setInspectorOpen, setOverviewFilter, setOverviewOpen, setOverviewScroll, setOverviewView, setRoutinesOpen,
  setSchedulesOpen, setTaskInspectorTab, showView, useDashboardSupported, useOverview, useCore, type OverviewFilter
} from '../core-store'
import { DashboardPanel } from './DashboardPanel'
import { Segmented } from './SettingsControls'
import { addQuote } from '../chat-quotes'
import { useAllTodos, useTodoOverviewSupported } from '../conversation-todos'
import { overviewTodos, type TodoEntry, type TodoLine } from '../overview-todos'
import { agentLabel, agoText, chatDayAndTime, timeOfDay } from '../labels'
import { laterByDay, waitBreakdown, type OverviewRow } from '../overview'
import { markRoutineAllSeen, runRoutineNow } from '../routines'
import { rescheduleRun, runScheduleNow, scheduleTime } from '../schedules'
import { primaryProjectName } from './ProjectPicker'
import { conversationActivity, latestSquadRun, taskActivity, type WorkActivity } from '../work-activity'
import { SchedulePicker } from './SchedulePicker'
import { WorkingSummary } from './WorkingSummary'
import { AgentIcon, BoardIcon, ChatIcon, ClockIcon, CloseIcon, RefreshIcon, SquadIcon } from './icons'

const KIND_ICON = { task: BoardIcon, conversation: ChatIcon, squad: SquadIcon, routine: RefreshIcon, schedule: ClockIcon }
const KIND_LABEL = { task: '任务', conversation: '会话', squad: '研发小队', routine: '定时任务', schedule: '预约' }

function openRow(row: OverviewRow): void {
  if (row.attention) return openAttentionItem(row.attention)
  const state = useCore.getState()
  const run = state.schedules.find((run) => run.id === row.scheduleId)
  const taskId = row.kind === 'task' || row.kind === 'squad' ? row.key.slice('task:'.length)
    : run?.target.kind === 'task' ? run.target.taskId : undefined
  if (taskId && state.tasks[taskId]) {
    selectTask(taskId)
    if (row.conversationId) {
      showView('chat')
      if (state.conversations[row.conversationId]?.squadRunId) useCore.setState({ taskMemberConversationId: row.conversationId })
    }
  } else if (row.conversationId && state.conversations[row.conversationId]) {
    selectConversation(row.conversationId)
  } else if (row.routineId) setRoutinesOpen(true, 'routines')
  else if (row.scheduleId) setSchedulesOpen(true)
}

function markSeen(row: OverviewRow): void {
  if (row.routineId) {
    markRoutineAllSeen(row.routineId)
    return
  }
  useCore.setState((state) => {
    const ids = new Set([row.conversationId])
    if (row.kind === 'task' || row.kind === 'squad') {
      const taskId = row.key.slice('task:'.length)
      ids.add(state.tasks[taskId]?.conversationId ?? undefined)
      for (const conversation of Object.values(state.conversations)) {
        if (conversation.taskId === taskId || (conversation.squadRunId && state.squadRuns[conversation.squadRunId]?.taskId === taskId)) ids.add(conversation.id)
      }
      for (const run of Object.values(state.squadRuns)) {
        if (run.taskId !== taskId) continue
        ids.add(run.leaderConversationId ?? undefined)
        for (const work of run.works) ids.add(work.conversationId ?? undefined)
      }
    }
    return { unseen: Object.fromEntries(Object.entries(state.unseen).filter(([id]) => !ids.has(id))) }
  })
}

function GoTo({ item, ghost = false }: { item: ActionableItem; ghost?: boolean }) {
  return <button type="button" className={ghost ? 'button ghost' : 'button'} aria-label={`去处理：${item.title}`} onClick={() => openAttentionItem(item)}>去处理</button>
}

// An approval that can be answered here gets its answers, and the chat only on hover.
function ApprovalActions({ item }: { item: ActionableItem }) {
  const [busy, setBusy] = useState(false)
  const { request, conversationId } = item
  const quick = conversationId && quickApproval(request) ? request : null
  const answer = async (decision: ChatDecision) => {
    if (!quick || !conversationId || busy) return
    setBusy(true)
    await perform((rpc) => rpc.call('conversations.respond', { id: conversationId, requestId: quick.requestId, decision }))
    setBusy(false)
  }
  if (!quick) return <GoTo item={item} />
  return (
    <>
      <span className="overview-secondary"><GoTo item={item} ghost /></span>
      <button type="button" className="button" disabled={busy} aria-label={`拒绝：${quick.title}`} onClick={() => void answer('deny')}>拒绝</button>
      <button type="button" className="button primary" disabled={busy} aria-label={`允许一次：${quick.title}`}
        data-tooltip="只允许这一次，不记规则" onClick={() => void answer('allow')}>允许</button>
    </>
  )
}

function Reschedule({ id }: { id: string }) {
  const run = useCore((s) => s.schedules.find((run) => run.id === id))
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  if (!run || run.target.kind === 'resume') return null
  return (
    <span className="menu-anchor">
      <button type="button" className="button ghost" aria-label={`改期：${run.title}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>改期</button>
      {open && <SchedulePicker title="改预约时间" initial={run.notBefore} submitLabel="保存" align="end"
        onSchedule={async (notBefore) => (await rescheduleRun(id, notBefore)) !== null} onClose={close} />}
    </span>
  )
}

function rowTaskId(row: OverviewRow): string | null {
  return row.kind === 'task' || row.kind === 'squad' ? row.key.slice('task:'.length) : null
}

// Who is at work on a running row, said as on the board.
function useRowActivity(row: OverviewRow): WorkActivity | null {
  const taskId = rowTaskId(row)
  const task = useCore((s) => (taskId ? s.tasks[taskId] : undefined))
  const conversation = useCore((s) => (row.conversationId ? s.conversations[row.conversationId] : undefined))
  const conversations = useCore((s) => s.conversations)
  const runs = useCore((s) => s.squadRuns)
  return useMemo(() => task ? taskActivity(task, conversations, runs)
    : conversation ? conversationActivity(conversation, conversation.agent) : null, [task, conversation, conversations, runs])
}

// A squad shows its members' agents, one of each; anything else the agent it runs on, or what it is.
function Avatar({ row }: { row: OverviewRow }) {
  const taskId = rowTaskId(row)
  const squad = useCore((s) => {
    const squadId = taskId ? s.tasks[taskId]?.squadId : null
    return squadId ? s.squads[squadId] ?? (taskId ? latestSquadRun(taskId, s.squadRuns)?.squad : undefined) : undefined
  })
  const agents = squad ? [...new Set(squad.members.map((member) => member.agent))].slice(0, 3) : []
  const Kind = KIND_ICON[row.kind]
  const label = [KIND_LABEL[row.kind], squad?.name ?? (row.agent ? agentLabel(row.agent) : '')].filter(Boolean).join(' · ')
  return (
    <span className="overview-avatar" role="img" aria-label={label}>
      {agents.length > 1 ? <span className="overview-avatar-stack">{agents.map((agent) => <AgentIcon key={agent} agent={agent} />)}</span>
        : agents[0] ?? row.agent ? <AgentIcon agent={agents[0] ?? row.agent} /> : <Kind />}
    </span>
  )
}

function useRunNow(row: OverviewRow) {
  const [busy, setBusy] = useState(false)
  const runningNow = useRef(false)
  const runNow = async () => {
    if (runningNow.current || busy) return
    runningNow.current = true
    setBusy(true)
    try {
      if (row.kind === 'schedule' && row.scheduleId) await runScheduleNow(row.scheduleId)
      else if (row.routineId) await runRoutineNow(row.routineId)
    } finally {
      runningNow.current = false
      setBusy(false)
    }
  }
  return { busy, runNow }
}

function Meta({ row, reason = false }: { row: OverviewRow; reason?: boolean }) {
  return (
    <div className="overview-meta">
      <span>{KIND_LABEL[row.kind]}</span>
      {row.projectPaths.length > 0 && <span className="overview-project" title={row.projectPaths.join('\n')}>{primaryProjectName(row.projectPaths)}</span>}
      {reason && row.reason && <span>{row.reason}</span>}
      {row.detail && <span>{row.detail}</span>}
    </div>
  )
}

// A row in a panel: who, what and why on the left, when and what to do on the right; what is
// done less often shows on hover.
function Row({ row, section }: { row: OverviewRow; section: 'mine' | 'running' | 'unread' }) {
  const activity = useRowActivity(row)
  const failure = row.failed
  const opens = section === 'running'
  return (
    <li>
      <div className="overview-row" role={opens ? 'button' : undefined} tabIndex={opens ? 0 : undefined}
        onClick={opens ? () => openRow(row) : undefined}
        onKeyDown={opens ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRow(row) } } : undefined}>
        <Avatar row={row} />
        <div className="overview-row-main">
          <div className="overview-row-title">
            <h4>{row.title}</h4>
            {section === 'mine' && <span className="overview-badge" data-reason={failure ? 'crashed' : row.attention?.primaryReason}>{row.reason}</span>}
          </div>
          <Meta row={row} />
          {section === 'running' && activity && <WorkingSummary activity={activity} />}
          {!!row.members?.length && <details className="overview-members">
            <summary>定位成员 · {row.members.length}</summary>
            <ul>{row.members.map((member) => <li className="overview-member" key={member.conversationId}>
              <span>{member.title}{member.request && ` · ${member.request.title}${member.request.open > 1 ? ` · 还有 ${member.request.open - 1} 项` : ''}`}</span>
              <span className="overview-actions"><ApprovalActions item={member} /></span>
            </li>)}</ul>
          </details>}
        </div>
        <time className="overview-time" dateTime={new Date(row.at).toISOString()} title={chatDayAndTime(row.at)}>{agoText(row.at)}</time>
        <div className="overview-actions">
          {section === 'mine' && (failure
            ? <button type="button" className="button" aria-label={`查看失败的${KIND_LABEL[row.kind]}：${row.title}`} onClick={() => row.kind === 'schedule' ? setSchedulesOpen(true) : setRoutinesOpen(true, 'routines')}>{row.kind === 'schedule' ? '去预约页' : '查看'}</button>
            : row.attention && <ApprovalActions item={row.attention} />)}
          {section === 'unread' && <>
            <span className="overview-secondary"><button type="button" className="button ghost" aria-label={`标为已读：${row.title}`} onClick={() => markSeen(row)}>标为已读</button></span>
            <button type="button" className="button" aria-label={`打开：${row.title}`} onClick={() => openRow(row)}>打开</button>
          </>}
        </div>
      </div>
    </li>
  )
}

// Something coming up, at its time on a line, the next of them marked.
function TimelineItem({ row, time, next }: { row: OverviewRow; time: string; next: boolean }) {
  const { busy, runNow } = useRunNow(row)
  const Icon = KIND_ICON[row.kind]
  return (
    <li className="overview-timeline-item" data-next={next ? '' : undefined}>
      <time dateTime={new Date(row.at).toISOString()}>{time}</time>
      <span className="overview-timeline-dot" aria-hidden="true" />
      <div className="overview-row-main">
        <div className="overview-row-title"><span className="overview-kind" role="img" aria-label={KIND_LABEL[row.kind]}><Icon /></span><h4>{row.title}</h4></div>
        <Meta row={row} reason={!time} />
      </div>
      <div className="overview-actions overview-secondary">
        {row.scheduleId && row.kind === 'schedule' && <Reschedule id={row.scheduleId} />}
        {(row.kind === 'schedule' ? row.scheduleId : row.routineId) && <button type="button" className="button ghost" disabled={busy} aria-label={`立即运行：${row.title}`} onClick={() => void runNow()}>立即运行</button>}
      </div>
    </li>
  )
}

function Timeline({ rows, time, next }: { rows: OverviewRow[]; time: (row: OverviewRow) => string; next?: string }) {
  return <ol className="overview-timeline">{rows.map((row) => <TimelineItem key={row.key} row={row} time={time(row)} next={row.key === next} />)}</ol>
}

function Panel({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="overview-panel" aria-label={title}>
      <header><h3>{title}</h3><span className="overview-count">{count}</span></header>
      {children}
    </section>
  )
}

function Rows({ rows, section }: { rows: OverviewRow[]; section: 'mine' | 'running' | 'unread' }) {
  return <ul className="overview-rows">{rows.map((row) => <Row key={row.key} row={row} section={section} />)}</ul>
}

// Where a conversation's (or its task's) to-dos are: its chat, with the inspector on them.
function openTodos(entry: TodoEntry): void {
  if (entry.taskId) {
    selectTask(entry.taskId)
    showView('chat')
    setInspectorOpen(true)
    setTaskInspectorTab('todos')
  } else {
    selectConversation(entry.conversationId)
    setConversationInspectorOpen(true)
    setConversationInspectorTab('todos')
  }
}

// Items checked off on this visit to the overview, kept on show (done) until the user leaves it.
const KeepChecked = createContext<(itemId: string) => void>(() => {})

// One item: checked off here as in its conversation, and unchecked again while it is still on show;
// one its agent can take on is handed to it as the to-dos panel does, a quote waiting in that chat's
// input for the user to send.
function TodoLineView({ entry, line }: { entry: TodoEntry; line: TodoLine }) {
  const [busy, setBusy] = useState(false)
  const keep = useContext(KeepChecked)
  const { done } = line.item
  const check = async () => {
    setBusy(true)
    keep(line.item.id)
    await perform((rpc) => rpc.call('todos.check', { id: entry.conversationId, groupId: line.groupId, itemId: line.item.id, done: !done }))
    setBusy(false)
  }
  return (
    <li className="overview-todo-line" data-owner={line.item.owner} data-done={done || undefined}>
      <input type="checkbox" checked={done} disabled={busy} aria-label={`${done ? '取消完成' : '完成'}：${line.item.text}`} onChange={() => void check()} />
      <span className="overview-todo-text">{line.item.text}</span>
      <span className="overview-todo-group">{line.group}{line.note ? ` · ${line.note}` : ''}</span>
      {line.item.owner === 'agent' && !done && <span className="overview-actions overview-secondary">
        <button type="button" className="button ghost" aria-label={`交给 Agent：${line.item.text}`} data-tooltip="打开会话，放进输入框，让 Agent 去做"
          onClick={() => {
            addQuote(entry.conversationId, null, line.item.text, '请处理这一项待办，做完后在待办里把它勾掉。')
            openTodos(entry)
          }}>交给 Agent</button>
      </span>}
    </li>
  )
}

const SHOWN_TODOS = 3

function TodoEntryView({ entry, now }: { entry: TodoEntry; now: number }) {
  const more = entry.lines.length - SHOWN_TODOS
  return (
    <li className="overview-todo">
      <button type="button" className="overview-todo-head" onClick={() => openTodos(entry)}>
        <span className="overview-avatar" aria-hidden="true"><AgentIcon agent={entry.agent} /></span>
        <span className="overview-todo-title">{entry.title}</span>
        <span className="overview-count">{entry.mine + entry.agents > 0 ? `${entry.mine + entry.agents} 项` : '都做完了'}</span>
        {entry.stale && <span className="overview-badge" title={chatDayAndTime(entry.updatedAt)}>{Math.floor((now - entry.updatedAt) / 86_400_000)} 天没动</span>}
      </button>
      <ul className="overview-todo-lines">
        {entry.lines.slice(0, SHOWN_TODOS).map((line) => <TodoLineView key={line.item.id} entry={entry} line={line} />)}
      </ul>
      {more > 0 && <button type="button" className="link-button overview-todo-more" onClick={() => openTodos(entry)}>还有 {more} 项</button>}
    </li>
  )
}

const WEEKDAY = '日一二三四五六'
const PANES = [{ value: 'now', label: '现在' }, { value: 'stats', label: '统计' }] as const

export function OverviewView() {
  const data = useOverview()
  const [laterOpen, setLaterOpen] = useState(false)
  const filter = useCore((s) => s.overviewFilter)
  // The stats are the overview's other side, where core keeps them.
  const statsSupported = useDashboardSupported()
  const chosenPane = useCore((s) => s.overviewView)
  const pane = statsSupported ? chosenPane : 'now'
  const connected = useCore((s) => s.connection === 'connected')
  const loading = useCore((s) => s.attentionSummaryLoading)
  const mode = useCore((s) => s.attentionSummaryMode)
  const error = useCore((s) => s.attentionSummaryError)
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const runs = useCore((s) => s.squadRuns)
  const todosSupported = useTodoOverviewSupported()
  const allTodos = useAllTodos()
  const [withArchived, setWithArchived] = useState(false)
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set())
  const keep = useCallback((itemId: string) => setKept((current) => current.has(itemId) ? current : new Set(current).add(itemId)), [])
  const page = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (page.current) page.current.scrollTop = useCore.getState().overviewScroll
  }, [])
  const now = Date.now()
  // Everyone at work across the running rows, for the head.
  const working = useMemo(() => data.running.flatMap((row) => {
    const taskId = rowTaskId(row)
    const task = taskId ? tasks[taskId] : undefined
    const conversation = row.conversationId ? conversations[row.conversationId] : undefined
    const activity = task ? taskActivity(task, conversations, runs) : conversation ? conversationActivity(conversation, conversation.agent) : null
    return activity?.workers ?? []
  }), [data.running, tasks, conversations, runs])
  // What is left to do across conversations: not waiting on anyone, so apart from 等我.
  const todos = overviewTodos(allTodos, conversations, tasks, now, withArchived, kept)
  const counts = { ...data.counts, todos: todos.mine + todos.agents }
  const ranges = [
    { value: 'mine', label: '等我' },
    ...(todosSupported ? [{ value: 'todos', label: '待办' } as const] : []),
    { value: 'running', label: '在跑' }, { value: 'next', label: '接下来' }, { value: 'unread', label: '未读' }
  ] as const
  const emptyConfirmed = connected && !loading && !error && mode !== null
  const empty = Object.values(counts).every((count) => count === 0)
  const shows = (range: Exclude<OverviewFilter, null>) => (!filter || filter === range) && counts[range] > 0
  const nextUp = data.next.byTime[0] ?? data.next.later[0]
  const latestUnread = data.unread.at(-1)
  const foot: Record<Exclude<OverviewFilter, null>, ReactNode> = {
    mine: data.counts.mine > 0 ? waitBreakdown(data.mine) : '没有等你的事',
    todos: counts.todos > 0 ? [todos.mine > 0 && `${todos.mine} 件归你`, todos.agents > 0 && `${todos.agents} 件 Agent 可接着做`].filter(Boolean).join(' · ') : '没有待办',
    running: working.length > 0
      ? <WorkingSummary activity={{ state: 'running', workers: working, detail: null }} detail={false} />
      : data.counts.running > 0 ? '正在开始' : '没有在跑的',
    next: nextUp ? `下一个 ${scheduleTime(nextUp.at, now)}` : data.next.byCondition.length > 0 ? `${data.next.byCondition.length} 项等条件` : '没有安排',
    unread: latestUnread ? `最近 ${agoText(latestUnread.at, now)}` : '都看过了'
  }
  const mine = shows('mine') && <Panel title="需要我" count={data.counts.mine}><Rows rows={data.mine} section="mine" /></Panel>
  const todoPanel = todosSupported && (!filter || filter === 'todos') && (todos.entries.length > 0 || todos.archived > 0) && <Panel title="待办" count={counts.todos}>
    {todos.entries.length > 0 && <KeepChecked.Provider value={keep}>
      <ul className="overview-todos">{todos.entries.map((entry) => <TodoEntryView key={entry.conversationId} entry={entry} now={now} />)}</ul>
    </KeepChecked.Provider>}
    {todos.archived > 0 && <button type="button" className="overview-day overview-disclosure" aria-expanded={withArchived}
      onClick={() => setWithArchived(!withArchived)}>{withArchived ? '不看' : '也看'}已归档会话的 {todos.archived} 项</button>}
  </Panel>
  const unread = shows('unread') && <Panel title="未读" count={data.counts.unread}><Rows rows={data.unread} section="unread" /></Panel>
  const running = shows('running') && <Panel title="进行中" count={data.counts.running}><Rows rows={data.running} section="running" /></Panel>
  const next = shows('next') && <Panel title="接下来" count={data.counts.next}>
    {data.next.byTime.length > 0 && <><h4 className="overview-day">今天</h4><Timeline rows={data.next.byTime} time={(row) => timeOfDay(row.at)} next={nextUp?.key} /></>}
    {data.next.later.length > 0 && <>
      <button type="button" className="overview-day overview-disclosure" aria-expanded={laterOpen} onClick={() => setLaterOpen(!laterOpen)}>明天及以后 {data.next.later.length} 项</button>
      {laterOpen && laterByDay(data.next.later, now).map(({ day, rows }) => <div key={day}>
        <h4 className="overview-day">{day}</h4>
        <Timeline rows={rows} time={(row) => timeOfDay(row.at)} next={nextUp?.key} />
      </div>)}
    </>}
    {data.next.byCondition.length > 0 && <><h4 className="overview-day">等条件</h4><Timeline rows={data.next.byCondition} time={() => ''} /></>}
  </Panel>
  const today = new Date(now)
  return (
    <section ref={page} className="worktrees-page overview-page" aria-label="总览" onScroll={(event) => setOverviewScroll(event.currentTarget.scrollTop)}>
      <header className="worktrees-header">
        <div className="worktrees-heading">
          <h2>总览</h2>
          <p className="muted">{today.getMonth() + 1}月{today.getDate()}日 周{WEEKDAY[today.getDay()]}</p>
        </div>
        {statsSupported && <>
          <Segmented labelId="overview-pane" value={pane} options={PANES} onChange={(next) => {
            setOverviewView(next)
            if (page.current) page.current.scrollTop = 0
          }} />
          <span id="overview-pane" hidden>总览的内容</span>
        </>}
        <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => setOverviewOpen(false)}><CloseIcon /></button>
      </header>
      {pane === 'stats' ? <DashboardPanel /> : <>
      {!connected && <p className="attention-notice muted" role="status">尚未连接到 core，事项尚未更新。{!empty ? '以下为最近收到的信息。' : '连接后将显示工作总览。'}</p>}
      {connected && loading && <p className="attention-notice muted" role="status">正在读取待处理事项…</p>}
      {mode === 'limited' && <p className="attention-notice muted">当前 core 的任务聊天详情不完整</p>}
      {error && <div className="attention-notice attention-error" role="alert">
        <div>聊天摘要加载失败，事项可能不完整。<span className="muted">{error}</span></div>
        <button type="button" className="button ghost" disabled={!connected || loading} onClick={() => void refreshAttentionSummaries()}>重试</button>
      </div>}
      <div className="overview-kpis" role="group" aria-label="工作范围" data-count={ranges.length}>
        {ranges.map(({ value, label }) => <button type="button" key={value} className="overview-kpi" aria-pressed={filter === value}
          aria-label={`${label} ${counts[value]}`} data-waiting={value === 'mine' && data.counts.mine > 0 ? '' : undefined}
          onClick={() => {
            setOverviewFilter(filter === value ? null : value)
            if (page.current) page.current.scrollTop = 0
          }}>
          <span className="overview-kpi-label">{label}</span>
          <span className="overview-kpi-value">{counts[value]}</span>
          <span className="overview-kpi-foot">{foot[value]}</span>
        </button>)}
      </div>
      {/* What the user acts on to the left, what they only follow to the right; one column when
          only one side has anything, or when the pane is narrow. */}
      <div className="overview-grid" data-columns={(mine || todoPanel || unread) && (running || next) ? 2 : 1}>
        {(mine || todoPanel || unread) && <div className="overview-column">{mine}{todoPanel}{unread}</div>}
        {(running || next) && <div className="overview-column">{running}{next}</div>}
      </div>
      {empty && emptyConfirmed && <p className="attention-empty muted">暂时没有进行中的工作</p>}
      </>}
    </section>
  )
}
