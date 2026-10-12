import { useState } from 'react'
import { AgentKind, SquadFields, type Squad, type SquadMember } from '@kando/protocol'
import { resolveModel, useAgentCatalog } from '../agent-models'
import { perform, selectSquad, useCore, useSquadsSupported } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { saveSquad } from '../squads'
import { AgentIcon, GroupChatIcon, PlusIcon } from './icons'
import { SidebarCollapseButton } from './SidebarCollapseButton'
import { effortLabel } from './ChatOptionsBar'

export function SidebarSquads() {
  const supported = useSquadsSupported()
  const squads = useCore((state) => state.squads)
  const selected = useCore((state) => state.selectedSquadId)
  const section = useCore((state) => state.section)
  const [collapsed, setCollapsed] = useState(false)
  if (!supported) return null
  const list = Object.values(squads).filter((squad) => squad.archivedAt === null)
  return <nav aria-label="开发小队" className="sidebar-discussions">
    <header className="task-list-header">
      <SidebarCollapseButton icon={<GroupChatIcon />} label="开发小队" count={list.length} collapsed={collapsed} controls="sidebar-squads" onToggle={() => setCollapsed(!collapsed)} />
      <button type="button" className="icon-button sidebar-add" aria-label="新建开发小队" onClick={() => selectSquad(null, true)}><PlusIcon /></button>
    </header>
    <div id="sidebar-squads" hidden={collapsed}>
      {!list.length && <p className="task-list-empty">配置成员与角色，把开发任务交给小队。</p>}
      <ul>{list.map((squad) => <li key={squad.id}><button type="button" className="task-row conversation-row" aria-current={section === 'squads' && selected === squad.id} onClick={() => selectSquad(squad.id)}>
        <GroupChatIcon /><span className="task-row-title">{squad.name}</span><span className="muted">{squad.members.length}</span>
      </button></li>)}</ul>
      {Object.values(squads).some((squad) => squad.archivedAt !== null) && <button type="button" className="link-button" onClick={() => selectSquad(null)}>查看已归档小队</button>}
    </div>
  </nav>
}

function MemberFields({ member, leader, agents, disabled, onChange, onLead, onRemove }: {
  member: SquadMember; leader: boolean; agents: readonly AgentKind[]; disabled: boolean
  onChange(member: SquadMember): void; onLead(): void; onRemove(): void
}) {
  const catalog = useAgentCatalog(member.agent, true)
  const resolved = resolveModel(catalog, { model: member.model ?? undefined, effort: member.effort ?? undefined })
  const offered = agents.includes(member.agent) ? agents : [...agents, member.agent]
  return <fieldset className="squad-member-fields" disabled={disabled}>
    <div className="squad-member-heading"><AgentIcon agent={member.agent} />
      <label className="squad-field">成员名称<input className="input" value={member.name} maxLength={60} required onChange={(event) => onChange({ ...member, name: event.target.value })} /></label>
      {leader ? <span className="status-pill">队长</span> : <button type="button" className="button ghost" onClick={onLead}>设为队长</button>}
      <button type="button" className="button ghost" disabled={leader} onClick={onRemove}>移除</button>
    </div>
    <div className="squad-member-options">
      <label className="squad-field">Agent<select className="input" value={member.agent} onChange={(event) => {
        const parsed = AgentKind.safeParse(event.target.value)
        if (parsed.success) onChange({ ...member, agent: parsed.data, model: null, effort: null })
      }}>{offered.map((agent) => <option key={agent} value={agent}>{agentLabel(agent)}{agents.includes(agent) ? '' : '（未安装）'}</option>)}</select></label>
      <label className="squad-field">模型<select className="input" value={member.model ?? ''} onChange={(event) => onChange({ ...member, model: event.target.value || null, effort: null })}>
        <option value="">{catalog === undefined ? '正在读取…' : 'Agent 默认'}</option>
        {member.model && !catalog?.models.some((model) => model.id === member.model) && <option value={member.model}>{member.model}</option>}
        {catalog?.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
      </select></label>
      {resolved.efforts.length > 0 && <label className="squad-field">推理级别<select className="input" value={member.effort ?? ''} onChange={(event) => onChange({ ...member, effort: event.target.value || null })}><option value="">模型默认</option>{resolved.efforts.map((effort) => <option key={effort} value={effort}>{effortLabel(effort)}</option>)}</select></label>}
      <label className="squad-field">能力<select className="input" value={member.capability} disabled={leader} onChange={(event) => onChange({ ...member, capability: event.target.value === 'develop' ? 'develop' : 'readOnly' })}><option value="readOnly">只读分析 / 审查</option><option value="develop">开发 / 测试</option></select></label>
    </div>
    <label className="squad-field">角色说明<textarea className="input" value={member.role} maxLength={2000} rows={2} placeholder="职责、专长与交付要求" onChange={(event) => onChange({ ...member, role: event.target.value })} /></label>
  </fieldset>
}

function SquadEditor({ squad }: { squad: Squad | null }) {
  const installed = useInstalledAgents()
  const [name, setName] = useState(squad?.name ?? '')
  const [description, setDescription] = useState(squad?.description ?? '')
  const [instructions, setInstructions] = useState(squad?.instructions ?? '')
  const [members, setMembers] = useState<SquadMember[]>(() => squad?.members ?? [
    { id: crypto.randomUUID(), name: '队长', agent: installed[0] ?? 'claude', model: null, effort: null, role: '拆分工作、协调开发与审查，汇总验证并提交成果。', capability: 'readOnly' },
    { id: crypto.randomUUID(), name: '开发', agent: installed[0] ?? 'claude', model: null, effort: null, role: '实现功能并运行相关检查和测试。', capability: 'develop' },
    { id: crypto.randomUUID(), name: '审查', agent: installed[1] ?? installed[0] ?? 'claude', model: null, effort: null, role: '检查正确性、边界情况与代码质量，反馈问题。', capability: 'readOnly' }
  ])
  const [leaderId, setLeaderId] = useState(squad?.leaderId ?? members[0]!.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const archived = squad?.archivedAt !== null && squad !== null
  const save = async () => {
    const parsed = SquadFields.safeParse({ name, description, instructions, members, leaderId })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? '请检查小队配置'); return }
    setBusy(true); setError(null)
    const saved = await saveSquad(parsed.data, squad?.id)
    if (!saved) setError(useCore.getState().error)
    setBusy(false)
  }
  return <section className="detail squad-editor" aria-label="开发小队配置">
    <header className="detail-header"><h2>{squad ? squad.name : '新建开发小队'}</h2><span className="header-spacer" />
      {squad && <button type="button" className="button ghost" disabled={busy} onClick={() => void perform((rpc) => rpc.call('squads.archive', { id: squad.id, archived: !archived }))}>{archived ? '恢复小队' : '归档小队'}</button>}
    </header>
    <form className="squad-editor-body" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <fieldset className="squad-fields" disabled={busy || archived}>
        <label className="squad-field">小队名称<input className="input" value={name} maxLength={200} required onChange={(event) => setName(event.target.value)} /></label>
        <label className="squad-field">说明<textarea className="input" value={description} maxLength={2000} rows={2} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="squad-field">小队指令<textarea className="input" value={instructions} maxLength={10000} rows={3} placeholder="分工规则、协作方式与验收要求" onChange={(event) => setInstructions(event.target.value)} /></label>
      </fieldset>
      <p className="muted">队长只读协调；开发和测试串行执行，只读分析可并行。运行中的任务沿用启动时的配置。</p>
      {members.map((member) => <MemberFields key={member.id} member={member} leader={member.id === leaderId} agents={installed} disabled={busy || archived}
        onChange={(next) => setMembers(members.map((each) => each.id === member.id ? next : each))}
        onLead={() => { setLeaderId(member.id); setMembers(members.map((each) => each.id === member.id ? { ...each, capability: 'readOnly' } : each)) }}
        onRemove={() => setMembers(members.filter((each) => each.id !== member.id))} />)}
      <button type="button" className="button ghost" disabled={busy || archived || members.length >= 5} onClick={() => setMembers([...members, { id: crypto.randomUUID(), name: `成员 ${members.length + 1}`, agent: installed[0] ?? 'claude', model: null, effort: null, role: '', capability: 'readOnly' }])}>添加成员</button>
      {error && <p className="modal-error" role="alert">{error}</p>}
      <footer className="squad-editor-footer"><button className="button primary" type="submit" disabled={busy || archived}>{busy ? '正在保存…' : '保存小队'}</button></footer>
    </form>
  </section>
}

export function SquadsView() {
  const selected = useCore((state) => state.selectedSquadId)
  const draft = useCore((state) => state.squadDraft)
  const squads = useCore((state) => state.squads)
  if (draft) return <SquadEditor key="new" squad={null} />
  const squad = selected ? squads[selected] : null
  if (squad) return <SquadEditor key={squad.id} squad={squad} />
  return <section className="detail squad-editor"><header className="detail-header"><h2>开发小队</h2><button type="button" className="button primary" onClick={() => selectSquad(null, true)}>新建小队</button></header>
    <div className="squad-editor-body">{Object.values(squads).map((each) => <button key={each.id} type="button" className="button ghost" onClick={() => selectSquad(each.id)}>{each.name}{each.archivedAt !== null ? '（已归档）' : ''}</button>)}</div>
  </section>
}
