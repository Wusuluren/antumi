import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ChatDecision } from '@kando/protocol'
import { quickApproval, type ActionableItem } from '../attention'
import {
  openAttentionItem, perform, refreshAttentionSummaries, selectConversation, selectTask, setOverviewFilter,
  setOverviewOpen, setOverviewScroll, setRoutinesOpen, setSchedulesOpen, showView, useOverview, useCore
} from '../core-store'
import { agentLabel, chatDayAndTime } from '../labels'
import type { OverviewRow } from '../overview'
import { markRoutineAllSeen, runRoutineNow } from '../routines'
import { rescheduleRun, runScheduleNow, scheduleTime } from '../schedules'
import { projectNames } from './ProjectPicker'
import { SchedulePicker } from './SchedulePicker'
import { BoardIcon, ChatIcon, ClockIcon, CloseIcon, RefreshIcon, SquadIcon } from './icons'

type Section = 'mine' | 'running' | 'next' | 'unread'
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
  return (
    <>
      <button type="button" className="button ghost" aria-label={`去处理：${item.title}`} onClick={() => openAttentionItem(item)}>去处理</button>
      {quick && <>
        <button type="button" className="button" disabled={busy} aria-label={`拒绝：${quick.title}`} onClick={() => void answer('deny')}>拒绝</button>
        <button type="button" className="button primary" disabled={busy} aria-label={`允许一次：${quick.title}`}
          data-tooltip="只允许这一次，不记规则" onClick={() => void answer('allow')}>允许</button>
      </>}
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

function Row({ row, section, timed = false }: { row: OverviewRow; section: Section; timed?: boolean }) {
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
  const Icon = KIND_ICON[row.kind]
  const runs = useCore((s) => s.schedules)
  const run = runs.find((run) => run.id === row.scheduleId)
  const planned = timed || (section === 'next' && run?.resetsAt != null)
  const failure = row.failed
  return (
    <li className="overview-item">
      <div className="attention-row" role={section === 'running' ? 'button' : undefined} tabIndex={section === 'running' ? 0 : undefined}
        onClick={section === 'running' ? () => openRow(row) : undefined}
        onKeyDown={section === 'running' ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRow(row) } } : undefined}>
        <div className="attention-row-content">
          <div className="attention-row-heading">
            <span className="overview-kind" role="img" aria-label={KIND_LABEL[row.kind]}><Icon /></span>
            <h3>{row.title}</h3>
            <span className="attention-reason" data-reason={failure ? 'crashed' : row.attention?.primaryReason}>{row.reason}</span>
          </div>
          <div className="attention-row-meta">
            {row.agent && <span>{agentLabel(row.agent)}</span>}
            <span className="attention-project" title={row.projectPaths.join('\n')}>{projectNames(row.projectPaths)}</span>
            {row.detail && <span>{row.detail}</span>}
          </div>
        </div>
        {(section !== 'next' || planned) && <time className="overview-time" dateTime={new Date(row.at).toISOString()}>
          {planned ? scheduleTime(row.at, Date.now()) : `更新于 ${chatDayAndTime(row.at)}`}
        </time>}
        <div className="attention-row-actions">
          {section === 'mine' && (failure
            ? <button type="button" className="button ghost" aria-label={`查看失败的${KIND_LABEL[row.kind]}：${row.title}`} onClick={() => row.kind === 'schedule' ? setSchedulesOpen(true) : setRoutinesOpen(true)}>{row.kind === 'schedule' ? '去预约页' : '查看'}</button>
            : row.attention && <ApprovalActions item={row.attention} />)}
          {section === 'next' && row.scheduleId && row.kind === 'schedule' && <>
            <Reschedule id={row.scheduleId} />
            <button type="button" className="button" disabled={busy} aria-label={`立即运行：${row.title}`} onClick={() => void runNow()}>立即运行</button>
          </>}
          {section === 'next' && row.routineId && <button type="button" className="button" disabled={busy} aria-label={`立即运行：${row.title}`}
            onClick={() => void runNow()}>立即运行</button>}
          {section === 'unread' && <>
            <button type="button" className="button ghost" aria-label={`打开：${row.title}`} onClick={() => openRow(row)}>打开</button>
            <button type="button" className="button" aria-label={`标为已读：${row.title}`} onClick={() => markSeen(row)}>标为已读</button>
          </>}
        </div>
      </div>
      {!!row.members?.length && <details className="overview-members">
        <summary>定位成员 · {row.members.length}</summary>
        <ul className="attention-list">{row.members.map((member) => <li className="overview-member" key={member.conversationId}>
          <span>{member.title}{member.request && ` · ${member.request.title}${member.request.open > 1 ? ` · 还有 ${member.request.open - 1} 项` : ''}`}</span>
          <div className="attention-row-actions"><ApprovalActions item={member} /></div>
        </li>)}</ul>
      </details>}
    </li>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="overview-group" aria-label={title}><h3 className="overview-group-title">{title}</h3>{children}</section>
}
function Rows({ rows, section, timed = false }: { rows: OverviewRow[]; section: Section; timed?: boolean }) {
  return <ul className="attention-list">{rows.map((row) => <Row key={row.key} row={row} section={section} timed={timed} />)}</ul>
}

export function OverviewView() {
  const data = useOverview()
  const [laterOpen, setLaterOpen] = useState(false)
  const filter = useCore((s) => s.overviewFilter)
  const connected = useCore((s) => s.connection === 'connected')
  const loading = useCore((s) => s.attentionSummaryLoading)
  const mode = useCore((s) => s.attentionSummaryMode)
  const error = useCore((s) => s.attentionSummaryError)
  const page = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (page.current) page.current.scrollTop = useCore.getState().overviewScroll
  }, [])
  const emptyConfirmed = connected && !loading && !error && mode !== null
  const empty = Object.values(data.counts).every((count) => count === 0)
  return (
    <section ref={page} className="worktrees-page overview-page" aria-label="总览" onScroll={(event) => setOverviewScroll(event.currentTarget.scrollTop)}>
      <header className="worktrees-header">
        <div className="worktrees-heading">
          <h2>总览</h2>
          <div className="overview-filters">
            <div className="overview-switches" role="group" aria-label="工作范围">
              {(['mine', 'running', 'next'] as const).map((value) => <button type="button" key={value} aria-pressed={filter === value}
                onClick={() => {
                  setOverviewFilter(filter === value ? null : value)
                  if (page.current) page.current.scrollTop = 0
                }}>{value === 'mine' ? '等我' : value === 'running' ? '在跑' : '接下来'} {data.counts[value]}</button>)}
            </div>
            <span className="overview-unread">未读 {data.counts.unread}</span>
          </div>
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
      {(!filter || filter === 'mine') && data.mine.length > 0 && <Group title="需要我"><Rows rows={data.mine} section="mine" /></Group>}
      {(!filter || filter === 'running') && data.running.length > 0 && <Group title="进行中"><Rows rows={data.running} section="running" /></Group>}
      {(!filter || filter === 'next') && data.counts.next > 0 && <Group title="接下来">
        {(data.next.byTime.length > 0 || data.next.later.length > 0) && <div className="overview-next-group">
          <h4>按时间</h4>
          {data.next.byTime.length > 0 && <Rows rows={data.next.byTime} section="next" timed />}
          {data.next.later.length > 0 && <div className="overview-later">
            <button type="button" className="overview-disclosure" aria-expanded={laterOpen} onClick={() => setLaterOpen(!laterOpen)}>明天及以后 {data.next.later.length} 项</button>
            {laterOpen && <Rows rows={data.next.later} section="next" timed />}
          </div>}
        </div>}
        {data.next.byCondition.length > 0 && <div className="overview-next-group"><h4>等条件</h4><Rows rows={data.next.byCondition} section="next" /></div>}
      </Group>}
      {!filter && data.unread.length > 0 && <Group title="未读"><Rows rows={data.unread} section="unread" /></Group>}
      {empty && emptyConfirmed && <p className="attention-empty muted">暂时没有进行中的工作</p>}
    </section>
  )
}
