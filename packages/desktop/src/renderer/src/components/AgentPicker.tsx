import { quotaVerdict, type AgentKind } from '@antumi/protocol'
import { useCore } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { usePreferences } from '../preferences'
import { useNow } from '../usage-format'
import { quotaText, useRecommendation } from './AgentQuota'
import { ChatPicker, type PickerSize } from './ChatPicker'
import { AgentIcon } from './icons'

// A task's agent, as the app's other pickers choose one: each with its mark and how much of its
// quota is left. Locked while running (the session already started with this agent) and once
// abandoned. `labelled` sits it in a row of labelled buttons, as tall as they are.
export function AgentPicker({
  agent,
  locked,
  onChange,
  labelled = false,
  size = labelled ? 'large' : undefined
}: {
  agent: AgentKind | null
  locked: boolean
  onChange: (agent: AgentKind | null) => void
  labelled?: boolean
  size?: PickerSize
}) {
  const installed = useInstalledAgents()
  const usage = useCore((s) => s.usage)
  const display = usePreferences((s) => s.usageDisplay)
  const now = useNow(60_000)
  // The task's own agent stays in the list when it is not here, so what the task says is visible.
  const kinds = agent && !installed.includes(agent) ? [...installed, agent] : installed
  const recommended = useRecommendation(installed)?.agent
  return (
    <ChatPicker
      label="Agent"
      value={agent ?? ''}
      placeholder="选择 Agent"
      options={[
        ...kinds.map((kind) => ({
          value: kind,
          label: agentLabel(kind),
          icon: <AgentIcon agent={kind} />,
          description: installed.includes(kind)
            ? [kind === recommended ? '推荐' : null, quotaText(quotaVerdict(usage?.[kind], now), display, now)].filter(Boolean).join(' · ') || null
            : '未安装'
        })),
        ...(agent ? [{ value: '', label: '不指定', icon: <AgentIcon agent={null} /> }] : [])
      ]}
      size={size}
      placement="below"
      align="end"
      disabled={locked}
      title={locked ? `Agent：${agent ? agentLabel(agent) : '未选择'}（这时不能换）` : undefined}
      onChange={(value) => onChange(kinds.find((kind) => kind === value) ?? null)}
    />
  )
}
