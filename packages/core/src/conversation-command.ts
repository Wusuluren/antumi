import type { AgentKind } from '@kando/protocol'
import type { AgentCommand } from './agent-command'
import { adapterOf } from './agents'
import type { AgentLaunch } from './agents/agent-adapter'

const HANDOFF_PREFIX = '请先阅读 Kando 移交文件 '
const HANDOFF_SUFFIX = '，结合当前项目目录现状继续协助用户。'

export function handoffPrompt(handoffPath: string): string {
  return `${HANDOFF_PREFIX}${handoffPath}${HANDOFF_SUFFIX}`
}

// The agent reports the handoff prompt back as the user's first message; this finds its path.
export function handoffPromptPath(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith(HANDOFF_PREFIX) || !trimmed.endsWith(HANDOFF_SUFFIX)) return null
  return trimmed.slice(HANDOFF_PREFIX.length, -HANDOFF_SUFFIX.length)
}

// The agent speaks JSON lines over stdio: the stream carries every message, and none goes in argv
// (messages, the handoff prompt included, go to stdin).
export function chatCommand(
  agent: AgentKind,
  providerSessionId: string | null,
  resume: boolean,
  handoffPath: string | null,
  extraProjects: readonly string[] = [],
  launch: Omit<AgentLaunch, 'providerSessionId' | 'resume' | 'handoffPath' | 'extraProjects'> = {}
): AgentCommand {
  return adapterOf(agent).command({ providerSessionId, resume, handoffPath, extraProjects, ...launch })
}
