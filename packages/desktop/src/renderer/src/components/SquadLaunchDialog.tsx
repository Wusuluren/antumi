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
  const squad = squads[squadId]
  const modes = squad ? squadModes(squad, allowBypass) : []
  const mode = modes.includes(requested) ? requested : modes[0] ?? 'ask'
  const blocker = checkSquadStart(task, task.dependsOn.flatMap((id) => tasks[id] ? [tasks[id]] : []), Boolean(plan))
  const close = () => { dismissError(); useCore.setState({ taskLaunchId: null, squadPlan: null, squadLaunch: false }) }
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  const start = async () => {
    if (busy || blocker || !squad || !modes.length) return
    setBusy(true); dismissError()
    const result = await openChatWhileStarting(task.id, () => perform((rpc) => rpc.call('squads.start', { id: task.id, squadId, permissionMode: mode, allowBypass, ...(plan ? { plan } : {}) })))
    if (result) { close(); useCore.setState({ inspectorOpen: true, taskInspectorTab: 'squad' }) }
    if (!result && useCore.getState().tasks[task.id]?.squadId === squadId && useCore.getState().tasks[task.id]?.status === 'running') useCore.setState({ taskLaunchId: null, squadPlan: null, squadLaunch: false, view: 'chat', inspectorOpen: true, taskInspectorTab: 'squad' })
    setBusy(false)
  }
  return <dialog ref={dialog} className="modal task-launch-dialog" aria-labelledby="squad-launch-title" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void start() }}>
      <header className="modal-header"><h2 id="squad-launch-title">{plan ? '交给小队执行规划' : '小队开发'}</h2><button type="button" className="icon-button modal-close" aria-label="关闭" disabled={busy} onClick={close}><CloseIcon /></button></header>
      <p className="task-launch-name">{task.title}</p>
      {!plan && <button type="button" className="link-button" disabled={busy} onClick={onSingle}>改用单 Agent</button>}
      <fieldset className="task-launch-fields" disabled={busy}>
        <label className="task-launch-field">开发小队<select className="input" value={squadId} onChange={(event) => setSquadId(event.target.value)}><option value="" disabled>选择小队</option>{available.map((each) => <option key={each.id} value={each.id}>{each.name}</option>)}</select></label>
        <label className="task-launch-field">开发权限<select className="input" value={mode} onChange={(event) => { const parsed = ChatPermissionMode.safeParse(event.target.value); if (parsed.success) setRequested(parsed.data) }}>
          {modes.map((each) => <option key={each} value={each}>{each === 'ask' ? '逐项确认' : each === 'acceptEdits' ? '自动接受编辑' : each === 'bypass' ? '全部放行' : '自动判断'}</option>)}
        </select></label>
      </fieldset>
      {squad && <p className="muted">{squad.members.find((member) => member.id === squad.leaderId)?.name} 协调 {squad.members.length - 1} 名成员；模型与角色沿用小队配置。</p>}
      {inPlace && <p className="muted">此项目不是 Git 仓库，修改会直接写入原目录。</p>}
      {!available.length && <button type="button" className="button" onClick={() => { close(); selectSquad(null, true) }}>先创建开发小队</button>}
      {blocker && <p className="modal-error">{reasonText(blocker, blocker)}</p>}
      {error && <p className="modal-error" role="alert">{error}</p>}
      <footer className="modal-footer"><button type="button" className="button ghost" disabled={busy} onClick={close}>取消</button><button type="submit" className="button primary" disabled={busy || Boolean(blocker) || !squad || squad.archivedAt !== null || !modes.length}>{busy ? '正在启动…' : '开始小队开发'}</button></footer>
    </form>
  </dialog>
}
