import { localized, t, tr } from '../i18n'
import { setAwakeMode, setRoutinesOpen, useCore, useSchedulesSupported, type RoutinesTab } from '../core-store'
import { UNATTENDED_LABEL } from '../schedules'
import { CloseIcon } from './icons'
import { RoutinesSection } from './RoutinesSection'
import { SettingsLink } from './SchedulePicker'
import { SchedulesPanel } from './SchedulesPanel'
import { Segmented } from './SettingsControls'

const TABS: ReadonlyArray<{ value: RoutinesTab; label: string }> = localized(() => ([{ value: 'routines', label: t('RoutinesEntry.scheduled') }, { value: 'schedules', label: t('OverviewView.schedules') }]))

// The routines: rules that open a conversation on a schedule, each with its runs. Their
// conversations are kept out of the sidebar, so this is where they are found.
function RoutinesPanel() {
  const routines = useCore((s) => s.routines)
  const mode = useCore((s) => s.chatSettings?.unattendedMode ?? 'acceptEdits')
  const awake = useCore((s) => s.awake)
  const scheduled = routines.some((routine) => routine.enabled && routine.schedule.kind !== 'manual')
  return (
    <>
      <div className="routines-intro">
        <p className="muted">{tr('RoutinesView.repeatingTasksEachRunOpensANewConversation', { value1: UNATTENDED_LABEL[mode], value2: <SettingsLink /> })}</p>
        {awake && awake.mode !== 'on' && scheduled && (
          <p className="schedule-warning">{tr('RoutinesView.nothingRunsWhileTheComputerSleepsOnlyThe', { value1: <button type="button" className="link-button" onClick={() => void setAwakeMode('on')}>{t('RoutinesView.switchToAlwaysAwake')}</button> })}</p>
        )}
      </div>
      <RoutinesSection />
    </>
  )
}

// What runs later without anyone there: the routines that run again and again, and beside them the
// reservations (预约) that run once, each on a tab of its own.
export function RoutinesView() {
  const schedulesSupported = useSchedulesSupported()
  const chosen = useCore((s) => s.routinesTab)
  const tab = schedulesSupported ? chosen : 'routines'
  return (
    <section className="worktrees-page routines-page" aria-label={t('RoutinesEntry.scheduled')}>
      <header className="worktrees-header">
        <div className="worktrees-heading">
          <h2>{t('RoutinesEntry.scheduled')}</h2>
        </div>
        {schedulesSupported && <>
          <Segmented labelId="routines-tab" value={tab} options={TABS} onChange={(next) => setRoutinesOpen(true, next)} />
          <span id="routines-tab" hidden>{t('RoutinesView.scheduledPageContent')}</span>
        </>}
        <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={() => setRoutinesOpen(false)}>
          <CloseIcon />
        </button>
      </header>
      {tab === 'schedules' ? <SchedulesPanel /> : <RoutinesPanel />}
    </section>
  )
}
