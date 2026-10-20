import { getLocale, t } from './i18n'
// How the stats pages write their numbers.
const COMPACT = { 'zh-CN': new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }), en: new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }) }

export function durationText(ms: number | null): string {
  if (ms === null) return '—'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return t('statFormat.lessThan1Minute')
  if (minutes < 60) return t('chatTools.min', { minutes: minutes })
  const hours = Math.floor(minutes / 60)
  return minutes % 60 ? t('statFormat.hM', { hours: hours, value2: minutes % 60 }) : t('statFormat.h', { hours: hours })
}

export const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`
export const compact = (value: number) => COMPACT[getLocale()].format(value)
export const tokens = (value: number | null) => (value === null ? '—' : compact(value))
