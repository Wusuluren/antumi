import { setOverviewOpen, useOverview, useCore } from '../core-store'
import { ListIcon } from './icons'

export function OverviewEntry() {
  const open = useCore((s) => s.overviewOpen)
  const count = useOverview().counts.mine
  return (
    <button type="button" className="inbox-entry overview-entry" aria-current={open}
      aria-label={`总览${count ? `，${count} 项等你处理` : ''}`} onClick={() => setOverviewOpen(true)}>
      <ListIcon />
      <span>总览</span>
      {count > 0 && <span className="inbox-entry-count">{count}</span>}
    </button>
  )
}
