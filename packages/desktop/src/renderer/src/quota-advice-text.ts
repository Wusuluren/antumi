import { agentAdvice, quotaVerdict, rankAgents, type AgentKind, type AgentRecommendation, type AgentUsage, type QuotaAdvice, type WindowPace } from '@antumi/protocol'
import { agentLabel } from './labels'
import { formatClock, formatDuration, windowLabel } from './usage-format'

// How a piece of quota advice reads, in the usage card and in a notification.

// Another agent with room and on pace, to hand light work to; null when none is.
export function alternativeAgent(agent: AgentKind, usages: readonly AgentUsage[], installed: readonly AgentKind[], now: number): AgentKind | null {
  const others = rankAgents(usages, installed.filter((kind) => kind !== agent), now)
  return (
    others.find((kind) => {
      const usage = usages.find((entry) => entry.agent === kind)
      return quotaVerdict(usage, now).state === 'ok' && !agentAdvice(usage, now).some((item) => item.kind === 'wait-reset' || item.kind === 'slow-down')
    }) ?? null
  )
}

// Chinese text sets Latin letters and digits off from Han characters with a space, wherever the
// labels put them ("5h", "本周", "Opus 本周").
export function spacedText(text: string): string {
  return text.replace(/([\u4e00-\u9fff])(?=[A-Za-z0-9])/g, '$1 ').replace(/([A-Za-z0-9%])(?=[\u4e00-\u9fff])/g, '$1 ')
}

const quotaOf = (advice: QuotaAdvice) => `${windowLabel(advice.window)}额度`

export function adviceText(advice: QuotaAdvice, now: number, alternative: AgentKind | null): string {
  return spacedText(rawAdviceText(advice, now, alternative))
}

function rawAdviceText(advice: QuotaAdvice, now: number, alternative: AgentKind | null): string {
  const { window } = advice
  const reset = window.resetsAt === null ? '' : formatClock(window.resetsAt, now)
  const other = alternative ? agentLabel(alternative) : null
  switch (advice.kind) {
    case 'use-more': {
      const left = 100 - Math.round(window.usedPercent)
      const waste = Math.round(advice.percent ?? 0)
      const model = advice.model ? `，也可以放心用 ${advice.model}` : ''
      return `${windowLabel(window)}还剩 ${left}%，${reset} 重置，照现在的速度约 ${waste}% 会用不上：适合现在跑大任务或并行任务${model}`
    }
    case 'slow-down': {
      const early = advice.at !== null && window.resetsAt !== null ? `，比重置早 ${formatDuration(window.resetsAt - advice.at)}` : ''
      const at = advice.at === null ? '' : `会在 ${formatClock(advice.at, now)} `
      return `照现在的速度${quotaOf(advice)}${at}用完${early}：${other ? `轻活可以交给 ${other}` : '轻活可以换小一点的模型'}`
    }
    case 'wait-reset': {
      const head = window.usedPercent >= 100 ? `5h 额度已用完，${reset} 重置` : `照现在的速度 5h 额度会在重置（${reset}）前用完`
      return `${head}${other ? `；在那之前可以先用 ${other}` : '；大任务可以等重置后再开'}`
    }
    case 'switch-model': {
      const model = advice.model ?? ''
      return window.usedPercent >= 100
        ? `${quotaOf(advice)}已用完，${reset} 重置：先换其他模型`
        : `${windowLabel(window)}已用 ${Math.round(window.usedPercent)}%：日常改动可以换其他模型，把 ${model} 留给难题`
    }
  }
}

// What a window's row in the usage card adds about its pace, with the detail for its tooltip.
export function paceText(pace: WindowPace | null, now: number): { label: string; detail: string } | null {
  if (!pace) return null
  if (pace.pace === 'over' && pace.runsOutAt !== null) return { label: '偏快', detail: spacedText(`照现在的速度会在${formatClock(pace.runsOutAt, now)}用完，早于重置`) }
  if (pace.pace === 'under' && pace.wastePercent !== null) return { label: '用不完', detail: spacedText(`照现在的速度重置时约${Math.round(pace.wastePercent)}%用不上`) }
  return null
}

export function recommendationText(recommendation: AgentRecommendation): string {
  return recommendation.reason === 'expiring' ? '额度快重置了，还剩不少，先用它' : '额度比其他 Agent 宽裕'
}
