import { useEffect, useRef, useState } from 'react'
import { ChatPermissionMode, checkSquadStart, squadModes, type Task } from '@kando/protocol'
import { dismissError, openChatWhileStarting, perform, selectSquad, useCore } from '../core-store'
import { usePreferences } from '../preferences'
import { useOccludesBrowser } from '../browser-occlusion'
import { reasonText } from '../labels'
import { useEditsInPlace } from './TaskLaunch'
import { CloseIcon } from './icons'

export function SquadLaunchDialog({ task, onSingle }: { task: Task; onSingle(): void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const squads = useCore((state) => state.squads)
  const tasks = useCore((state) => state.tasks)
  const plan = useCore((state) => state.squadPlan)
  const inPlace = useEditsInPlace(task)
  const error = useCore((state) => state.error)
  const allowBypass = usePreferences((state) => state.allowBypass)
  const available = Object.values(squads).filter((squad) => squad.archivedAt === null)
  const [squadId, setSquadId] = useState(task.squadId ?? available[0]?.id ?? '')
  const [requested, setRequested] = useState<ChatPermissionMode>('ask')
  const [busy, setBusy] = useState(false)
  // Without a plan to go by, the leader plans with the user first unless told to divide the work up
  // as it goes.
  const leaderPlans = useCore((state) => state.rpc?.features.includes('squad-leader-planning') ?? false) && !plan && !task.plan
  const [planFirst, setPlanFirst] = useState(true)
  const planning = leaderPlans && planFirst
  const squad = squads[squadId]
  const modes = squad ? squadModes(squad, allowBypass) : []
  const mode = modes.includes(requested) ? requested : modes[0] ?? 'ask'
  const dependencies = task.dependsOn.flatMap((id) => tasks[id] ? [tasks[id]] : [])
  // Planning reads only, so it may begin before the dependencies are done.
  const blocker = planning ? (task.status !== 'pending' ? 'not-pending' : task.repos.length ? null : 'missing-repo') : checkSquadStart(task, dependencies, Boolean(plan))
  const close = () => { dismissError(); useCore.setState({ taskLaunchId: null, squadPlan: null, squadLaunch: false }) }
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  const start = async () => {
    if (busy || blocker || !squad || !modes.length) return
    setBusy(true); dismissError()
    const result = await openChatWhileStarting(task.id, () => perform((rpc) => rpc.call('squads.start', { id: task.id, squadId, permissionMode: mode, allowBypass, ...(plan ? { plan } : {}), ...(planning ? { planFirst: true } : {}) })))
    if (result) { close(); if (!planning) useCore.setState({ inspectorOpen: true, taskInspectorTab: 'squad' }) }
    if (!result && useCore.getState().tasks[task.id]?.squadId === squadId && useCore.getState().tasks[task.id]?.status === 'running') useCore.setState({ taskLaunchId: null, squadPlan: null, squadLaunch: false, view: 'chat', inspectorOpen: true, taskInspectorTab: 'squad' })
    setBusy(false)
  }
  return <dialog ref={dialog} className="modal task-launch-dialog" aria-labelledby="squad-launch-title" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void start() }}>
      <header className="modal-header"><h2 id="squad-launch-title">{plan ? '交给小队执行规划' : '交给研发小队'}</h2><button type="button" className="icon-button modal-close" aria-label="关闭" disabled={busy} onClick={close}><CloseIcon /></button></header>
      <p className="task-launch-name">{task.title}</p>
      {!plan && <button type="button" className="link-button" disabled={busy} onClick={onSingle}>改用单 Agent</button>}
      <fieldset className="task-launch-fields" disabled={busy}>
        <label className="task-launch-field">研发小队<select className="input" value={squadId} onChange={(event) => setSquadId(event.target.value)}><option value="" disabled>选择小队</option>{available.map((each) => <option key={each.id} value={each.id}>{each.name}</option>)}</select></label>
        <label className="task-launch-field">开发权限<select className="input" value={mode} onChange={(event) => { const parsed = ChatPermissionMode.safeParse(event.target.value); if (parsed.success) setRequested(parsed.data) }}>
          {modes.map((each) => <option key={each} value={each}>{each === 'ask' ? '逐项确认' : each === 'acceptEdits' ? '自动接受编辑' : each === 'bypass' ? '全部放行' : '自动判断'}</option>)}
        </select></label>
      </fieldset>
      {leaderPlans && (
        <fieldset className="squad-launch-ways" disabled={busy}>
          <label><input type="radio" name="squad-launch-way" checked={planFirst} onChange={() => setPlanFirst(true)} /><span><b>先和队长规划</b>（推荐）<span className="muted">队长读代码，和你商量出计划和分工；你批准后，它接着带成员开发。</span></span></label>
          <label><input type="radio" name="squad-launch-way" checked={!planFirst} onChange={() => setPlanFirst(false)} /><span><b>直接开始</b><span className="muted">队长按任务详情自己拆分，边做边派活。</span></span></label>
        </fieldset>
      )}
      {squad && <p className="muted">{squad.members.find((member) => member.id === squad.leaderId)?.name} 协调 {squad.members.length - 1} 名成员；模型与角色沿用小队配置。{planning ? '开发权限在批准计划后生效。' : ''}</p>}
      {inPlace && <p className="muted">此项目不是 Git 仓库，修改会直接写入原目录。</p>}
      {!available.length && <button type="button" className="button" onClick={() => { close(); selectSquad(null, true) }}>先创建研发小队</button>}
      {blocker && <p className="modal-error">{reasonText(blocker, blocker)}</p>}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <footer className="modal-footer"><button type="button" className="button ghost" disabled={busy} onClick={close}>取消</button><button type="submit" className="button primary" disabled={busy || Boolean(blocker) || !squad || squad.archivedAt !== null || !modes.length}>{busy ? '正在启动…' : planning ? '开始规划' : '开始小队开发'}</button></footer>
    </form>
  </dialog>
}
