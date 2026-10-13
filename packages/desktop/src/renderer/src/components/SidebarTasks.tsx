import { selectTask, setNewTaskOpen, useCore, useTaskBoardOpen } from '../core-store'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { BoardIcon, PlusIcon } from './icons'

// The sidebar's way to the task board, which holds every task: the entry counts the ones someone
// is at, and its ＋ starts a new one from anywhere.
export function SidebarTasks() {
  const open = useTaskBoardOpen()
  const running = useCore((s) => Object.values(s.tasks).filter((task) => task.status === 'running').length)
  const review = useCore((s) => Object.values(s.tasks).filter((task) => task.status === 'review').length)
  const counts = [running > 0 && `执行中 ${running}`, review > 0 && `待验收 ${review}`].filter(Boolean).join(' · ')
  return (
    <nav className="sidebar-tasks" aria-label="任务">
      <div className="sidebar-tasks-entry">
        <button type="button" className="inbox-entry" aria-current={open} onClick={() => selectTask(null)}>
          <BoardIcon />
          <span>任务</span>
          {counts && <span className="sidebar-tasks-counts">{counts}</span>}
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
