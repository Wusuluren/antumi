import { agentDescriptor, agentModeText, type AgentKind, type ChatContextUse, type ChatItem, type ChatModel, type ChatOption, type ChatPermissionMode, type Conversation } from '@antumi/protocol'
import { perform } from '../core-store'
import { ChatModelPicker, ChatPicker, type PickerOption } from './ChatPicker'

type StateItem = Extract<ChatItem, { kind: 'state' }>

export function modeLabel(agent: AgentKind, mode: string): string {
  return agentModeText(agent, mode)?.label ?? mode
}

// The modes as the picker lists them; one the agent offers but cannot be picked now stays greyed.
export function modeOptions(agent: AgentKind, modes: readonly string[], offered: readonly string[] = modes): PickerOption[] {
  return modes.map((mode) => ({
    value: mode,
    label: modeLabel(agent, mode),
    description: agentModeText(agent, mode)?.description ?? null,
    disabled: !offered.includes(mode)
  }))
}

// Only the modes worth a second look stand out: planning, and running with nothing asked.
export function modeTone(mode: string | null): string | undefined {
  return mode === 'plan' || mode === 'bypass' ? mode : undefined
}

export function defaultStartMode(agent: AgentKind, offered: readonly ChatPermissionMode[]): ChatPermissionMode {
  const { defaultStartMode: preferred, startModes } = agentDescriptor(agent)
  return offered.includes(preferred) ? preferred : startModes[0]!
}

// What a new conversation can start in, with auto where the model takes it (as the agent's catalog
// says) and bypass where the agent has it, in the order a running chat lists them.
export function startModes(agent: AgentKind, model: ChatModel | undefined): ChatPermissionMode[] {
  const { startModes, capabilities } = agentDescriptor(agent)
  return [...startModes, ...(model?.autoMode && capabilities.autoMode ? ['auto' as const] : []), ...(capabilities.bypass ? ['bypass' as const] : [])]
}

const EFFORT_LABEL: Record<string, string> = {
  none: '无',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最高',
  ultra: '超高'
}

export function effortLabel(effort: string): string {
  return EFFORT_LABEL[effort] ?? effort
}

function tokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  return count >= 1000 ? `${Math.round(count / 1000)}k` : String(count)
}

// How full the context window is; before the window is known, only the tokens.
function ContextRing({ context }: { context: ChatContextUse }) {
  const ratio = context.window ? Math.min(1, context.used / context.window) : null
  const title = ratio === null
    ? `上下文 ${tokens(context.used)} tokens`
    : `上下文 ${Math.round(ratio * 100)}%（${tokens(context.used)} / ${tokens(context.window ?? 0)}）`
  const radius = 7
  const length = 2 * Math.PI * radius
  const level = ratio === null ? 'normal' : ratio >= 0.85 ? 'critical' : ratio >= 0.6 ? 'warning' : 'normal'
  return (
    <span className="chat-context" role="img" aria-label={title} data-tooltip={title} data-tooltip-side="top-end" data-level={level}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r={radius} className="chat-context-track" />
        {ratio !== null && (
          <circle cx="10" cy="10" r={radius} className="chat-context-fill" strokeDasharray={`${ratio * length} ${length}`} transform="rotate(-90 10 10)" />
        )}
      </svg>
      {ratio !== null && <span>{Math.round(ratio * 100)}%</span>}
    </span>
  )
}

// A choice the stage reports but does not list (a mode Antumi has no name for) still shows.
function withCurrent(values: readonly string[], current: string | null): string[] {
  return current && !values.includes(current) ? [current, ...values] : [...values]
}

// The composer's toolbar, inside its box after the ＋: how freely the agent may act on the left; on
// the right, the model and effort it runs beside how full its context is. A click switches each;
// the model and effort change between turns, the mode at any time. With no agent running, the
// choices are for the next start, from what the last stage offered: as chosen since, or as that
// stage left them.
export function ChatOptionsBar({ conversation, state, compact = false }: { conversation: Conversation; state: StateItem; compact?: boolean }) {
  const { id, agent, chatOptions: next } = conversation
  const managed = Boolean(conversation.squadRunId || conversation.workspaceReadOnly)
  const running = conversation.sessionId !== null
  // An older core takes options only from a running agent.
  if (!running && !next) return null
  const idle = !running || conversation.chat?.turn === 'idle'
  const set = (option: ChatOption, value: string) => void perform((rpc) => rpc.call('conversations.setOption', { id, option, value }))
  const permissionMode = running ? state.permissionMode : (next?.permissionMode ?? state.permissionMode)
  const modelId = running ? state.model : (next?.model ?? state.model)
  // A model picked since takes its own default effort unless one was picked for it too.
  const effort = running ? state.effort : (next?.effort ?? (next?.model && next.model !== state.model ? null : state.effort))
  // The next start offers bypass where the agent has it, even if this one started without; a task
  // that only plans never.
  const offered = running || conversation.planOnly
    ? state.permissionModes
    : [...state.permissionModes.filter((mode) => mode !== 'bypass'), ...(agentDescriptor(agent).capabilities.bypass ? ['bypass'] : [])]
  const model = state.models.find((each) => each.id === modelId)
  const modes = withCurrent(offered, permissionMode)
  const models = model || !modelId
    ? state.models
    : [{ id: modelId, label: modelId, description: null, efforts: [], isDefault: false }, ...state.models]
  const later = running ? null : '发下一条消息时按这个启动'
  return (
    <>
      {!compact && modes.length > 0 && (
        <ChatPicker
          label="权限模式"
          value={permissionMode}
          placeholder="权限模式"
          options={modeOptions(agent, modes, offered).map((option) => conversation.workspaceReadOnly ? { ...option, label: conversation.squadRunId ? '只读' : '只读协调' } : option)}
          tone={modeTone(permissionMode)}
          disabled={managed || (!agentDescriptor(agent).capabilities.optionsWhileBusy && !idle)}
          title={managed ? '沿用本次小队配置' : later ?? undefined}
          onChange={(mode) => set('permissionMode', mode)}
        />
      )}
      <span className="chat-dock-spacer" />
      {models.length > 0 && (
        <ChatModelPicker
          models={models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
          model={modelId}
          effort={effort}
          disabled={managed || !idle}
          title={managed ? '沿用本次小队配置' : later ?? (idle ? undefined : '回合结束后才能换模型和推理强度')}
          onModel={(value) => set('model', value)}
          onEffort={(value) => set('effort', value)}
        />
      )}
      {!compact && state.context && <ContextRing context={state.context} />}
    </>
  )
}
