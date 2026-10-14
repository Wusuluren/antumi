import { ratesAt, type SmallModelCost, type SmallModelKind, type SmallModelTotals } from '@kando/protocol'

export const SMALL_MODEL_LABELS: Record<SmallModelKind, string> = { translation: '翻译', commitMessage: '提交说明', helper: '小助手' }

export function dollars(value: number | null): string {
  if (value === null) return '—'
  if (value > 0 && value < 0.01) return '<$0.01'
  return `$${value.toFixed(2)}`
}

const precise = (value: number | null) => value === null ? '未提供' : `$${value.toFixed(6)}`

export function coverage(totals: SmallModelTotals): string {
  return `共 ${totals.count} 次 · 可计价 ${totals.priced} 次 · 可估算 ${totals.estimated} 次`
}

export function smallModelExplanation(cost: SmallModelCost): string {
  const { baseline } = cost
  const mainCost = cost.modelDifferenceUsd !== null && cost.costUsd !== null ? cost.modelDifferenceUsd + cost.costUsd : null
  const cacheRate = baseline.price && baseline.context !== null ? ratesAt(baseline.price, baseline.context).cacheRead : null
  const dates = [...new Set(cost.prices.map((price) => price.updatedAt).concat(baseline.price ? [baseline.price.updatedAt] : []))]
  return [
    '按 API 标价折算，订阅额度不等于实际美元扣款。',
    `花费：${precise(cost.costUsd)}；主模型：${baseline.model ?? '未提供'}。`,
    `模型差价 = 同用量按主模型计价 ${precise(mainCost)} − 小模型花费 ${precise(cost.costUsd)}：${precise(cost.modelDifferenceUsd)}。`,
    cost.contextSavedUsd === null ? '缺少主上下文或调用数据，仅估算模型差价。'
      : `上下文节省 = ${baseline.context ?? 0} token × ${cost.calls ?? 0} 次调用 × ${precise(cacheRate)}/百万 token：${precise(cost.contextSavedUsd)}。`,
    `约省 = max(0, 模型差价 + 上下文节省)：${precise(cost.savedUsd)}；不计负值。`,
    ...(cost.callsEstimated ? ['模型调用次数为保守估算；无法可靠识别时按一次计算。'] : []),
    ...(!cost.completed ? ['失败或中断只计已报告花费，不计节省。'] : []),
    '按缓存仍热估算；不计算这些问答以后留在主上下文里的开销。',
    ...(dates.length ? [`价格更新日期：${dates.join('、')}。`] : []),
    ...(cost.costUsd === null ? ['缺少可核实价格或完整计价明细，金额未提供。'] : [])
  ].join('\n')
}
