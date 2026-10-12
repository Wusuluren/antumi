import { create } from 'zustand'
import type { AgentKind } from '@kando/protocol'

// A conversation's handoff while the user sets it up in its composer: the agent picked to take the
// work over, and the model and effort it starts in. Nothing happens until the composer sends it.
export type PendingHandoff = { agent: AgentKind; model?: string; effort?: string }

export const useHandoffs = create<Record<string, PendingHandoff>>()(() => ({}))

export function proposeHandoff(conversationId: string, agent: AgentKind): void {
  useHandoffs.setState({ [conversationId]: { agent } })
}

export function chooseHandoffModel(conversationId: string, choice: { model?: string; effort?: string }): void {
  useHandoffs.setState((state) => {
    const pending = state[conversationId]
    return pending ? { [conversationId]: { agent: pending.agent, ...choice } } : {}
  })
}

export function cancelHandoff(conversationId: string): void {
  useHandoffs.setState((state) => {
    const { [conversationId]: _cancelled, ...rest } = state
    return rest
  }, true)
}
