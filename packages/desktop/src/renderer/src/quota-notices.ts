import { AGENT_KINDS, agentAdvice, type AgentKind, type AgentUsage, type QuotaAdvice } from '@antumi/protocol'
import type { Notice } from './attention'
import { agentLabel } from './labels'
import { adviceText, alternativeAgent, spacedText } from './quota-advice-text'
import { windowLabel } from './usage-format'

type Usages = Partial<Record<AgentKind, AgentUsage>> | null

// Quota left over only nags once its reset is this close: further out there is time to catch up.
const USE_MORE_NOTICE_MS = 24 * 60 * 60_000
const HOUR = 3_600_000

// One advice per window per cycle: the reset time names the cycle, to the hour since a service's
// reported reset can drift by seconds between readings.
export function adviceKey(advice: QuotaAdvice): string {
  const cycle = advice.window.resetsAt === null ? 'none' : Math.round(advice.window.resetsAt / HOUR)
  return `${advice.agent}:${advice.kind}:${advice.window.kind}:${advice.window.model ?? ''}:${cycle}`
}

const worthTelling = (advice: QuotaAdvice, now: number) =>
  advice.kind === 'slow-down' || (advice.kind === 'use-more' && advice.window.resetsAt !== null && advice.window.resetsAt - now <= USE_MORE_NOTICE_MS)

// What changed in the quota that is worth a notification: advice to spend quota about to go unused
// or to slow down, each once per window cycle (`sent` holds the keys told of, and is added to), and
// a used-up window that has room again.
export function quotaNoticesBetween(prev: Usages, next: Usages, now: number, sent: Set<string>, installed: readonly AgentKind[]): Notice[] {
  if (!next) return []
  const usages = AGENT_KINDS.map((agent) => next[agent]).filter((usage) => usage !== undefined)
  const notices: Notice[] = []
  for (const usage of usages) {
    const target = { kind: 'usage', agent: usage.agent } as const
    for (const advice of agentAdvice(usage, now)) {
      const key = adviceKey(advice)
      if (!worthTelling(advice, now) || sent.has(key)) continue
      sent.add(key)
      notices.push({ title: `${agentLabel(usage.agent)} 额度建议`, body: adviceText(advice, now, alternativeAgent(usage.agent, usages, installed, now)), target })
    }
    // Only a change seen between two readings: the first one has nothing to compare with.
    const before = prev?.[usage.agent]
    if (!before) continue
    for (const window of usage.windows) {
      const was = before.windows.find((entry) => entry.kind === window.kind && entry.model === window.model)
      if (was && was.usedPercent >= 100 && window.usedPercent < 100) {
        notices.push({ title: `${agentLabel(usage.agent)} 额度已恢复`, body: spacedText(`${windowLabel(window)}额度已重置，可以继续用了`), target })
      }
    }
  }
  return notices
}
