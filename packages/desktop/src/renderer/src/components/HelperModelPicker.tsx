import { useEffect, useState } from 'react'
import type { AgentKind, ChatCatalog, Conversation } from '@kando/protocol'
import { perform, useCore } from '../core-store'
import { ChatModelPicker } from './ChatPicker'
import { effortLabel } from './ChatOptionsBar'

export function useHelperCatalog(agent: AgentKind): ChatCatalog | null | undefined {
  const rpc = useCore((state) => state.rpc)
  const [result, setResult] = useState<{ agent: AgentKind; catalog: ChatCatalog | null } | null>(null)
  useEffect(() => {
    if (!rpc) return
    let current = true
    void rpc.call('conversations.chatCatalog', { agent }).then((catalog) => {
      if (current) setResult({ agent, catalog })
    }).catch(() => { if (current) setResult({ agent, catalog: null }) })
    return () => { current = false }
  }, [rpc, agent])
  return result?.agent === agent ? result.catalog : undefined
}

export function HelperModelPicker({ catalog, model, effort, disabled = false, onModel, onEffort }: {
  catalog: ChatCatalog | null | undefined
  model: string | null
  effort: string | null
  disabled?: boolean
  onModel: (model: string) => void
  onEffort: (effort: string) => void
}) {
  if (!catalog) return <span className="muted">{catalog === undefined ? '正在读取模型…' : model ?? '默认模型'}</span>
  return <ChatModelPicker
    models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
    model={model}
    effort={effort}
    disabled={disabled}
    onModel={onModel}
    onEffort={onEffort}
  />
}

export function HelperStartOptions({ conversation }: { conversation: Conversation }) {
  const catalog = useHelperCatalog(conversation.agent)
  const set = (option: 'model' | 'effort', value: string) => void perform((rpc) => rpc.call('conversations.setOption', { id: conversation.id, option, value }))
  return <HelperModelPicker catalog={catalog} model={conversation.chatOptions?.model ?? null} effort={conversation.chatOptions?.effort ?? null} disabled={Boolean(conversation.starting)} onModel={(value) => set('model', value)} onEffort={(value) => set('effort', value)} />
}
