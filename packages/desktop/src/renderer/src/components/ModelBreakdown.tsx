import { Fragment, useState } from 'react'
import { MIN_DECIDED_RUNS, type DashboardModel } from '@antumi/protocol'
import { workedFor } from '../chat-tools'
import { acceptance } from '../dashboard-model'
import { agentLabel } from '../labels'
import { compact, durationText, percent } from '../stat-format'
import { AgentIcon, ChevronRightIcon } from './icons'

const key = (row: DashboardModel) => `${row.agent}:${row.model ?? ''}`

// A count, with its share once there are enough for a share to mean much.
function share(count: number, whole: number): string {
  return whole >= MIN_DECIDED_RUNS && count > 0 ? `${count}（${percent(count, whole)}）` : String(count)
}

// What the columns leave out: how judged runs went besides acceptance, and how turns broke off. Absent
// on a core that does not report it.
export function modelDetails(row: DashboardModel): string[] {
  if (row.continued === undefined) return []
  const lines: string[] = []
  if (row.decided > 0) {
    lines.push(`任务：判定 ${row.decided} 次，接受 ${share(row.accepted, row.decided)} · 继续修改 ${share(row.continued, row.decided)} · 重做 ${share(row.redone ?? 0, row.decided)}`)
  }
  if (row.turns > 0) {
    const failed = row.failedTurns ?? 0
    const limited = row.usageLimitTurns ?? 0
    lines.push([
      `对话：失败 ${share(failed, row.turns)}${limited > 0 ? `（撞额度 ${limited}）` : ''}`,
      `中断 ${share(row.interruptedTurns ?? 0, row.turns)}`,
      ...(row.medianTurnMs == null ? [] : [`每回合耗时中位 ${workedFor(row.medianTurnMs)}`])
    ].join(' · '))
  }
  return lines
}

// Each agent and model of the range, with its share of the tokens; a row opens on what its columns leave out.
export function ModelBreakdown({ models }: { models: readonly DashboardModel[] }) {
  const total = models.reduce((sum, row) => sum + row.tokens, 0)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current)
    if (!next.delete(id)) next.add(id)
    return next
  })
  const expandable = models.some((row) => modelDetails(row).length > 0)
  return (
    <section className="dashboard-panel" aria-labelledby="dashboard-models">
      <header className="dashboard-panel-header">
        <h3 id="dashboard-models">按 Agent 和模型</h3>
      </header>
      {models.length === 0 ? (
        <p className="dashboard-empty muted">这段时间没有运行、对话或轻量请求。</p>
      ) : (
        <table className="dashboard-models">
          <thead>
            <tr>
              <th scope="col">模型</th>
              <th scope="col" title="这段时间结束的任务运行">运行</th>
              <th scope="col" title="判定过的运行里直接接受的比例，判定太少时不算">接受率</th>
              <th scope="col" title="一次运行从开始到交付，含你中间的时间">耗时中位</th>
              <th scope="col" title="对话里结束的回合">回合</th>
              <th scope="col" title="任务运行、对话回合和轻量请求读写的 token">token</th>
            </tr>
          </thead>
          <tbody>
            {models.map((row) => {
              const rate = acceptance(row.accepted, row.decided)
              const id = key(row)
              const lines = modelDetails(row)
              const expanded = open.has(id) && lines.length > 0
              const name = (
                <span className="dashboard-model-name">
                  {expandable && <span className="dashboard-model-chevron" data-hidden={lines.length === 0 || undefined}><ChevronRightIcon /></span>}
                  <AgentIcon agent={row.agent} />
                  <span className="muted">{agentLabel(row.agent)}</span>
                  {row.model ?? <span className="muted">未知模型</span>}
                </span>
              )
              return (
                <Fragment key={id}>
                  <tr>
                    <th scope="row">
                      {lines.length > 0 ? (
                        <button type="button" className="dashboard-model-toggle" aria-expanded={expanded} onClick={() => toggle(id)}>{name}</button>
                      ) : name}
                    </th>
                    <td>{row.runs}</td>
                    <td>{rate === null ? <span className="muted">—</span> : percent(row.accepted, row.decided)}</td>
                    <td>{row.runs === 0 ? <span className="muted">—</span> : durationText(row.medianRunMs)}</td>
                    <td>{row.turns}</td>
                    <td>
                      <span className="dashboard-share">
                        {compact(row.tokens)}
                        <span className="dashboard-share-track" title={total > 0 ? percent(row.tokens, total) : undefined}>
                          <span style={{ width: `${total > 0 ? (row.tokens / total) * 100 : 0}%` }} />
                        </span>
                      </span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="dashboard-model-detail">
                      <td colSpan={6}>{lines.map((line) => <p key={line}>{line}</p>)}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
