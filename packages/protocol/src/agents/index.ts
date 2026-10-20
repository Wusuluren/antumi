import type { UiLocale } from '../localization'
import type { AgentKind } from '../agent'
import { ChatPermissionMode } from '../chat'
import type { AgentDescriptor, AgentModeText } from './agent-descriptor'
import { claude } from './claude'
import { codex } from './codex'
import { cursor } from './cursor'

export type { AgentDescriptor, AgentModeText } from './agent-descriptor'
export { modelPrice } from './model-prices'

// One entry per agent kind: one left out fails to compile.
export const AGENT_DESCRIPTORS = { claude, codex, cursor } satisfies Record<AgentKind, AgentDescriptor>

export function agentDescriptor(kind: AgentKind, locale: UiLocale = 'zh-CN'): AgentDescriptor {
  const descriptor = AGENT_DESCRIPTORS[kind]
  return locale === 'en' ? { ...descriptor, ...descriptor.translations?.en } : descriptor
}

// A mode a stage reports, as the agent names it; undefined for one Antumi has no name for.
export function agentModeText(kind: AgentKind, mode: string, locale: UiLocale = 'zh-CN'): AgentModeText | undefined {
  const known = ChatPermissionMode.safeParse(mode)
  return known.success ? agentDescriptor(kind, locale).modes[known.data] : undefined
}
