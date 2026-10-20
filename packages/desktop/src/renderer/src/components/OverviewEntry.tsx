import { setOverviewOpen, useOverview, useCore } from '../core-store'
import { CountBadge } from './CountBadge'
import { ListIcon } from './icons'

export function OverviewEntry() {
  const open = useCore((s) => s.overviewOpen)
  const count = useOverview().counts.mine
  return (
    <button type="button" className="inbox-entry overview-entry" aria-current={open}
      aria-label={`总览${count ? `，${count} 项等你处理` : ''}`} onClick={() => setOverviewOpen(true)}>
      <ListIcon />
      <span>总览</span>
      <CountBadge count={count} />
    </button>
  )
}
