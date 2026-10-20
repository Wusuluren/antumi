import { t, tr } from '../i18n'
import { coverage, dollars } from '../model-cost-format'
import type { DashboardDay, DashboardStats } from '@antumi/protocol'
import { acceptance, change, dayTokens, rateChange, type Change } from '../dashboard-model'
import { compact, durationText, percent } from '../stat-format'

type Kpi = { label: string; title: string; value: string; note?: string; change: Change | null; trend?: number[] }

// The range's shape at a glance; drawn in the text colour, since it only repeats the number beside it.
function Sparkline({ values }: { values: readonly number[] }) {
  const max = Math.max(...values)
  if (values.length < 2 || max === 0) return null
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 64},${22 - (value / max) * 20}`).join(' ')
  return (
    <svg className="dashboard-spark" viewBox="0 0 64 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const ARROW = { up: '↑', down: '↓', flat: '' } as const

function KpiCell({ kpi, range }: { kpi: Kpi; range: number }) {
  return (
    <div className="dashboard-kpi" title={kpi.title}>
      <span className="dashboard-kpi-label">{kpi.label}</span>
      <span className="dashboard-kpi-value">{kpi.value}</span>
      <span className="dashboard-kpi-foot">
        {kpi.change ? (
          <span className="dashboard-kpi-change" data-direction={kpi.change.direction}>
            {ARROW[kpi.change.direction]}{kpi.change.text}
            <span className="dashboard-kpi-since">{tr('DashboardKpis.comparedWithPreviousDays', { range: range })}</span>
          </span>
        ) : (
          <span className="dashboard-kpi-since">{kpi.note ?? t('DashboardKpis.noDataForThePreviousDays', { range: range })}</span>
        )}
        {kpi.trend && <Sparkline values={kpi.trend} />}
      </span>
    </div>
  )
}

// The headline numbers of the range, each against the range before it.
export function DashboardKpis({ stats, days, range }: { stats: DashboardStats; days: readonly DashboardDay[]; range: number }) {
  const { current, previous } = stats
  const rate = acceptance(current.accepted, current.decided)
  const kpis: Kpi[] = [
    { label: t('DashboardKpis.taskRuns'), title: t('DashboardKpis.agentRunsThatEndedInThisPeriod'), value: String(current.runs), change: change(current.runs, previous.runs), trend: days.map((day) => day.runs) },
    {
      label: t('DashboardKpis.acceptanceRate'),
      title: t('DashboardKpis.shareOfReviewedRunsAcceptedDirectly'),
      value: rate === null ? '—' : percent(current.accepted, current.decided),
      note: rate === null ? t('DashboardKpis.onlyReviewsTooFewSamples', { value1: current.decided }) : undefined,
      change: rateChange(rate, acceptance(previous.accepted, previous.decided))
    },
    {
      label: t('DashboardKpis.medianDuration'),
      title: t('DashboardKpis.fromRunStartToDeliveryIncludingYourResponse'),
      value: durationText(current.medianRunMs),
      change: current.medianRunMs === null || previous.medianRunMs === null ? null : change(current.medianRunMs, previous.medianRunMs)
    },
    { label: t('DashboardKpis.totalTokens'), title: t('DashboardKpis.tokensReadAndWrittenByTaskRunsConversation'), value: compact(current.tokens), change: change(current.tokens, previous.tokens), trend: days.map(dayTokens) },
    { label: t('DashboardKpis.conversationTurns'), title: t('DashboardKpis.completedConversationTurnsExcludingTaskChats'), value: String(current.turns), change: change(current.turns, previous.turns), trend: days.map((day) => day.turns) },
    {
      label: t('DashboardKpis.failedInterrupted'),
      title: t('DashboardKpis.turnsEndingWithErrorsIncludingQuotaLimitsStopped'),
      value: `${current.failedTurns} / ${current.interruptedTurns}`,
      note: current.turns > 0 ? t('DashboardKpis.ofTurns', { value1: percent(current.failedTurns + current.interruptedTurns, current.turns) }) : t('DashboardKpis.noTurns'),
      change: null
    }
  ]
  if (stats.smallModels) kpis.push({
    label: t('DashboardKpis.smallModelSavings'), title: t('DashboardKpis.estimatedAtApiListPricesModelPriceDifference', { value1: coverage(stats.smallModels.current) }),
    value: stats.smallModels.current.savedUsd === null ? '—' : t('DashboardKpis.about', { value1: dollars(stats.smallModels.current.savedUsd) }),
    note: t('DashboardKpis.estimableRequests', { value1: stats.smallModels.current.estimated, value2: stats.smallModels.current.count }), change: null
  })
  return (
    <div className="dashboard-kpis">
      {kpis.map((kpi) => <KpiCell key={kpi.label} kpi={kpi} range={range} />)}
    </div>
  )
}
