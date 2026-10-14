import type { ChatItem } from '@kando/protocol'
import { dollars, smallModelExplanation } from '../model-cost-format'
import { compact } from '../stat-format'

export function HelperTurnCost({ turn }: { turn: Extract<ChatItem, { kind: 'turn' }> }) {
  const cost = turn.smallModelCost
  if (!cost) return null
  const tokens = turn.usage ? 'total' in turn.usage ? turn.usage.total : turn.usage.input + turn.usage.output : null
  return <span className="helper-turn-cost" title={smallModelExplanation(cost)}>
    {cost.costUsd !== null ? `花费 ${dollars(cost.costUsd)}` : tokens !== null ? `${compact(tokens)} token · 花费未提供` : '用量未提供'}
    {cost.savedUsd !== null && ` · 约省 ${dollars(cost.savedUsd)}`}
  </span>
}
