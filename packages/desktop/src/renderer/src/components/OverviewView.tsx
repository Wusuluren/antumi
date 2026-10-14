import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ChatDecision } from '@kando/protocol'
import { quickApproval, type ActionableItem } from '../attention'
import {
  openAttentionItem, perform, refreshAttentionSummaries, selectConversation, selectTask, setOverviewFilter,
  setOverviewOpen, setOverviewScroll, setRoutinesOpen, setSchedulesOpen, showView, useOverview, useCore, type OverviewFilter
} from '../core-store'
import { agentLabel, agoText, chatDayAndTime, timeOfDay } from '../labels'
import { laterByDay, waitBreakdown, type OverviewRow } from '../overview'
import { markRoutineAllSeen, runRoutineNow } from '../routines'
import { rescheduleRun, runScheduleNow, scheduleTime } from '../schedules'
import { projectNames } from './ProjectPicker'
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
  } else if (row.routineId) setRoutinesOpen(true)
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
      {row.projectPaths.length > 0 && <span className="overview-project" title={row.projectPaths.join('\n')}>{projectNames(row.projectPaths)}</span>}
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
            ? <button type="button" className="button" aria-label={`查看失败的${KIND_LABEL[row.kind]}：${row.title}`} onClick={() => row.kind === 'schedule' ? setSchedulesOpen(true) : setRoutinesOpen(true)}>{row.kind === 'schedule' ? '去预约页' : '查看'}</button>
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

const WEEKDAY = '日一二三四五六'
const RANGES = [
  { value: 'mine', label: '等我' }, { value: 'running', label: '在跑' }, { value: 'next', label: '接下来' }, { value: 'unread', label: '未读' }
] as const

export function OverviewView() {
  const data = useOverview()
  const [laterOpen, setLaterOpen] = useState(false)
  const filter = useCore((s) => s.overviewFilter)
  const connected = useCore((s) => s.connection === 'connected')
  const loading = useCore((s) => s.attentionSummaryLoading)
  const mode = useCore((s) => s.attentionSummaryMode)
  const error = useCore((s) => s.attentionSummaryError)
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const runs = useCore((s) => s.squadRuns)
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
  const emptyConfirmed = connected && !loading && !error && mode !== null
  const empty = Object.values(data.counts).every((count) => count === 0)
  const shows = (range: Exclude<OverviewFilter, null>) => (!filter || filter === range) && data.counts[range] > 0
  const nextUp = data.next.byTime[0] ?? data.next.later[0]
  const latestUnread = data.unread.at(-1)
  const foot: Record<Exclude<OverviewFilter, null>, ReactNode> = {
    mine: data.counts.mine > 0 ? waitBreakdown(data.mine) : '没有等你的事',
    running: working.length > 0
      ? <WorkingSummary activity={{ state: 'running', workers: working, detail: null }} detail={false} />
      : data.counts.running > 0 ? '正在开始' : '没有在跑的',
    next: nextUp ? `下一个 ${scheduleTime(nextUp.at, now)}` : data.next.byCondition.length > 0 ? `${data.next.byCondition.length} 项等条件` : '没有安排',
    unread: latestUnread ? `最近 ${agoText(latestUnread.at, now)}` : '都看过了'
  }
  const mine = shows('mine') && <Panel title="需要我" count={data.counts.mine}><Rows rows={data.mine} section="mine" /></Panel>
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
        <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => setOverviewOpen(false)}><CloseIcon /></button>
      </header>
      {!connected && <p className="attention-notice muted" role="status">尚未连接到 core，事项尚未更新。{!empty ? '以下为最近收到的信息。' : '连接后将显示工作总览。'}</p>}
      {connected && loading && <p className="attention-notice muted" role="status">正在读取待处理事项…</p>}
      {mode === 'limited' && <p className="attention-notice muted">当前 core 的任务聊天详情不完整</p>}
      {error && <div className="attention-notice attention-error" role="alert">
        <div>聊天摘要加载失败，事项可能不完整。<span className="muted">{error}</span></div>
        <button type="button" className="button ghost" disabled={!connected || loading} onClick={() => void refreshAttentionSummaries()}>重试</button>
      </div>}
      <div className="overview-kpis" role="group" aria-label="工作范围">
        {RANGES.map(({ value, label }) => <button type="button" key={value} className="overview-kpi" aria-pressed={filter === value}
          aria-label={`${label} ${data.counts[value]}`} data-waiting={value === 'mine' && data.counts.mine > 0 ? '' : undefined}
          onClick={() => {
            setOverviewFilter(filter === value ? null : value)
            if (page.current) page.current.scrollTop = 0
          }}>
          <span className="overview-kpi-label">{label}</span>
          <span className="overview-kpi-value">{data.counts[value]}</span>
          <span className="overview-kpi-foot">{foot[value]}</span>
        </button>)}
      </div>
      {/* What the user acts on to the left, what they only follow to the right; one column when
          only one side has anything, or when the pane is narrow. */}
      <div className="overview-grid" data-columns={(mine || unread) && (running || next) ? 2 : 1}>
        {(mine || unread) && <div className="overview-column">{mine}{unread}</div>}
        {(running || next) && <div className="overview-column">{running}{next}</div>}
      </div>
      {empty && emptyConfirmed && <p className="attention-empty muted">暂时没有进行中的工作</p>}
    </section>
  )
}
