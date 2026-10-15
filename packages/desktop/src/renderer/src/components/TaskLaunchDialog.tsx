import { useEffect, useRef, useState } from 'react'
import { ChatPermissionMode, checkStart, checkStartMode, type AgentKind, type Task } from '@antumi/protocol'
import { resolveModel, useAgentCatalog, type ModelChoice } from '../agent-models'
import { dismissError, openChatWhileStarting, perform, updateTask, useCore } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel, reasonText } from '../labels'
import { useOccludesBrowser } from '../browser-occlusion'
import { AgentQuotaHint, confirmQuota, modelText } from './AgentQuota'
import { AgentModelPicker } from './AgentModelPicker'
import { modeOptions, startModes } from './ChatOptionsBar'
import { ChatPicker } from './ChatPicker'
import { AgentIcon, CloseIcon } from './icons'
import { SquadLaunchDialog } from './SquadLaunchDialog'
import { useEditsInPlace } from './TaskLaunch'


function closeTaskLaunch() {
  dismissError()
  useCore.setState({ taskLaunchId: null, squadLaunch: false, squadPlan: null })
}

export function TaskLaunchDialog({ taskId }: { taskId: string }) {
  const task = useCore((s) => s.tasks[taskId])
  const plan = useCore((state) => state.squadPlan)
  const [squad, setSquad] = useState(Boolean(task?.squadId || plan || useCore.getState().squadLaunch))
  useEffect(() => { if (!task) closeTaskLaunch() }, [task])
  return task ? squad ? <SquadLaunchDialog task={task} onSingle={() => setSquad(false)} /> : <LaunchForm task={task} onSquad={() => setSquad(true)} /> : null
}

function LaunchForm({ task, onSquad }: { task: Task; onSquad(): void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const installed = useInstalledAgents()
  const [agent, setAgent] = useState<AgentKind | null>(task.agent)
  const agents = agent && !installed.includes(agent) ? [...installed, agent] : installed
  const rpc = useCore((s) => s.rpc)
  const squadsSupported = rpc?.features.includes('squads') ?? false
  const supported = rpc?.features.includes('task-launch-options') ?? false
  const error = useCore((s) => s.error)
  const tasks = useCore((s) => s.tasks)
  const dependencies = task.dependsOn.flatMap((id) => tasks[id] ? [tasks[id]] : [])
  const [busy, setBusy] = useState(false)
  const inPlace = useEditsInPlace(task)
  const conversation = useCore((s) => s.conversations[task.conversationId ?? ''])
  const catalog = useAgentCatalog(agent, supported)
  // What the task keeps (a core with Task.launch), else what its chat last ran in.
  const [choices, setChoices] = useState<Partial<Record<AgentKind, ModelChoice>>>(() => {
    if (!task.agent) return {}
    const chat = conversation?.agent === task.agent ? conversation.chatOptions : null
    return { [task.agent]: {
      model: task.launch.model ?? chat?.model ?? undefined,
      effort: task.launch.effort ?? chat?.effort ?? undefined
    } }
  })
  // Unpicked, each agent starts the task planning.
  const [modes, setModes] = useState<Partial<Record<AgentKind, ChatPermissionMode>>>(() =>
    task.agent && task.launch.permissionMode ? { [task.agent]: task.launch.permissionMode } : {})

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    dismissError()
    return () => element?.close()
  }, [])

  const choice = agent ? choices[agent] ?? {} : {}
  const { model, modelId, effort } = resolveModel(catalog, choice)
  const offered = agent ? startModes(agent, model) : []
  const requestedMode = (agent ? modes[agent] : undefined) ?? 'plan'
  const mode = supported && offered.includes(requestedMode) && !checkStartMode(dependencies, requestedMode) ? requestedMode : 'plan'
  const options = agent ? modeOptions(agent, ['plan', ...offered.filter((each) => each !== 'plan')]) : []
  const blocker = checkStart({ ...task, agent }, dependencies)
  const label = mode === 'plan' ? '开始规划' : mode === 'readOnly' ? '开始分析' : '开始执行'
  const choose = (next: ModelChoice) => {
    if (agent) setChoices((known) => ({ ...known, [agent]: next }))
  }
  // Once the agent is settled, the dialog closes and the chat opens while the task starts; an error
  // from then on is the app's, not the closed dialog's.
  const submit = async () => {
    if (!agent || busy || blocker || !confirmQuota(agent, modelText(model))) return
    setBusy(true)
    dismissError()
    if ((agent !== task.agent || task.squadId) && !await updateTask(task.id, { agent, ...(task.squadId ? { squadId: null } : {}) })) {
      setBusy(false)
      return
    }
    const params = {
      id: task.id,
      ...(rpc?.features.includes('chat-options') ? { allowBypass: true } : {}),
      ...(supported ? { permissionMode: mode, model: modelId ?? null, effort: effort ?? null } : {})
    }
    closeTaskLaunch()
    await openChatWhileStarting(task.id, () => perform((connection) => connection.call('tasks.start', params)))
  }

  return (
    <dialog ref={dialog} className="modal task-launch-dialog" aria-labelledby="task-launch-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) closeTaskLaunch() }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) closeTaskLaunch() }}>
      <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <header className="modal-header">
          <h2 id="task-launch-title">开始任务</h2>
          <button type="button" className="icon-button modal-close" aria-label="关闭" disabled={busy} onClick={closeTaskLaunch}><CloseIcon /></button>
        </header>
        <p className="task-launch-name">{task.title}</p>
        {squadsSupported && <button type="button" className="link-button" disabled={busy} onClick={onSquad}>交给研发小队</button>}
        <fieldset className="task-launch-fields" disabled={busy}>
          <div className="task-launch-field"><span>Agent</span>
            <ChatPicker
              label="Agent"
              value={agent ?? ''}
              placeholder="选择 Agent"
              size="field"
              placement="below"
              options={agents.map((kind) => ({ value: kind, label: agentLabel(kind), icon: <AgentIcon agent={kind} />, description: installed.includes(kind) ? null : '未安装' }))}
              onChange={(value) => {
                const next = agents.find((each) => each === value)
                if (next) setAgent(next)
              }}
            />
          </div>
          {supported && <>
            <div className="task-launch-field"><span>模型</span>
              <AgentModelPicker catalog={catalog} choice={choice} size="field" onChange={choose} />
            </div>
            <div className="task-launch-field"><span>模式</span>
              <ChatPicker
                label="模式"
                value={mode}
                placeholder="规划"
                size="field"
                placement="below"
                options={options.map((each) => ({ ...each, disabled: each.disabled || checkStartMode(dependencies, each.value) !== null }))}
                onChange={(value) => {
                  const selected = ChatPermissionMode.safeParse(value)
                  if (agent && selected.success) setModes((known) => ({ ...known, [agent]: selected.data }))
                }}
              />
            </div>
          </>}
        </fieldset>
        <p className="task-launch-description muted">
          {checkStartMode(dependencies, 'ask') ? '依赖任务尚未完成，现在只能规划。' : options.find((each) => each.value === mode)?.description ?? '先制定计划，确认后执行。'}
        </p>
        {inPlace && mode !== 'plan' && mode !== 'readOnly' && <p className="task-launch-description muted">此项目不是 Git 仓库，修改会直接写入原目录。</p>}
        {agent && <AgentQuotaHint agent={agent} model={modelText(model)} />}
        {blocker && <p className="modal-error">{reasonText(blocker, blocker)}</p>}
        {error && <p className="modal-error" role="alert">{error}</p>}
        <footer className="modal-footer">
          <button type="button" className="button ghost" disabled={busy} onClick={closeTaskLaunch}>取消</button>
          <button type="submit" className="button primary" disabled={busy || !agent || blocker !== null}>{busy ? '正在启动…' : label}</button>
        </footer>
      </form>
    </dialog>
  )
}
