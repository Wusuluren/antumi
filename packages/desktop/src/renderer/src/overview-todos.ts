import { isHelper, type AgentKind, type Conversation, type Task, type TodoGroup, type TodoItem } from '@antumi/protocol'

// A list nobody has touched for this long is called out, so old ones do not bury new ones.
export const STALE_TODO_MS = 7 * 86_400_000

export type TodoLine = { groupId: string; group: string; note: string | null; item: TodoItem }

// One conversation's open to-dos in the overview: the user's first, then what its agent can take on
// when asked, each in the order of its list.
export type TodoEntry = {
  conversationId: string
  taskId: string | null
  title: string
  agent: AgentKind
  lines: TodoLine[]
  mine: number
  agents: number
  updatedAt: number
  stale: boolean
}

export type OverviewTodos = { entries: TodoEntry[]; mine: number; agents: number; archived: number }

// What is left to do across conversations and task chats. A conversation that is part of another
// (a helper, a group chat's member, a squad's member) or a routine's run is not listed on its own;
// an archived one only when asked for, and counted apart either way.
export function overviewTodos(
  todos: Readonly<Record<string, readonly TodoGroup[]>>,
  conversations: Readonly<Record<string, Conversation>>,
  tasks: Readonly<Record<string, Task>>,
  now: number,
  withArchived = false
): OverviewTodos {
  const entries: TodoEntry[] = []
  let archived = 0
  for (const [conversationId, groups] of Object.entries(todos)) {
    const conversation = conversations[conversationId]
    if (!conversation || isHelper(conversation) || conversation.discussionId || conversation.squadRunId || conversation.routineId) continue
    const open = groups.flatMap((group) => group.items.filter((item) => !item.done)
      .map((item) => ({ groupId: group.id, group: group.title, note: group.note, item })))
    if (open.length === 0) continue
    if (conversation.archivedAt != null) {
      archived += open.length
      if (!withArchived) continue
    }
    const lines = [...open.filter((line) => line.item.owner === 'user'), ...open.filter((line) => line.item.owner === 'agent')]
    const task = conversation.taskId ? tasks[conversation.taskId] : undefined
    const updatedAt = Math.max(...groups.filter((group) => group.items.some((item) => !item.done)).map((group) => group.updatedAt))
    entries.push({
      conversationId,
      taskId: task?.id ?? null,
      title: task?.title ?? conversation.title,
      agent: conversation.agent,
      lines,
      mine: lines.filter((line) => line.item.owner === 'user').length,
      agents: lines.filter((line) => line.item.owner === 'agent').length,
      updatedAt,
      stale: now - updatedAt > STALE_TODO_MS
    })
  }
  entries.sort((a, b) => Number(b.mine > 0) - Number(a.mine > 0) || b.updatedAt - a.updatedAt)
  return {
    entries,
    mine: entries.reduce((sum, entry) => sum + entry.mine, 0),
    agents: entries.reduce((sum, entry) => sum + entry.agents, 0),
    archived
  }
}
