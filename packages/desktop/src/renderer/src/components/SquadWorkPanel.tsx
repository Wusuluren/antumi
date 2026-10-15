import { useState } from 'react'
import type { SquadRun, SquadWork } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { clockText, memberProgress, orderedWorks, workHeadline, type MemberProgress, type MemberState } from '../squad-progress'
import { durationText } from '../stat-format'
import { useNow } from '../usage-format'
import { ChatMarkdown } from './ChatMarkdown'
import { AgentIcon } from './icons'
import { Spinner } from './Spinner'

// Ended work the panel shows before the rest folds away.
const RECENT_ENDED = 3

const RUN_STATE: Record<SquadRun['state'], string> = { running: '开发中', review: '待验收', paused: '已暂停', cancelled: '已结束' }
const MEMBER_STATE: Record<MemberState, string> = { awaiting: '等你回答', running: '在执行', starting: '准备中', queued: '排队', idle: '空闲' }

// A state as the panel says it, one way everywhere: only what runs moves.
function StateMark({ state, since, now }: { state: MemberState | SquadWork['state'] | 'retried'; since?: number | null; now: number }) {
  switch (state) {
    case 'running':
    case 'starting':
      return <span className="squad-state" data-state="running"><Spinner />{since ? <span className="squad-clock">{clockText(now - since)}</span> : state === 'starting' ? '准备中' : '在执行'}</span>
    case 'awaiting':
      return <span className="squad-state" data-state="awaiting"><span className="squad-dot" />等你回答</span>
    case 'queued':
      return <span className="squad-state" data-state="queued"><span className="squad-dot" />排队</span>
    case 'completed':
      return <span className="squad-state" data-state="done">✓ 完成</span>
    case 'failed':
      return <span className="squad-state" data-state="failed">✕ 失败</span>
    case 'cancelled':
      return <span className="squad-state" data-state="idle">已停止</span>
    case 'retried':
      return <span className="squad-state" data-state="idle">已重试</span>
    case 'idle':
      return <span className="squad-state" data-state="idle">空闲</span>
  }
}

function MemberRow({ progress, now, onConversation }: { progress: MemberProgress; now: number; onConversation(id: string): void }) {
  const { member, leader, state, detail, conversationId, since } = progress
  const open = conversationId
  return (
    <li>
      <button type="button" className="squad-member" data-state={state} disabled={!open} title={open ? `打开${member.name}的会话` : undefined} onClick={() => { if (open) onConversation(open) }}>
        <AgentIcon agent={member.agent} />
        <span className="squad-member-name"><strong>{member.name}</strong>{leader && <span className="muted">队长</span>}</span>
        <span className="squad-member-state" data-state={state}>
          {state === 'running' || state === 'starting' ? <><Spinner />{MEMBER_STATE[state]}</> : state === 'idle' ? MEMBER_STATE.idle : <><span className="squad-dot" />{MEMBER_STATE[state]}</>}
        </span>
        {(detail || since) && (
          <span className="squad-member-detail">
            {detail && <span className="squad-member-doing">{detail}</span>}
            {since && (state === 'running' || state === 'starting') && <span className="squad-clock">{clockText(now - since)}</span>}
          </span>
        )}
      </button>
    </li>
  )
}

function WorkRow({ run, work, live, now, onConversation }: { run: SquadRun; work: SquadWork; live: boolean; now: number; onConversation(id: string): void }) {
  const [open, setOpen] = useState(false)
  const member = run.squad.members.find((each) => each.id === work.memberId)
  const retried = run.works.some((each) => each.retryOf === work.id)
  const retry = live && (work.state === 'failed' || work.state === 'cancelled') && !retried
  const conversationId = work.state !== 'starting' ? work.conversationId : null
  const ended = work.state === 'completed' || work.state === 'failed' || work.state === 'cancelled'
  const actions = (
    <>
      {conversationId && <button type="button" className="button ghost" onClick={() => onConversation(conversationId)}>看会话</button>}
      {retry && <button type="button" className="button ghost" onClick={() => void perform((rpc) => rpc.call('squads.retry', { id: run.id, workId: work.id }))}>重试</button>}
    </>
  )
  return (
    <li className="squad-work" data-open={open || undefined}>
      <div className="squad-work-row">
        <button type="button" className="squad-work-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {member && <AgentIcon agent={member.agent} />}
          <span className="squad-work-text"><span className="muted">{member?.name}</span>{workHeadline(work.instruction)}</span>
        </button>
        <span className="squad-work-status">
          <StateMark state={retried ? 'retried' : work.state} since={work.state === 'running' || work.state === 'starting' ? work.updatedAt : null} now={now} />
          {ended && work.state === 'completed' && <span className="squad-clock">{durationText(work.updatedAt - work.createdAt)}</span>}
        </span>
        {(conversationId || retry) && <span className="squad-work-actions">{actions}</span>}
      </div>
      {open && (
        <div className="squad-work-detail">
          <h4>指令</h4>
          <p className="squad-work-instruction">{work.instruction}</p>
          {work.error && <p className="modal-error">{work.error}</p>}
          {work.result && <><h4>结果</h4><div className="squad-work-result"><ChatMarkdown text={work.result} /></div></>}
          {(conversationId || retry) && <div className="squad-work-detail-actions">{actions}</div>}
        </div>
      )}
    </li>
  )
}

function RunSection({ run, current, now, onConversation }: { run: SquadRun; current: boolean; now: number; onConversation(id: string): void }) {
  const conversations = useCore((state) => state.conversations)
  const [showAll, setShowAll] = useState(false)
  const live = current && (run.state === 'running' || run.state === 'paused')
  const members = memberProgress(run, conversations)
  const { open, ended } = orderedWorks(run.works)
  const shown = showAll ? ended : ended.slice(0, RECENT_ENDED)
  const working = members.filter((member) => member.state === 'running' || member.state === 'starting' || member.state === 'awaiting').length
  const queued = members.filter((member) => member.state === 'queued').length
  const done = run.works.filter((work) => work.state === 'completed').length
  const summary = [working && `${working} 人在干`, queued && `${queued} 人排队`, done && `完成 ${done} 项`].filter(Boolean).join(' · ')
  return (
    <section className="squad-run">
      <header className="squad-run-heading">
        <strong>{run.squad.name}</strong>
        <span className="muted">{current ? RUN_STATE[run.state] : '历史运行'}{summary && ` · ${summary}`}</span>
        {live && <button type="button" className="button ghost" onClick={() => void perform((rpc) => rpc.call('squads.control', { id: run.id, action: run.state === 'paused' ? 'resume' : 'stop' }))}>{run.state === 'paused' ? '继续小队' : '停止小队'}</button>}
      </header>
      {current && (
        <ul className="squad-members" aria-label="成员">
          {members.map((progress) => <MemberRow key={progress.member.id} progress={progress} now={now} onConversation={onConversation} />)}
        </ul>
      )}
      {run.works.length > 0 && (
        <div className="squad-works">
          <h3 className="squad-works-heading"><span>工作</span><span className="muted">{[open.length && `${open.length} 进行中`, ended.length && `${ended.length} 已结束`].filter(Boolean).join(' · ')}</span></h3>
          <ul>
            {[...open, ...shown].map((work) => <WorkRow key={work.id} run={run} work={work} live={live} now={now} onConversation={onConversation} />)}
          </ul>
          {ended.length > RECENT_ENDED && <button type="button" className="squad-works-more" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : `更早的 ${ended.length - RECENT_ENDED} 条`}</button>}
        </div>
      )}
      {run.summary && <details open={current}><summary>交付摘要</summary><ChatMarkdown text={run.summary} /></details>}
    </section>
  )
}

// A task's squad at work: who works now and at what, then each piece of work a line of its own,
// opened in place for its instruction and result; the whole of it is in the member's conversation.
export function SquadWorkPanel({ runs, onConversation }: { runs: readonly SquadRun[]; onConversation(id: string): void }) {
  const now = useNow(1000)
  if (!runs.length) return <p className="muted">还没有小队运行记录。</p>
  return (
    <div className="squad-work-panel">
      {runs.map((run, index) => <RunSection key={run.id} run={run} current={index === 0} now={now} onConversation={onConversation} />)}
    </div>
  )
}
