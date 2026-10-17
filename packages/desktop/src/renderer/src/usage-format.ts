import { useEffect, useState } from 'react'
import { tightestWindow, type AgentUsage, type ResetCreditOutcome, type UsageWindow } from '@antumi/protocol'
import type { Preferences } from './preferences'

// How usage numbers read wherever they show: the status bar, and next to an agent being picked.

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) {
    return '不到 1 分钟'
  }
  if (minutes < 60) {
    return `${minutes} 分钟`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return minutes % 60 ? `${hours} 小时 ${minutes % 60} 分` : `${hours} 小时`
  }
  return hours % 24 ? `${Math.floor(hours / 24)} 天 ${hours % 24} 小时` : `${Math.floor(hours / 24)} 天`
}

export function formatClock(at: number, now: number): string {
  const date = new Date(at)
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (date.toDateString() === new Date(now).toDateString()) {
    return `今天 ${time}`
  }
  return `${date.toLocaleDateString('zh-CN', { weekday: 'short' })} ${time}`
}

export function windowLabel(window: UsageWindow): string {
  if (window.kind === 'session') {
    return '5h'
  }
  const period = window.kind === 'monthly' ? '本月' : '本周'
  return window.model ? `${window.model} ${period}` : period
}

export function resetText(window: UsageWindow, now: number): string {
  if (window.resetsAt === null) {
    return ''
  }
  if (window.resetsAt <= now) {
    return '即将重置'
  }
  return `${formatDuration(window.resetsAt - now)}后重置（${formatClock(window.resetsAt, now)}）`
}

// Urgency colors always follow what is used; only the number and the fill flip.
export function shownPercent(window: UsageWindow, display: Preferences['usageDisplay']): number {
  return display === 'remaining' ? 100 - window.usedPercent : window.usedPercent
}

export function percentText(window: UsageWindow, display: Preferences['usageDisplay']): string {
  const value = Math.round(shownPercent(window, display))
  return display === 'remaining' ? `剩 ${value}%` : `${value}%`
}

export function clearsText(clears: readonly UsageWindow['kind'][]): string {
  const session = clears.includes('session')
  const weekly = clears.includes('weekly')
  if (session && weekly) {
    return '清零 5h 和每周额度'
  }
  return session ? '清零 5h 额度' : weekly ? '清零每周额度' : ''
}

// Said before a reset is spent: it cannot be taken back, and windows with room left waste it.
export function spendNote(usage: AgentUsage, clearing: readonly UsageWindow['kind'][]): string {
  const clears = clearsText(clearing)
  const tightest = tightestWindow(usage.windows)
  const room = tightest && tightest.usedPercent < 100 ? `现在额度还剩 ${100 - Math.round(tightest.usedPercent)}%，用完再用更划算。` : ''
  return `用掉一张，立即${clears || '恢复额度'}，用掉后不能退回。${room}`
}

export const SPEND_OUTCOME_TEXT: Record<ResetCreditOutcome, string> = {
  reset: '已使用一张重置卡，额度已恢复',
  'nothing-to-reset': '现在没有用掉的额度需要清零，重置卡没有扣',
  'no-credit': '没有可用的重置卡了',
  'already-used': '这张重置卡已经用过了，额度已恢复'
}
