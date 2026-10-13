import type { AgentKind, Squad, Task } from '@kando/protocol'
import { updateTask, useCore } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { ChatPicker, type PickerOption, type PickerSize } from './ChatPicker'
import { AgentIcon, SquadIcon } from './icons'

// Who can carry a task out, as a picker lists them: later, one agent, or a squad (value squad:<id>),
// an archived squad only when it is the one picked.
export function executorOptions(agents: readonly AgentKind[], squads: Readonly<Record<string, Squad>>, squadId: string | null): PickerOption[] {
  const listed = Object.values(squads).filter((each) => each.archivedAt === null || each.id === squadId)
  return [
    { value: '', label: '以后再选', icon: <AgentIcon agent={null} /> },
    ...agents.map((agent) => ({ value: agent, label: agentLabel(agent), description: '单 Agent', icon: <AgentIcon agent={agent} /> })),
    ...listed.map((each) => ({
      value: `squad:${each.id}`,
      label: each.name,
      description: `研发小队 · ${each.members.length - 1} 名成员${each.archivedAt !== null ? ' · 已归档' : ''}`,
      icon: <SquadIcon />
    }))
  ]
}

// Who carries a pending task out: one agent, or a squad, picked as the app's other pickers pick.
export function TaskExecutorPicker({ task, size }: { task: Task; size?: PickerSize }) {
  const squads = useCore((state) => state.squads)
  const agents = useInstalledAgents()
  const value = task.squadId ? `squad:${task.squadId}` : task.agent ?? ''
  return (
    <span className="task-executor-picker">
      <span className="muted">执行者</span>
      <ChatPicker
        label="任务执行者"
        value={value}
        placeholder={task.squadId ? '研发小队' : '以后再选'}
        options={executorOptions(agents, squads, task.squadId ?? null)}
        size={size}
        placement="below"
        align="end"
        disabled={task.status !== 'pending'}
        onChange={(picked) => {
          if (picked.startsWith('squad:')) void updateTask(task.id, { squadId: picked.slice(6) })
          else void updateTask(task.id, { squadId: null, agent: agents.find((agent) => agent === picked) ?? null })
        }}
      />
    </span>
  )
}
