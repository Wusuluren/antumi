import { setRoutinesOpen, useCore, useRoutinesSupported } from '../core-store'
import { CountBadge } from './CountBadge'
import { ClockIcon } from './icons'

// The way to what runs later, at the top of the sidebar beside the overview: the routines, whose
// conversations are kept out of the list below, with how many runs are unread; and the reservations,
// marked when one could not start, as the status bar marks it. Gone on a core without routines.
export function RoutinesEntry() {
  const open = useCore((s) => s.routinesOpen)
  const unread = useCore((s) => s.routines.reduce((sum, routine) => sum + routine.unread, 0))
  // A routine's runs are the routine's, counted above.
  const failed = useCore((s) => s.schedules.filter((run) => run.status === 'failed' && run.target.kind !== 'routine').length)
  const supported = useRoutinesSupported()
  if (!supported) return null
  return (
    <button type="button" className="inbox-entry sidebar-routines" aria-current={open} onClick={() => setRoutinesOpen(true)}>
      <ClockIcon />
      <span>定时</span>
      <CountBadge count={unread} aria-label={`${unread} 次运行未看`} />
      {failed > 0 && <span className="inbox-entry-alert" role="img" aria-label={`${failed} 个预约没能开始`} title={`${failed} 个预约没能开始`}>!</span>}
    </button>
  )
}
