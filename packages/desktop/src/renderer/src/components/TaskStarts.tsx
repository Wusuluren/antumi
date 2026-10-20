import { getLocale, t, tr } from '../i18n'
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { checkEditStart, START_HEAD, type RepoStartOptions, type Task, type TaskRepo } from '@antumi/protocol'
import { perform, updateTask, useCore, useTaskStartSupported } from '../core-store'
import { dayAndTime, reasonText } from '../labels'
import { fallbackText, pickedText, shortRef, START_NOTE_TEXT } from '../task-starts'
import { CheckIcon, ChevronDownIcon } from './icons'
import { Popover } from './Popover'
import { projectName } from './ProjectPicker'

// Tasks by the branch they made, so a dependency's branch can go by its task's title.
function useBranchTasks(): ReadonlyMap<string, Task> {
  const tasks = useCore((s) => s.tasks)
  return useMemo(() => new Map(Object.values(tasks).flatMap((task) => task.repos.flatMap((repo) => (repo.branch ? [[repo.branch, task] as const] : [])))), [tasks, getLocale()])
}

const titleIn = (branchTasks: ReadonlyMap<string, Task>) => (branch: string) => branchTasks.get(branch)?.title

function Choice({ label, description, checked, onPick }: { label: string; description: string; checked: boolean; onPick: () => void }) {
  return (
    <li className="menu-row">
      <button type="button" className="menu-item task-start-choice" aria-pressed={checked} onClick={onPick}>
        <span className="task-start-choice-text">
          <span>{label}</span>
          <span className="task-start-choice-description">{description}</span>
        </span>
        {checked && <span className="menu-check"><CheckIcon /></span>}
      </button>
    </li>
  )
}

function StartMenu({ repo, option, branchTasks, onPick, onClose }: {
  repo: TaskRepo
  option: RepoStartOptions
  branchTasks: ReadonlyMap<string, Task>
  onPick: (ref: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const refs = needle ? option.refs.filter((ref) => shortRef(ref).toLowerCase().includes(needle)) : option.refs
  const fallback = fallbackText(option, titleIn(branchTasks))
  const onSearchKey = (event: KeyboardEvent) => {
    const first = refs[0]
    if (event.key === 'Enter' && first) {
      event.preventDefault()
      onPick(first)
    }
  }
  return (
    <Popover label={t('TaskStarts.chooseStartingPoint')} onClose={onClose}>
      <ul className="menu-list">
        <Choice label={t('TaskStarts.default', { value1: fallback.ref })} description={fallback.says} checked={repo.startRef === null} onPick={() => onPick(null)} />
        {option.current && (
          <Choice label={t('TaskStarts.projectSCurrentBranch', { value1: option.current })} description={t('TaskStarts.useWhicheverBranchIsCheckedOutInThis')} checked={repo.startRef === START_HEAD} onPick={() => onPick(START_HEAD)} />
        )}
      </ul>
      <div className="menu-separator" role="separator" />
      <input
        className="input menu-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onSearchKey}
        placeholder={t('DraftBranchPicker.searchBranchesEnterToSelectTheFirst')}
        aria-label={t('ConversationBranches.searchBranches')}
      />
      {refs.length > 0 && (
        <ul className="menu-list task-start-refs">
          {refs.map((ref) => {
            const owner = branchTasks.get(shortRef(ref))
            return (
              <li key={ref} className="menu-row">
                <button type="button" className="menu-item" aria-pressed={repo.startRef === ref} onClick={() => onPick(ref)}>
                  <span className="menu-item-title mono">{shortRef(ref)}</span>
                  {owner && <span className="menu-item-path">{tr('TaskStarts.task', { value1: owner.title })}</span>}
                  {repo.startRef === ref && <span className="menu-check"><CheckIcon /></span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="menu-note">{refs.length === 0 ? t('ConversationBranches.noMatchingBranches') : t('TaskStarts.localAndRemoteBranchesRemoteBranchesAreFetched')}</p>
    </Popover>
  )
}

function StartPicker({ task, repo, option, named }: { task: Task; repo: TaskRepo; option: RepoStartOptions; named: boolean }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const branchTasks = useBranchTasks()
  const blocker = checkEditStart(task, repo)
  const picked = pickedText(repo, option, titleIn(branchTasks))
  const pick = (ref: string | null) => {
    close()
    if (ref !== repo.startRef) void updateTask(task.id, { starts: [{ path: repo.path, ref }] })
  }
  return (
    <div className="task-start">
      {named && <span className="task-start-project">{projectName(repo.path)}</span>}
      <span>{t('DraftBranchPicker.from')}</span>
      <span className="menu-anchor">
        <button
          type="button"
          className="chip task-start-button"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={blocker !== null}
          aria-label={t('TaskStarts.startingPointFor', { value1: projectName(repo.path), value2: picked.ref })}
          title={blocker ? reasonText(blocker, blocker) : t('TaskStarts.whereToBranchTheTaskFor', { value1: projectName(repo.path) })}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="mono">{picked.ref}</span>
          <ChevronDownIcon />
        </button>
        {open && <StartMenu repo={repo} option={option} branchTasks={branchTasks} onPick={pick} onClose={close} />}
      </span>
      <span>{t('TaskStarts.branch')}</span>
      {picked.says && <span className="muted">· {picked.says}</span>}
      {repo.startRef !== null && option.stacked && <p className="task-start-note">{t('TaskStarts.dependencyTaskChangesAreNotIncluded')}</p>}
    </div>
  )
}

function StartRecord({ repo, named }: { repo: TaskRepo & { start: NonNullable<TaskRepo['start']> }; named: boolean }) {
  const { start } = repo
  return (
    <div className="task-start">
      {named && <span className="task-start-project">{projectName(repo.path)}</span>}
      <span>{tr('TaskStarts.branchedFrom', { value1: <span className="mono">{start.ref}</span>, value2: <span className="mono muted">{start.commit.slice(0, 7)}</span> })}</span>
      <span className="muted">· {dayAndTime(start.at)}</span>
      {start.note && <p className="task-start-note" data-note={start.note}>{START_NOTE_TEXT[start.note]}</p>}
    </div>
  )
}

// Where each git repo's branch starts: picked until the branch is made, a record after. A plain
// folder runs in place and has none; neither has a branch made before starts were recorded.
export function TaskStarts({ task }: { task: Task }) {
  const supported = useTaskStartSupported()
  const [options, setOptions] = useState<readonly RepoStartOptions[]>([])
  // Read again when what they depend on changes: the repos, their branches, the dependencies.
  const key = `${task.repos.map((repo) => `${repo.path}\n${repo.branch ?? ''}`).join('\n')}\n${task.dependsOn.join(',')}`
  useEffect(() => {
    if (!supported) return
    let live = true
    void perform((rpc) => rpc.call('tasks.startOptions', { id: task.id })).then((result) => {
      if (live && result) setOptions(result)
    })
    return () => {
      live = false
    }
  }, [supported, task.id, key])

  if (!supported) return null
  const named = task.repos.length > 1
  const rows = task.repos.flatMap((repo) => {
    if (repo.start) return [<StartRecord key={repo.path} repo={{ ...repo, start: repo.start }} named={named} />]
    const option = options.find((each) => each.path === repo.path)
    if (repo.branch || !option?.git) return []
    return [<StartPicker key={repo.path} task={task} repo={repo} option={option} named={named} />]
  })
  if (rows.length === 0) return null
  return (
    <>
      <dt>{t('TaskStarts.startingPoint')}</dt>
      <dd>{rows}</dd>
    </>
  )
}
