import { localized, t, tr } from '../i18n'
import { useEffect, useId, useState } from 'react'
import { isScheduleOpen, type Routine, type ScheduledRun } from '@antumi/protocol'
import { selectConversation, useCore } from '../core-store'
import { reasonText } from '../labels'
import { deleteRoutine, fetchRoutineRuns, isUnread, markRoutineAllSeen, nextRunText, routineAgentLabel, runOutcomeText, runRoutineNow, scheduleText, updateRoutine } from '../routines'
import { scheduleTime } from '../schedules'
import { useNow } from '../usage-format'
import { ChevronRightIcon, ClockIcon, CloseIcon, PencilIcon, PlayIcon } from './icons'
import type { ReactNode } from 'react'
import { RoutineEditor } from './RoutineEditor'
import { Segmented } from './SettingsControls'
import { ROUTINE_TEMPLATES, type RoutineTemplate } from '../routine-templates'
import { BookIcon, BranchIcon, ChartIcon, DocumentIcon, FileChangesIcon, FolderIcon, PulseIcon, RefreshIcon } from './icons'

const PAGE = 50

// A routine's runs, newest first, fetched when the row opens and again as the routine changes.
function History({ routine, now }: { routine: Routine; now: number }) {
  const rpc = useCore((s) => s.rpc)
  const [runs, setRuns] = useState<ScheduledRun[] | null>(null)
  const [more, setMore] = useState(false)
  const key = `${routine.updatedAt}:${routine.lastRun?.id}:${routine.lastRun?.status}:${routine.lastRun?.finishedAt}:${routine.unread}`
  useEffect(() => {
    let current = true
    void fetchRoutineRuns(routine.id, null).then((page) => {
      if (!current || !page) return
      setRuns(page)
      setMore(page.length === PAGE)
    })
    return () => { current = false }
  }, [routine.id, key])

  const older = async () => {
    const last = runs?.at(-1)
    if (!last) return
    const page = await fetchRoutineRuns(routine.id, last.createdAt)
    if (!page) return
    setRuns([...(runs ?? []), ...page])
    setMore(page.length === PAGE)
  }
  const markSeen = (run: ScheduledRun) => void rpc?.call('routines.markSeen', { runId: run.id }).catch(() => {})

  if (runs === null) return <p className="routine-history-empty muted">{t('DashboardPanel.loading')}</p>
  if (runs.length === 0) return <p className="routine-history-empty muted">{t('RoutinesSection.noRunsYet')}</p>
  return (
    <>
      <ul className="routine-history">
        {runs.map((run) => {
          const unread = isUnread(run)
          const skipped = run.status === 'cancelled'
          return (
            <li key={run.id} className="routine-run" data-skipped={skipped || undefined} data-unread={unread || undefined}>
              <span className="routine-run-dot" aria-label={unread ? t('OverviewView.unread') : undefined} />
              <span className="routine-run-when">{scheduleTime(run.dueAt ?? run.createdAt, now)}</span>
              {run.conversationId ? (
                <button type="button" className="schedule-title routine-run-open" onClick={() => selectConversation(run.conversationId)}>{runOutcomeText(run, now)}</button>
              ) : (
                <span className="routine-run-text">{runOutcomeText(run, now)}</span>
              )}
              {unread && !run.conversationId && <button type="button" className="link-button" onClick={() => markSeen(run)}>{t('RoutinesSection.read')}</button>}
            </li>
          )
        })}
      </ul>
      {more && <button type="button" className="link-button routine-history-more" onClick={() => void older()}>{t('RoutinesSection.earlier')}</button>}
    </>
  )
}

function Row({ routine, now, onEdit }: { routine: Routine; now: number; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const failure = routine.lastRun && (routine.lastRun.status === 'failed' || routine.lastRun.outcome === 'failed') ? routine.lastRun.error : null
  return (
    <li className="routine-row" data-paused={!routine.enabled || undefined} data-open={open || undefined}>
      <div className="routine-line">
        <button type="button" className="routine-toggle" aria-expanded={open} aria-label={open ? t('RoutinesSection.collapseHistory') : t('RoutinesSection.expandHistory')} onClick={() => setOpen(!open)}>
          <ChevronRightIcon />
        </button>
        <span className="routine-main">
          <span className="routine-title-line">
            <button type="button" className="schedule-title routine-title" onClick={() => setOpen(!open)}>{routine.title}</button>
            {routine.unread > 0 && <span className="inbox-entry-count routine-unread" aria-label={t('RoutinesSection.unreadRuns', { value1: routine.unread })}>{routine.unread}</span>}
          </span>
          <span className="schedule-meta">
            {scheduleText(routine.schedule)} · {routineAgentLabel(routine.target.agent)} · {nextRunText(routine, now)}
            {routine.lastRun && isScheduleOpen(routine.lastRun) && <span> · {runOutcomeText(routine.lastRun, now)}</span>}
            {failure && <span className="routine-failure">{tr('RoutinesSection.last', { value1: reasonText(failure, failure) })}</span>}
          </span>
        </span>
        <span className="schedule-actions">
          {deleting ? (
            <>
              <span className="muted routine-confirm">{t('RoutinesSection.conversationsCreatedByThisRoutineReturnToThe')}</span>
              <button type="button" className="link-button" onClick={() => void deleteRoutine(routine.id)}>{t('McpSettingsSection.confirmDeletion')}</button>
              <button type="button" className="link-button" onClick={() => setDeleting(false)}>{t('ChatCommandSettings.cancel')}</button>
            </>
          ) : (
            <>
              {routine.unread > 0 && <button type="button" className="link-button" onClick={() => markRoutineAllSeen(routine.id)}>{t('RoutinesSection.markAllAsRead')}</button>}
              <button type="button" className="link-button" onClick={() => void updateRoutine(routine.id, { enabled: !routine.enabled })}>{routine.enabled ? t('DiscussionView.pause') : t('RoutinesSection.enable')}</button>
              <button type="button" className="tool-button" aria-label={t('OverviewView.runNow')} data-tooltip={t('RoutinesSection.runImmediatelyIgnoringTimeAndQuota')} onClick={() => void runRoutineNow(routine.id)}><PlayIcon /></button>
              <button type="button" className="tool-button" aria-label={t('chatTools.edit')} data-tooltip={t('chatTools.edit')} onClick={onEdit}><PencilIcon /></button>
              <button type="button" className="tool-button" aria-label={t('ChatCommandSettings.delete')} data-tooltip={t('ChatCommandSettings.delete')} onClick={() => setDeleting(true)}><CloseIcon /></button>
            </>
          )}
        </span>
      </div>
      {open && <History routine={routine} now={now} />}
    </li>
  )
}

const TEMPLATE_ICON: Record<RoutineTemplate['icon'], ReactNode> = {
  changes: <FileChangesIcon />, refresh: <RefreshIcon />, branch: <BranchIcon />, pulse: <PulseIcon />,
  folder: <FolderIcon />, document: <DocumentIcon />, book: <BookIcon />, chart: <ChartIcon />
}

// Common chores written out, to start a routine from: a row opens the editor filled in.
function Templates({ onPick }: { onPick: (template: RoutineTemplate) => void }) {
  return (
    <ul className="worktree-list routine-list" aria-label={t('RoutinesSection.templates')}>
      {ROUTINE_TEMPLATES.map((template) => (
        <li key={template.id} className="routine-template">
          <span className="routine-template-icon" aria-hidden="true">{TEMPLATE_ICON[template.icon]}</span>
          <span className="routine-main">
            <button type="button" className="schedule-title routine-title" onClick={() => onPick(template)}>{template.title}</button>
            <span className="schedule-meta routine-template-description">{template.description}</span>
          </span>
          <span className="schedule-state routine-template-when"><ClockIcon />{scheduleText(template.schedule)}</span>
          <span className="schedule-actions">
            <button type="button" className="link-button" onClick={() => onPick(template)}>{t('RoutinesSection.useThis')}</button>
          </span>
        </li>
      ))}
    </ul>
  )
}

type Editing = { routine: Routine | null; template: RoutineTemplate | null }
type Tab = 'rules' | 'templates'
const TABS: readonly { value: Tab; label: string }[] = localized(() => ([{ value: 'rules', label: t('RoutinesSection.mine') }, { value: 'templates', label: t('RoutinesSection.templates') }]))

// The routines, each with when it next runs and what its runs did: the runs' conversations are
// opened from here and nowhere else. Beside them, on their own tab, templates to start one from,
// which is where a user without any lands first.
export function RoutinesSection() {
  const routines = useCore((s) => s.routines)
  const now = useNow(60_000)
  const tabsId = useId()
  const [tab, setTab] = useState<Tab>(() => (routines.length === 0 ? 'templates' : 'rules'))
  const [editing, setEditing] = useState<Editing | null>(null)
  return (
    <section className="worktree-group routines-section" aria-label={t('RoutinesSection.routineList')}>
      <div className="routines-tabs">
        <Segmented labelId={tabsId} value={tab} options={TABS.map((each) => (each.value === 'rules' ? { ...each, label: t('RoutinesSection.mine_1485', { value1: routines.length }) } : each))} onChange={setTab} />
        <span id={tabsId} className="visually-hidden">{t('RoutinesSection.show')}</span>
        <button type="button" className="link-button routines-new" onClick={() => setEditing({ routine: null, template: null })}>{t('ConversationChat.new')}</button>
      </div>
      {tab === 'rules'
        ? routines.length === 0
          ? <p className="worktrees-empty muted">{t('RoutinesSection.noRoutinesYetClickNewToSetRecurring')}</p>
          : <ul className="worktree-list routine-list">{routines.map((routine) => <Row key={routine.id} routine={routine} now={now} onEdit={() => setEditing({ routine, template: null })} />)}</ul>
        : <Templates onPick={(template) => setEditing({ routine: null, template })} />}
      {editing && <RoutineEditor routine={editing.routine} template={editing.template} onClose={() => setEditing(null)} />}
    </section>
  )
}
