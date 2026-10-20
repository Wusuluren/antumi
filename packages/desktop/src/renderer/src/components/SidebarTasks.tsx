import { tasksWaitingOnUser } from '../attention'
import { selectTask, setNewTaskOpen, useActionableItems, useTaskBoardOpen } from '../core-store'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { CountBadge } from './CountBadge'
import { BoardIcon, PlusIcon } from './icons'

// The sidebar's way to the task board, which holds every task: the entry counts only the ones held
// up on the user, as the board shows the rest, and its ＋ starts a new one from anywhere.
export function SidebarTasks() {
  const open = useTaskBoardOpen()
  const waiting = tasksWaitingOnUser(useActionableItems())
  return (
    <nav className="sidebar-tasks" aria-label="任务">
      <div className="sidebar-tasks-entry">
        <button type="button" className="inbox-entry" aria-current={open} aria-label={`任务${waiting ? `，${waiting} 个等你处理` : ''}`} onClick={() => selectTask(null)}>
          <BoardIcon />
          <span>任务</span>
          <CountBadge count={waiting} title={`${waiting} 个任务等你处理`} />
        </button>
        <button
          type="button"
          className="icon-button sidebar-tasks-add sidebar-add"
          aria-label="新建任务"
          data-tooltip={`新建任务 ${PRIMARY_KEY_LABEL}N`}
          onClick={() => setNewTaskOpen(true)}
        >
          <PlusIcon />
        </button>
      </div>
    </nav>
  )
}
