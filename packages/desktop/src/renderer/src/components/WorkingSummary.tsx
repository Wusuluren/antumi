import type { WorkActivity } from '../work-activity'
import { AgentIcon } from './icons'

// Who is at work, as one mark wherever it shows: their icons, overlapped past the first, then
// who works (the words shimmer while they do) or that the user is waited on (still, in the warning
// colour), then what they are on.
export function WorkingSummary({ activity, detail = true }: { activity: WorkActivity; detail?: boolean }) {
  const names = activity.workers.map((worker) => worker.name)
  const label = activity.state === 'awaiting' ? '等你回答' : names.length > 2 ? `${names.length} 人工作中` : `${names.join('、')} 工作中`
  return (
    <span className="working-summary" data-state={activity.state} title={activity.detail ?? label}>
      <span className="working-stack" aria-hidden="true">
        {activity.workers.slice(0, 3).map((worker, index) => <AgentIcon key={`${worker.name}-${index}`} agent={worker.agent} />)}
      </span>
      <span className="working-label">{label}</span>
      {detail && activity.detail && <span className="working-detail">{activity.detail}</span>}
    </span>
  )
}
