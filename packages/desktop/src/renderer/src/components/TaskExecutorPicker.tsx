import { AgentKind, type Task } from '@kando/protocol'
import { updateTask, useCore } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'

export function TaskExecutorPicker({ task }: { task: Task }) {
  const squads = useCore((state) => state.squads)
  const agents = useInstalledAgents()
  const squad = task.squadId ? squads[task.squadId] : null
  return <label className="task-executor-picker"><span className="muted">执行者</span>
    <select className="input" aria-label="任务执行者" disabled={task.status !== 'pending'} value={task.squadId ? `squad:${task.squadId}` : task.agent ?? ''} onChange={(event) => {
      const value = event.target.value
      if (value.startsWith('squad:')) void updateTask(task.id, { squadId: value.slice(6) })
      else { const parsed = AgentKind.safeParse(value); void updateTask(task.id, { squadId: null, agent: parsed.success ? parsed.data : null }) }
    }}>
      <option value="">以后再选</option>
      <optgroup label="单 Agent">{agents.map((agent) => <option key={agent} value={agent}>{agentLabel(agent)}</option>)}</optgroup>
      <optgroup label="开发小队">{Object.values(squads).filter((each) => each.archivedAt === null || each.id === task.squadId).map((each) => <option key={each.id} value={`squad:${each.id}`}>{each.name}{each.archivedAt !== null ? '（已归档）' : ''}</option>)}{task.squadId && !squad && <option value={`squad:${task.squadId}`}>开发小队</option>}</optgroup>
    </select>
  </label>
}
