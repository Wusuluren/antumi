import { setAwakeMode, setRoutinesOpen, useCore, useSchedulesSupported, type RoutinesTab } from '../core-store'
import { UNATTENDED_LABEL } from '../schedules'
import { CloseIcon } from './icons'
import { RoutinesSection } from './RoutinesSection'
import { SettingsLink } from './SchedulePicker'
import { SchedulesPanel } from './SchedulesPanel'
import { Segmented } from './SettingsControls'

const TABS: ReadonlyArray<{ value: RoutinesTab; label: string }> = [{ value: 'routines', label: '定时' }, { value: 'schedules', label: '预约' }]

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
        <p className="muted">
          按时间重复的任务：到点新开一个会话，把指令发给 agent，以「{UNATTENDED_LABEL[mode]}」无人值守地做完，<SettingsLink />。
          做完的运行带未读标记，从规则下面的历史里打开看结果；它开的会话不进左侧的会话列表。
        </p>
        {awake && awake.mode !== 'on' && scheduled && (
          <p className="schedule-warning">
            电脑睡着时到点不会运行，醒来后只补最近错过的一次。
            <button type="button" className="link-button" onClick={() => void setAwakeMode('on')}>改为始终保持唤醒</button>
          </p>
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
    <section className="worktrees-page routines-page" aria-label="定时">
      <header className="worktrees-header">
        <div className="worktrees-heading">
          <h2>定时</h2>
        </div>
        {schedulesSupported && <>
          <Segmented labelId="routines-tab" value={tab} options={TABS} onChange={(next) => setRoutinesOpen(true, next)} />
          <span id="routines-tab" hidden>定时页的内容</span>
        </>}
        <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => setRoutinesOpen(false)}>
          <CloseIcon />
        </button>
      </header>
      {tab === 'schedules' ? <SchedulesPanel /> : <RoutinesPanel />}
    </section>
  )
}
