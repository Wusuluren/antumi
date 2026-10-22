import { useCallback, useEffect, useState } from 'react'
import { accountsSupported, type AgentKind, type UsageFilter, type UsageHistory, type UsageTotals } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { accountName } from '../agent-accounts'
import { getLocale, t } from '../i18n'
import { agentLabel } from '../labels'
import { compact } from '../stat-format'
import { forecastText, useQuotaForecasts } from '../quota-forecast'
import { windowLabel } from '../usage-format'
import { Segmented } from './SettingsControls'

const dollars = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 3 }).format(value)
const amount = (row: UsageTotals) => `${compact(row.input + row.output)} · ${dollars(row.costUsd)}`

export function UsageAnalysis({ range }: { range: number }) {
  const rpc = useCore((state) => state.rpc)
  const accounts = useCore((state) => state.accounts)
  const [report, setReport] = useState<UsageHistory | null>(null)
  const [filter, setFilter] = useState<Pick<UsageFilter, 'agent' | 'account' | 'identity' | 'model' | 'source'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const forecasts = useQuotaForecasts()
  const supported = rpc?.features.includes('usage-analytics') === true
  const load = useCallback(async () => {
    if (!rpc || !supported) return
    return rpc.call('usage.history', { range, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...filter })
  }, [rpc, supported, range, filter])
  useEffect(() => {
    if (!rpc || !supported) return
    let current = true, sequence = 0
    const refresh = () => {
      const revision = ++sequence
      void load().then((result) => { if (current && revision === sequence && result) { setReport(result); setError(false) } }, () => { if (current) setError(true) })
    }
    setReport(null); refresh()
    const stop = rpc.on('usage.analyticsChanged', refresh)
    return () => { current = false; stop() }
  }, [rpc, supported, load])
  const scan = async () => {
    if (!rpc) return
    setBusy(true)
    try { await perform((client) => client.call('usage.scan', {})); const result = await load(); if (result) setReport(result) }
    finally { setBusy(false) }
  }
  // An agent without accounts has only the user's own; its identity snapshot is an opaque key, not a name.
  const name = (agent: AgentKind, id: string | null, identity?: string | null) => {
    if (!accountsSupported(agent)) return t('AgentAccounts.own')
    if (id === null) return t('UsageAnalytics.unknownAccount')
    const account = accounts?.accounts.find((entry) => entry.agent === agent && entry.id === id)
    return (identity?.includes('@') ? identity : null) || accountName(account ?? { id, label: null, email: null })
  }
  if (!supported) return null
  const selected = filter.agent !== undefined || filter.account !== undefined || filter.model !== undefined
  return <section className="dashboard-panel usage-analysis" aria-labelledby="usage-analysis-title">
    <header className="dashboard-panel-header">
      <h3 id="usage-analysis-title">{t('UsageAnalytics.title')}</h3>
      <button type="button" className="button ghost" disabled={busy || report?.scan.running} onClick={() => void scan()}>{busy || report?.scan.running ? t('UsageAnalytics.scanning') : t('UsageAnalytics.refresh')}</button>
    </header>
    <div className="usage-analysis-toolbar">
      <Segmented labelId="usage-source-filter" value={filter.source ?? 'all'} options={[
        { value: 'all', label: t('UsageAnalytics.all') }, { value: 'antumi', label: 'Antumi' }, { value: 'external', label: t('UsageAnalytics.external') }
      ]} onChange={(value) => setFilter({ source: value === 'antumi' || value === 'external' ? value : undefined })} />
      <span id="usage-source-filter" hidden>{t('UsageAnalytics.source')}</span>
      {selected && <button type="button" className="button ghost" onClick={() => setFilter({ source: filter.source })}>{t('UsageAnalytics.clearFilters')}</button>}
      {filter.agent && <span className="muted">{agentLabel(filter.agent)}{filter.account !== undefined ? ` · ${name(filter.agent, filter.account)}` : ''}{filter.model !== undefined ? ` · ${filter.model ?? t('UsageAnalytics.unknownModel')}` : ''}</span>}
    </div>
    {!report ? <p className="muted">{error ? t('UsageAnalytics.failed') : t('DashboardPanel.loading')}</p> : <>
      <dl className="usage-analysis-totals">
        <div><dt>{t('UsageAnalytics.tokens')}</dt><dd>{compact(report.totals.input + report.totals.output)}</dd></div>
        <div><dt>{t('UsageAnalytics.inputOutput')}</dt><dd>{compact(report.totals.input)} / {compact(report.totals.output)}</dd></div>
        <div><dt>{t('UsageAnalytics.cache')}</dt><dd>{compact(report.totals.cacheRead)} / {compact(report.totals.cacheWrite)}</dd></div>
        <div><dt>{t('UsageAnalytics.amount')}</dt><dd>{dollars(report.totals.costUsd)}</dd></div>
      </dl>
      <p className="settings-note">{t('UsageAnalytics.costNote', { priced: report.totals.priced, total: report.totals.requests })} · {t('UsageAnalytics.reportedEstimated', { reported: dollars(report.totals.reportedUsd), estimated: dollars(report.totals.estimatedUsd) })}</p>
      {report.unallocated.requests > 0 && <p className="settings-note">{t('UsageAnalytics.unallocated', { count: report.unallocated.requests, tokens: compact(report.unallocated.input + report.unallocated.output) })}</p>}
      <div className="usage-analysis-chart" role="img" aria-label={t('UsageAnalytics.dailyTokens')}>
        {report.days.map((day) => <div key={day.day} className="usage-analysis-day" title={`${day.day} · ${amount(day)}`}>
          <span style={{ height: `${(day.input + day.output) / Math.max(1, ...report.days.map((entry) => entry.input + entry.output)) * 100}%` }} />
        </div>)}
      </div>
      <div className="usage-analysis-axis muted"><span>{report.days[0]?.day}</span><span>{report.days.at(-1)?.day}</span></div>
      <div className="usage-analysis-breakdowns">
        <div><h4>{t('UsageAnalytics.models')}</h4>{report.models.map((row) => <button type="button" className="usage-drill-row" key={`${row.agent}/${row.model}`} onClick={() => setFilter({ ...filter, agent: row.agent, model: row.model })}>
          <span>{row.model ?? t('UsageAnalytics.unknownModel')}<small className="muted">{agentLabel(row.agent)}</small></span><span>{amount(row)}</span>
        </button>)}</div>
        <div><h4>{t('UsageAnalytics.accounts')}</h4>{report.accounts.map((row) => <button type="button" className="usage-drill-row" key={`${row.agent}/${row.account}/${row.identity}`} onClick={() => setFilter({ ...filter, agent: row.agent, account: row.account, identity: row.identity })}>
          <span>{name(row.agent, row.account, row.identity)}<small className="muted">{agentLabel(row.agent)}</small></span><span>{amount(row)}</span>
        </button>)}</div>
      </div>
      {report.totals.requests === 0 && <p className="muted">{t('UsageAnalytics.empty')}</p>}
      {selected && <details><summary>{t('UsageAnalytics.sessions')}</summary>{report.sessions.map((row, index) => <div className="usage-drill-row" key={`${row.agent}/${row.session}/${index}`}>
        <span title={row.cwd ?? row.session ?? ''}>{row.cwd || row.session || t('UsageAnalytics.background')}<small className="muted">{new Date(row.at).toLocaleString(getLocale())}</small></span><span>{amount(row)}</span>
      </div>)}<p className="settings-note">{t('UsageAnalytics.sessionLimit')}</p></details>}
      {report.scan.errors.length > 0 && <p role="status" className="settings-note">{t('UsageAnalytics.partial')} · {report.scan.errors.join(' · ')}</p>}
      <p className="settings-note">{t('UsageAnalytics.scanNote', { files: report.scan.files, at: report.scan.updatedAt === null ? '—' : new Date(report.scan.updatedAt).toLocaleTimeString(getLocale()) })}</p>
    </>}
    {forecasts.length > 0 && <details className="usage-analysis-forecasts"><summary>{t('UsageAnalytics.forecasts')}</summary>{forecasts.filter((entry) => filter.agent === undefined || entry.agent === filter.agent).map((entry) => <p key={`${entry.agent}/${entry.account}/${entry.window.kind}/${entry.window.model}`}>
      <span>{agentLabel(entry.agent)} · {name(entry.agent, entry.account)} · {windowLabel(entry.window)}</span><span className="muted">{forecastText(entry)}</span>
    </p>)}</details>}
  </section>
}
