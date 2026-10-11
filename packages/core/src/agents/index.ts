import { agentDescriptor, type AgentKind } from '@kando/protocol'
import { Rejection } from '../rejection'
import type { AgentAdapter } from './agent-adapter'
import { claude } from './claude/claude-adapter'
import { codex } from './codex/codex-adapter'
import { cursor } from './cursor/cursor-adapter'

// One adapter per agent kind: one left out fails to compile.
export const AGENT_ADAPTERS = { claude, codex, cursor } satisfies Record<AgentKind, AgentAdapter>

export function adapterOf(kind: AgentKind): AgentAdapter {
  return AGENT_ADAPTERS[kind]
}

// Scheduled and routine runs have nobody there to answer, which not every agent can run without.
export function checkUnattended(kind: AgentKind): void {
  if (!agentDescriptor(kind).capabilities.unattended) {
    throw new Rejection('agent-unattended-unsupported', `${agentDescriptor(kind).label} 暂不支持无人值守运行`)
  }
}
