import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  AGENT_KINDS,
  agentDescriptor,
  tightestWindow,
  usageLevel,
  type AgentKind,
  type AgentUsage,
  type GlobalResets,
  type ResetCredit,
  type ResetCreditOutcome,
  type ResetCredits,
  type UsageWindow
} from '@antumi/protocol'
import { refreshUsage, spendResetCredit, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { usePreferences } from '../preferences'
import { clearsText, formatClock, formatDuration, globalResetText, percentText, resetText, shownPercent, SPEND_OUTCOME_TEXT, spendNote, useNow, windowLabel } from '../usage-format'
import { agentNames } from '../environment-text'
import { AgentIcon } from './icons'
import { Spinner } from './Spinner'

function errorText(usage: AgentUsage): string {
  return usage.error === 'auth-expired'
    ? `登录凭据已过期，运行一次 ${agentDescriptor(usage.agent).cli} 即可刷新`
    : '读取失败，稍后自动重试'
}

// A credit this close to expiring is worth a nudge.
const EXPIRING_SOON_MS = 24 * 60 * 60_000

const expiresSoon = (expiresAt: number | null, now: number) => expiresAt !== null && expiresAt - now < EXPIRING_SOON_MS

function expiryText(expiresAt: number | null, now: number): string {
  if (expiresAt === null) {
    return '没有过期时间'
  }
  if (expiresAt <= now) {
    return '已过期'
  }
  const date = new Date(expiresAt)
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time} 过期（还有 ${formatDuration(expiresAt - now)}）`
}

// Spending a reset, from asking first to what came of it: the credit picked by id, or without one
// whichever the service picks. A failed attempt keeps its request id, so retrying it can never
// spend a second one.
type Spending =
  | { phase: 'confirm'; creditId?: string }
  | { phase: 'pending'; creditId?: string; requestId: string }
  | { phase: 'failed'; creditId?: string; requestId: string; error: string }
  | { phase: 'done'; outcome: ResetCreditOutcome }

type SpendProps = {
  spending: Spending | null
  onSpend: (requestId: string, creditId?: string) => void
  onChange: (spending: Spending | null) => void
}

// Under the credit being spent: what it will do, then waiting, or why it did not go through.
function SpendSteps({ usage, credit, spending, onSpend, onChange }: SpendProps & { usage: AgentUsage; credit: ResetCredit | undefined; spending: Spending }) {
  if (spending.phase === 'done') {
    return null
  }
  if (spending.phase === 'pending') {
    return <div className="usage-card-spend-note" role="status"><Spinner />正在使用重置卡…</div>
  }
  const failed = spending.phase === 'failed'
  return (
    <>
      <div className="usage-card-spend-note" role={failed ? 'alert' : undefined} data-failed={failed || undefined}>
        {failed ? spending.error : spendNote(usage, credit?.clears ?? [])}
      </div>
      <div className="usage-card-spend">
        <button type="button" className="button primary" onClick={() => onSpend(failed ? spending.requestId : crypto.randomUUID(), spending.creditId)}>
          {failed ? '重试' : '确认使用'}
        </button>
        <button type="button" className="button" onClick={() => onChange(null)}>
          取消
        </button>
      </div>
    </>
  )
}

export function ResetCreditList({ usage, credits, now, spending, onSpend, onChange }: SpendProps & { usage: AgentUsage; credits: ResetCredits; now: number }) {
  if (credits.blockedBy === 'cli_version') {
    return <div className="usage-card-credits muted">升级 Claude Code 后，这里会显示可用的重置卡</div>
  }
  const unlisted = credits.available - credits.credits.length
  const busy = spending !== null && spending.phase !== 'done'
  const steps = (credit: ResetCredit | undefined) => spending && <SpendSteps usage={usage} credit={credit} spending={spending} onSpend={onSpend} onChange={onChange} />
  // Spent one by one where the service names them; where it does not, it picks the one to spend.
  const byId = credits.usable === true && credits.credits.some((credit) => credit.id)
  const unnamed = credits.usable === true && !byId && credits.available > 0
  const labels = byId ? [] : [...new Set(credits.credits.flatMap((credit) => (credit.label ? [credit.label] : [])))]
  return (
    <div className="usage-card-credits">
      <div className="usage-card-credits-title">可用重置卡 {credits.available} 张</div>
      {labels.map((label) => (
        <div key={label} className="usage-card-credit-label">
          {label}
        </div>
      ))}
      {credits.credits.map((credit, index) => {
        const clears = clearsText(credit.clears)
        if (byId && credit.id) {
          const picked = spending !== null && spending.phase !== 'done' && spending.creditId === credit.id
          return (
            <div key={credit.id} className="usage-card-credit-item">
              <div className="usage-card-credit-row">
                <div className="usage-card-credit-text">
                  <div className="usage-card-credit-label">{credit.label ?? (clears || '重置卡')}</div>
                  <div className="usage-card-credit-expiry" data-soon={expiresSoon(credit.expiresAt, now) || undefined}>
                    {expiryText(credit.expiresAt, now)}
                  </div>
                </div>
                {!picked && (
                  <button type="button" className="button" disabled={busy} onClick={() => onChange({ phase: 'confirm', creditId: credit.id })}>
                    使用
                  </button>
                )}
              </div>
              {picked && steps(credit)}
            </div>
          )
        }
        return (
          <div key={index} className="usage-card-credit" data-soon={expiresSoon(credit.expiresAt, now) || undefined}>
            {expiryText(credit.expiresAt, now)}
            {clears && ` · ${clears}`}
          </div>
        )
      })}
      {unlisted > 0 && <div className="usage-card-credit">另有 {unlisted} 张没有给出过期时间</div>}
      {unnamed && (spending === null || spending.phase === 'done' ? (
        <div className="usage-card-spend">
          <button type="button" className="button" onClick={() => onChange({ phase: 'confirm' })}>
            使用一张重置卡
          </button>
        </div>
      ) : steps(credits.credits[0]))}
      {spending?.phase === 'done' && (
        <div className="usage-card-spend-note" role="status" data-outcome={spending.outcome}>{SPEND_OUTCOME_TEXT[spending.outcome]}</div>
      )}
      {!credits.usable && <div className="usage-card-credits-hint">{agentDescriptor(usage.agent).usageWhere}</div>}
    </div>
  )
}

const fullDate = (at: number) => new Date(at).toLocaleString('zh-CN', { hour12: false })

// What the service announced for everyone, from a community tracker: a word that it is not official,
// and the credit the tracker asks for.
export function GlobalResetList({ resets, now }: { resets: GlobalResets; now: number }) {
  const text = globalResetText(resets, now)
  const source = (url: string | null, label: string) => url && <a className="usage-card-global-source" href={url} target="_blank" rel="noreferrer">{label}</a>
  return (
    <div className="usage-card-global">
      <div className="usage-card-credits-title">全员重置</div>
      {resets.upcoming && text.upcoming && (
        <div className="usage-card-global-upcoming" title={fullDate(resets.upcoming.at)}>
          {text.upcoming}
          {resets.upcoming.text && <q>{resets.upcoming.text}</q>}
          {source(resets.upcoming.sourceUrl, '原帖')}
        </div>
      )}
      {resets.latest && text.latest && (
        <div className="usage-card-global-line" title={fullDate(resets.latest.at)}>
          {text.latest}
          {source(resets.latest.sourceUrl, '原帖')}
        </div>
      )}
      {text.chance && <div className="usage-card-global-line">{text.chance}</div>}
      <div className="usage-card-credits-hint">
        据 X 上的公告，非官方消息。数据来自 <a href="https://limitreset.net" target="_blank" rel="noreferrer">LimitReset</a> 和 <a href="https://codex-resets.com" target="_blank" rel="noreferrer">Codex Resets</a>
      </div>
    </div>
  )
}

const CARD_WIDTH = 340
// Hovering past on the way somewhere else should not flash a card.
const CARD_DELAY_MS = 300
const CARD_HIDE_DELAY_MS = 200

// Every window in full, above the segment. Rendered into <body> at a fixed position: inside the
// status bar it would be clipped, and a button may not contain it.
function UsageCard({ usage, now, anchor, id, cardRef, onEnter, onLeave, onRefresh, refreshing, spending, onSpend, onSpendingChange }: {
  usage: AgentUsage
  now: number
  anchor: DOMRect
  id: string
  cardRef: RefObject<HTMLDivElement | null>
  onEnter: () => void
  onLeave: () => void
  onRefresh: () => void
  refreshing: boolean
  spending: Spending | null
  onSpend: (requestId: string, creditId?: string) => void
  onSpendingChange: (spending: Spending | null) => void
}) {
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - CARD_WIDTH - 8))
  const bottom = window.innerHeight - anchor.top + 6
  const footer =
    usage.status === 'error'
      ? `${errorText(usage)}${usage.windows.length > 0 ? `（数据停留在 ${formatClock(usage.updatedAt, now)}）` : ''}`
      : `${formatDuration(now - usage.updatedAt)}前更新`
  return (
    <div
      id={id}
      ref={cardRef}
      role="dialog"
      aria-label={`${agentLabel(usage.agent)} 用量额度`}
      className="usage-card"
      style={{ left, bottom, width: CARD_WIDTH }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocusCapture={onEnter}
      onBlurCapture={onLeave}
    >
      <div className="usage-card-title">
        {agentLabel(usage.agent)}
        {usage.plan && <span className="muted"> · {usage.plan}</span>}
      </div>
      {usage.windows.map((window) => {
        const used = Math.round(window.usedPercent)
        return (
          <div key={`${window.kind}-${window.model}`} className="usage-card-row" data-level={usageLevel(window.usedPercent)}>
            <span className="usage-card-label">{windowLabel(window)}</span>
            <span className="usage-meter" aria-hidden="true">
              <span style={{ width: `${used}%` }} />
            </span>
            <span className="usage-card-value">
              已用 {used}%，剩余 {100 - used}%
            </span>
            {window.resetsAt !== null && <span className="usage-card-reset">{resetText(window, now)}</span>}
          </div>
        )
      })}
      {usage.resetCredits && (usage.resetCredits.available > 0 || usage.resetCredits.blockedBy || spending) && (
        <ResetCreditList usage={usage} credits={usage.resetCredits} now={now} spending={spending} onSpend={onSpend} onChange={onSpendingChange} />
      )}
      {usage.globalResets && <GlobalResetList resets={usage.globalResets} now={now} />}
      <div className="usage-card-footer">
        <span>{footer}</span>
        <button type="button" className="link-button usage-card-refresh" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? '刷新中…' : '立即刷新'}
        </button>
      </div>
    </div>
  )
}

// Model-specific caps only take footer space once they are the ones about to bite.
function inlineWindows(windows: readonly UsageWindow[]): UsageWindow[] {
  return windows.filter((window) => window.model === null || usageLevel(window.usedPercent) !== 'normal')
}

function UsageSegment({ usage, now }: { usage: AgentUsage; now: number }) {
  const display = usePreferences((s) => s.usageDisplay)
  const windows = inlineWindows(usage.windows)
  // The meter follows the numbers beside it, so a model's cap moves it once it is shown.
  const tightest = tightestWindow(windows)
  const cardId = useId()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [pinned, setPinned] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [spending, setSpending] = useState<Spending | null>(null)
  // Asking, waiting or failed: the card stays put however the pointer wanders.
  const holding = spending !== null && spending.phase !== 'done'
  const trigger = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const close = useCallback(() => {
    clearTimeout(timer.current)
    setPinned(false)
    setAnchor(null)
  }, [])
  const show = (element: HTMLElement, delay: number) => {
    if (pinned) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAnchor(element.getBoundingClientRect()), delay)
  }
  const hide = () => {
    clearTimeout(timer.current)
    if (!pinned && !holding) timer.current = setTimeout(() => setAnchor(null), CARD_HIDE_DELAY_MS)
  }
  const keepOpen = () => clearTimeout(timer.current)
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await refreshUsage()
    } finally {
      setRefreshing(false)
    }
  }
  const spend = async (requestId: string, creditId?: string) => {
    setSpending({ phase: 'pending', creditId, requestId })
    try {
      setSpending({ phase: 'done', outcome: await spendResetCredit(usage.agent, requestId, creditId) })
    } catch (error) {
      setSpending({ phase: 'failed', creditId, requestId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  // A closed card starts over, but one still spending reports when it is next opened.
  useEffect(() => {
    if (!anchor) setSpending((spending) => (spending?.phase === 'pending' ? spending : null))
  }, [anchor])
  useEffect(() => {
    if (!anchor) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !card.current?.contains(event.target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [anchor, close])
  useEffect(() => {
    if (pinned) card.current?.querySelector('button')?.focus()
  }, [pinned])
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="usage-segment"
        data-stale={usage.status === 'error' || undefined}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-controls={anchor ? cardId : undefined}
        onMouseEnter={(event) => show(event.currentTarget, CARD_DELAY_MS)}
        onMouseLeave={hide}
        onClick={(event) => {
          if (pinned) close()
          else {
            clearTimeout(timer.current)
            setAnchor(event.currentTarget.getBoundingClientRect())
            setPinned(true)
          }
        }}
      >
        {/* Just the mark: the card that opens on hover leads with the full name. */}
        <span className="usage-agent" role="img" aria-label={agentLabel(usage.agent)}>
          <AgentIcon agent={usage.agent} />
        </span>
        {tightest && (
          <span className="usage-meter" data-level={usageLevel(tightest.usedPercent)} aria-hidden="true">
            <span style={{ width: `${shownPercent(tightest, display)}%` }} />
          </span>
        )}
        {windows.map((window, index) => (
          <span key={`${window.kind}-${window.model}`} className="usage-window" data-level={usageLevel(window.usedPercent)}>
            {index > 0 && <span className="usage-separator">·</span>}
            {windowLabel(window)} {percentText(window, display)}
          </span>
        ))}
        {usage.resetCredits && usage.resetCredits.available > 0 && (
          <span className="usage-credits" data-soon={expiresSoon(usage.resetCredits.credits[0]?.expiresAt ?? null, now) || undefined}>
            重置卡 {usage.resetCredits.available}
          </span>
        )}
        {usage.globalResets?.upcoming && <span className="usage-global-soon">即将重置</span>}
        {usage.status === 'error' && (
          <span className="usage-stale" role="img" aria-label={errorText(usage)}>
            ⚠
          </span>
        )}
      </button>
      {anchor && createPortal(
        <UsageCard
          usage={usage}
          now={now}
          anchor={anchor}
          id={cardId}
          cardRef={card}
          onEnter={keepOpen}
          onLeave={hide}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          spending={spending}
          onSpend={(requestId, creditId) => void spend(requestId, creditId)}
          onSpendingChange={setSpending}
        />,
        document.body
      )}
    </>
  )
}

export function UsageBar() {
  const usage = useCore((s) => s.usage)
  const visible = usePreferences((s) => s.showUsage)
  const now = useNow(60_000)

  // An older core has no usage methods: show nothing rather than a dead segment.
  if (usage === null || !visible) {
    return null
  }
  const known = AGENT_KINDS.map((agent) => usage[agent]).filter((entry) => entry !== undefined)
  const shown = known.filter((entry) => entry.status !== 'signed-out')

  return (
    <div className="statusbar-group" aria-label="Agent 用量额度">
      {known.length === 0 && <span className="statusbar-hint">正在读取用量额度…</span>}
      {known.length > 0 && shown.length === 0 && (
        <span className="statusbar-hint">未检测到 {agentNames()} 的登录，登录后这里会显示用量额度</span>
      )}
      {shown.map((entry) => (
        <UsageSegment key={entry.agent} usage={entry} now={now} />
      ))}
    </div>
  )
}
