import type { SquadRun, SquadWork } from '@kando/protocol'
import { perform } from '../core-store'
import { ChatMarkdown } from './ChatMarkdown'
import { AgentIcon } from './icons'

const STATES: Record<SquadWork['state'], string> = { queued: '排队', starting: '准备中', running: '执行中', awaiting: '等你回答', completed: '已完成', failed: '失败', cancelled: '已停止' }
export function SquadWorkPanel({ runs, onConversation }: { runs: readonly SquadRun[]; onConversation(id: string): void }) {
  if (!runs.length) return <p className="muted">还没有小队运行记录。</p>
  return <div className="squad-work-panel">{runs.map((run, index) => <section key={run.id} className="squad-run">
    <header className="squad-run-heading"><strong>{run.squad.name}</strong><span className="muted">{index > 0 ? '历史运行' : run.state === 'review' ? '待验收' : run.state === 'paused' ? '已暂停' : run.state === 'cancelled' ? '已结束' : '开发中'}</span></header>
    {index === 0 && (run.state === 'running' || run.state === 'paused') && <div className="squad-run-actions"><button type="button" className="button ghost" onClick={() => void perform((rpc) => rpc.call('squads.control', { id: run.id, action: run.state === 'paused' ? 'resume' : 'stop' }))}>{run.state === 'paused' ? '继续小队' : '停止小队'}</button></div>}
    <ul className="squad-roster">{run.squad.members.map((member) => <li key={member.id}><AgentIcon agent={member.agent} /><span>{member.name}{member.id === run.squad.leaderId ? ' · 队长' : ''}</span><span className="muted">{member.role}</span></li>)}</ul>
    {run.works.map((work) => <article key={work.id} className="squad-work">
      <header><strong>{run.squad.members.find((member) => member.id === work.memberId)?.name}</strong><span className="status-pill">{run.works.some((each) => each.retryOf === work.id) ? '已重试' : STATES[work.state]}</span></header>
      <p className="squad-work-instruction">{work.instruction}</p>
      {work.error && <p className="modal-error">{work.error}</p>}
      {work.result && <details><summary>工作结果</summary><ChatMarkdown text={work.result} /></details>}
      <div className="squad-run-actions">{work.conversationId && work.state !== 'starting' && <button type="button" className="link-button" onClick={() => { if (work.conversationId) onConversation(work.conversationId) }}>查看成员会话</button>}
        {index === 0 && (run.state === 'running' || run.state === 'paused') && (work.state === 'failed' || work.state === 'cancelled') && !run.works.some((each) => each.retryOf === work.id) && <button type="button" className="link-button" onClick={() => void perform((rpc) => rpc.call('squads.retry', { id: run.id, workId: work.id }))}>重试工作</button>}
      </div>
    </article>)}
    {run.summary && <details open><summary>交付摘要</summary><ChatMarkdown text={run.summary} /></details>}
  </section>)}</div>
}
