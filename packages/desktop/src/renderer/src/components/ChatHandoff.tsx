import { checkTaskHandoff, type AgentKind, type ChatModel, type Conversation, type TaskLaunchOptions } from '@kando/protocol'
import { resolveModel, useAgentCatalog } from '../agent-models'
import { cancelHandoff, chooseHandoffModel, proposeHandoff, useHandoffs } from '../chat-handoff'
import { perform, useCore, useTaskHandoffSupported } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel, reasonText } from '../labels'
import { confirmQuota, modelText } from './AgentQuota'
import { ChatModelPicker, ChatPicker } from './ChatPicker'
import { AgentIcon } from './icons'
import { effortLabel } from './ChatOptionsBar'
import { startOptions } from './ConversationActions'

export type ComposerHandoff = {
  // The agent at work now: a task's, for a task's chat.
  from: AgentKind
  // Others installed here, to hand to; none, and the composer offers no switch.
  targets: readonly AgentKind[]
  // The agent the next send hands the chat to, with the model and effort it starts in.
  target: { agent: AgentKind; model: ChatModel | undefined; options: Pick<TaskLaunchOptions, 'model' | 'effort'> } | null
  // Why it cannot go now (a task's chat waits for its turn to end), or null.
  blocker: string | null
  // A free conversation's agent mid-turn is stopped for it, once the user agrees.
  stopsRunning: boolean
  // Hands the chat over, the message as the note it goes with. Resolves to whether it went.
  send: (note: string) => Promise<boolean>
}

// The composer's switch of agent: picking another agent readies a handoff, which the next send
// carries out; picking the agent at work again calls it off.
export function useComposerHandoff(conversation: Conversation): ComposerHandoff {
  const { id } = conversation
  const task = useCore((s) => (conversation.taskId ? s.tasks[conversation.taskId] : undefined))
  const tasks = useCore((s) => s.tasks)
  const taskSupported = useTaskHandoffSupported()
  const modelsSupported = useCore((s) => s.rpc?.features.includes('handoff-model') ?? false)
  const installed = useInstalledAgents()
  const pending = useHandoffs((s) => s[id])
  const from = task?.agent ?? conversation.agent
  const targets = !task || taskSupported ? installed.filter((agent) => agent !== from) : []
  const picked = pending && targets.includes(pending.agent) ? pending : null
  const catalog = useAgentCatalog(picked?.agent ?? null, modelsSupported)
  const { model, modelId, effort } = resolveModel(catalog, picked ?? {})
  const turn = conversation.sessionId ? (conversation.chat?.turn ?? null) : null
  const dependencies = task ? task.dependsOn.map((other) => tasks[other]).filter((dependency) => dependency !== undefined) : []
  const found = task ? checkTaskHandoff(task, dependencies, turn) : null
  const stopsRunning = !task && conversation.sessionId !== null && turn !== 'idle'
  const target = picked && { agent: picked.agent, model, options: modelsSupported ? { model: modelId ?? null, effort: effort ?? null } : {} }
  const send = async (note: string) => {
    if (!target || found) return false
    if (stopsRunning && !window.confirm(`停止当前的 ${agentLabel(from)}，然后交给 ${agentLabel(target.agent)} 接着做？`)) return false
    if (!confirmQuota(target.agent, modelText(target.model))) return false
    const result = task
      ? await perform((rpc) => rpc.call('tasks.handoff', { id: task.id, agent: target.agent, note, ...startOptions(), ...target.options }))
      : await perform((rpc) => rpc.call('conversations.handoff', { id, agent: target.agent, note, stopRunning: stopsRunning, ...startOptions(), ...target.options }))
    if (result) cancelHandoff(id)
    return result !== null
  }
  return { from, targets, target, blocker: found && reasonText(found, found), stopsRunning, send }
}

// Who the chat is with, and the switch to another agent; the picked one stands out until it is sent.
export function HandoffAgentPicker({ conversationId, handoff, disabled }: { conversationId: string; handoff: ComposerHandoff; disabled: boolean }) {
  const { from, targets, target } = handoff
  return (
    <ChatPicker
      label="Agent"
      value={target?.agent ?? from}
      placeholder={agentLabel(from)}
      options={[
        { value: from, label: agentLabel(from), description: target ? '不移交，继续和它聊' : '正在用的 Agent', icon: <AgentIcon agent={from} /> },
        ...targets.map((agent) => ({ value: agent, label: agentLabel(agent), description: `移交给 ${agentLabel(agent)}，它读完移交说明后接着做`, icon: <AgentIcon agent={agent} /> }))
      ]}
      tone={target ? 'handoff' : undefined}
      disabled={disabled}
      onChange={(value) => {
        const agent = targets.find((each) => each === value)
        if (agent) proposeHandoff(conversationId, agent)
        else cancelHandoff(conversationId)
      }}
    />
  )
}

// The model and effort the agent taking over starts in, where core takes them.
export function HandoffModelPicker({ conversationId, agent }: { conversationId: string; agent: AgentKind }) {
  const modelsSupported = useCore((s) => s.rpc?.features.includes('handoff-model') ?? false)
  const catalog = useAgentCatalog(agent, modelsSupported)
  const pending = useHandoffs((s) => s[conversationId])
  const { modelId, defaultModel, effort } = resolveModel(catalog, pending ?? {})
  if (!catalog?.models.length) return null
  return (
    <ChatModelPicker
      models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
      model={modelId ?? defaultModel?.id ?? null}
      effort={effort ?? null}
      onModel={(model) => {
        const efforts = catalog.models.find((each) => each.id === model)?.efforts ?? []
        chooseHandoffModel(conversationId, { model, ...(effort && efforts.includes(effort) ? { effort } : {}) })
      }}
      onEffort={(next) => chooseHandoffModel(conversationId, { model: modelId ?? defaultModel?.id, effort: next })}
    />
  )
}
