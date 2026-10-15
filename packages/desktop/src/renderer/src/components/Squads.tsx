import { useId, useState, type ReactNode } from 'react'
import { AgentKind, SquadFields, type Squad, type SquadMember } from '@antumi/protocol'
import { useAgentCatalog } from '../agent-models'
import { perform, selectSquad, useCore, useSquadsSupported } from '../core-store'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { saveSquad } from '../squads'
import { timeAgo } from '../conversation-state'
import { AgentIcon, ArrowLeftIcon, ChevronRightIcon, CloseIcon, PencilIcon, PlusIcon, SquadIcon } from './icons'
import { AgentModelPicker } from './AgentModelPicker'
import { effortLabel } from './ChatOptionsBar'
import { ChatPicker } from './ChatPicker'
import { Segmented } from './SettingsControls'

const MAX_MEMBERS = 5
const LEADER_DUTY = '队长只读：拆分工作、分派给成员、汇总验证结果，自己不改代码。'

// The squads live on a page of their own, opened from here like the dashboard; the sidebar keeps
// no list of them.
export function SquadsEntry() {
  const supported = useSquadsSupported()
  const open = useCore((state) => state.section === 'squads' && !state.dashboardOpen && !state.routinesOpen && !state.overviewOpen && !state.schedulesOpen && !state.worktreesOpen)
  if (!supported) return null
  return (
    <button type="button" className="inbox-entry sidebar-squads" aria-current={open} onClick={() => selectSquad(null)}>
      <SquadIcon />
      <span>研发小队</span>
    </button>
  )
}

const leaderOf = (squad: Pick<Squad, 'members' | 'leaderId'>) => squad.members.find((member) => member.id === squad.leaderId) ?? null

function capabilityText(member: SquadMember, leader: boolean): string {
  if (leader) return '队长 · 只读'
  return member.capability === 'develop' ? '开发 / 测试' : '只读分析'
}

// What a member runs on, in a line: the agent, its model (or the agent's default) and effort.
function engineText(member: SquadMember): string {
  return [agentLabel(member.agent), member.model ?? '默认模型', member.effort ? effortLabel(member.effort) : null].filter(Boolean).join(' · ')
}

function rosterText(squad: Squad): string {
  const others = squad.members.filter((member) => member.id !== squad.leaderId)
  const developers = others.filter((member) => member.capability === 'develop').length
  const readers = others.length - developers
  return [`${others.length} 名成员`, developers ? `开发 ${developers}` : null, readers ? `只读 ${readers}` : null].filter(Boolean).join(' · ')
}

type Tab = 'active' | 'archived'

function SquadList() {
  const squads = useCore((state) => state.squads)
  const all = Object.values(squads).sort((a, b) => b.updatedAt - a.updatedAt)
  const archived = all.filter((squad) => squad.archivedAt !== null)
  const [tab, setTab] = useState<Tab>('active')
  const tabsId = useId()
  const shown = tab === 'archived' ? archived : all.filter((squad) => squad.archivedAt === null)
  // Read once a render: the cards say how long ago each changed.
  const now = Date.now()
  return (
    <section className="squads-section" aria-label="研发小队列表">
      {archived.length > 0 && (
        <div className="squads-tabs">
          <span id={tabsId} className="visually-hidden">显示</span>
          <Segmented labelId={tabsId} value={tab} options={[{ value: 'active', label: `使用中 · ${all.length - archived.length}` }, { value: 'archived', label: `已归档 · ${archived.length}` }]} onChange={setTab} />
        </div>
      )}
      {tab === 'archived' && shown.length === 0 ? <p className="worktrees-empty muted">没有归档的小队。</p> : (
        <ul className="squad-cards">
          {shown.map((squad) => <SquadCard key={squad.id} squad={squad} now={now} />)}
          {/* The header's button again, where the eye ends up: with none yet, it is the page. */}
          {tab === 'active' && (
            <li>
              <button type="button" className="squad-card squad-card-new" onClick={() => selectSquad(null, true)}>
                <span className="squad-card-plus"><PlusIcon /></span>
                新建小队
                <span className="squad-card-new-hint">按 队长 / 开发 / 审查 预填好成员</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

// A squad at a glance: its name, what it is for, its members leader first, and when it last changed.
function SquadCard({ squad, now }: { squad: Squad; now: number }) {
  const leader = leaderOf(squad)
  const members = leader ? [leader, ...squad.members.filter((member) => member !== leader)] : squad.members
  return (
    <li>
      <button type="button" className="squad-card" data-archived={squad.archivedAt !== null || undefined} onClick={() => selectSquad(squad.id)}>
        <span className="squad-card-top">
          <span className="squad-card-icon" aria-hidden="true"><SquadIcon /></span>
          <span className="squad-card-name">{squad.name}</span>
          {squad.archivedAt !== null && <span className="squad-tag">已归档</span>}
        </span>
        <span className="squad-card-description" data-empty={!squad.description || undefined}>{squad.description || '没有说明'}</span>
        <span className="squad-card-members">
          {members.map((member) => (
            <span key={member.id} className="squad-card-member" data-lead={member === leader || undefined} title={`${member.name} · ${engineText(member)}`}>
              <AgentIcon agent={member.agent} />{member.name}
            </span>
          ))}
        </span>
        <span className="squad-card-foot">
          <span>{rosterText(squad)}</span>
          <span className="squad-card-time">更新于 {timeAgo(squad.updatedAt, now)}</span>
        </span>
      </button>
    </li>
  )
}

function MemberLine({ member, leader }: { member: SquadMember; leader: boolean }) {
  return (
    <li className="squad-member-line">
      <span className="squad-member-icon"><AgentIcon agent={member.agent} /></span>
      <span className="squad-member-main">
        <span className="squad-member-title">
          <strong>{member.name}</strong>
          <span className="squad-tag" data-kind={leader ? 'leader' : member.capability}>{capabilityText(member, leader)}</span>
          <span className="muted squad-member-engine">{engineText(member)}</span>
        </span>
        {member.role && <span className="squad-member-role">{member.role}</span>}
      </span>
    </li>
  )
}

function OverviewActions({ squad, onEdit }: { squad: Squad; onEdit: () => void }) {
  const [busy, setBusy] = useState(false)
  const archived = squad.archivedAt !== null
  const archive = async () => {
    setBusy(true)
    const changed = await perform((rpc) => rpc.call('squads.archive', { id: squad.id, archived: !archived }))
    if (changed) useCore.setState((state) => ({ squads: { ...state.squads, [changed.id]: changed } }))
    setBusy(false)
  }
  return (
    <div className="squad-header-actions">
      {archived && <span className="squad-tag">已归档</span>}
      <button type="button" className="button ghost" disabled={busy} onClick={() => void archive()}>{archived ? '恢复小队' : '归档小队'}</button>
      {!archived && <button type="button" className="button" onClick={onEdit}><PencilIcon />编辑</button>}
    </div>
  )
}

function SquadOverview({ squad }: { squad: Squad }) {
  const leader = leaderOf(squad)
  return (
    <div className="squad-page-body">
      <section className="squad-block" aria-label="队长">
        <h3>队长</h3>
        <p className="muted squad-block-hint">{LEADER_DUTY}</p>
        {leader && <ul className="squad-member-lines"><MemberLine member={leader} leader /></ul>}
      </section>
      <section className="squad-block" aria-label="成员">
        <h3>成员 <span className="muted">{squad.members.length - 1}</span></h3>
        <p className="muted squad-block-hint">开发和测试串行执行，只读分析可以并行。</p>
        <ul className="squad-member-lines">{squad.members.filter((member) => member.id !== squad.leaderId).map((member) => <MemberLine key={member.id} member={member} leader={false} />)}</ul>
      </section>
      <section className="squad-block" aria-label="发给队长的指令">
        <h3>发给队长的指令</h3>
        {squad.instructions ? <p className="squad-instructions">{squad.instructions}</p> : <p className="muted squad-block-hint">没有写。队长按任务和各成员的角色说明分工。</p>}
      </section>
      <p className="muted squad-footnote">运行中的任务沿用启动时的小队配置，这里的改动从下一次交给小队起生效。</p>
    </div>
  )
}

// One member while editing: a line like the overview's, opened in place for its settings.
function MemberEditor({ member, leader, open, agents, disabled, onToggle, onChange, onLead, onRemove }: {
  member: SquadMember; leader: boolean; open: boolean; agents: readonly AgentKind[]; disabled: boolean
  onToggle(): void; onChange(member: SquadMember): void; onLead(): void; onRemove(): void
}) {
  const catalog = useAgentCatalog(member.agent, open)
  const offered = agents.includes(member.agent) ? agents : [...agents, member.agent]
  return (
    <li className="squad-member-edit" data-open={open || undefined}>
      <div className="squad-member-line">
        <button type="button" className="squad-member-toggle" aria-expanded={open} aria-label={open ? `收起 ${member.name}` : `展开 ${member.name}`} onClick={onToggle}><ChevronRightIcon /></button>
        <span className="squad-member-icon"><AgentIcon agent={member.agent} /></span>
        <button type="button" className="squad-member-main" onClick={onToggle}>
          <span className="squad-member-title">
            <strong>{member.name || '未命名'}</strong>
            <span className="squad-tag" data-kind={leader ? 'leader' : member.capability}>{capabilityText(member, leader)}</span>
            <span className="muted squad-member-engine">{engineText(member)}</span>
          </span>
          {member.role && <span className="squad-member-role">{member.role}</span>}
        </button>
        {!leader && (
          <span className="squad-member-actions">
            <button type="button" className="link-button" disabled={disabled} onClick={onLead}>设为队长</button>
            <button type="button" className="link-button" disabled={disabled} onClick={onRemove}>移除</button>
          </span>
        )}
      </div>
      {open && (
        <fieldset className="squad-member-fields" disabled={disabled}>
          <div className="squad-member-options">
            <label className="squad-field">名称<input className="input" value={member.name} maxLength={60} required onChange={(event) => onChange({ ...member, name: event.target.value })} /></label>
            <div className="squad-field">Agent
              <ChatPicker label="Agent" value={member.agent} placeholder={agentLabel(member.agent)} size="field" placement="below"
                options={offered.map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} />, description: agents.includes(agent) ? null : '未安装' }))}
                onChange={(value) => {
                  const parsed = AgentKind.safeParse(value)
                  if (parsed.success && parsed.data !== member.agent) onChange({ ...member, agent: parsed.data, model: null, effort: null })
                }} />
            </div>
            <div className="squad-field">模型
              <AgentModelPicker catalog={catalog} choice={{ model: member.model ?? undefined, effort: member.effort ?? undefined }} size="field"
                onChange={(next) => onChange({ ...member, model: next.model ?? null, effort: next.effort ?? null })} />
            </div>
            {!leader && <div className="squad-field">能力
              <ChatPicker label="能力" value={member.capability} placeholder="只读分析 / 审查" size="field" placement="below"
                options={[
                  { value: 'readOnly', label: '只读分析 / 审查', description: '读代码、分析和审查，不改文件，可以几个并行' },
                  { value: 'develop', label: '开发 / 测试', description: '改代码、跑测试，和其他开发成员依次进行' }
                ]}
                onChange={(value) => onChange({ ...member, capability: value === 'develop' ? 'develop' : 'readOnly' })} />
            </div>}
          </div>
          <label className="squad-field">角色说明<textarea className="input" value={member.role} maxLength={2000} rows={2} placeholder="职责、专长与交付要求" onChange={(event) => onChange({ ...member, role: event.target.value })} /></label>
        </fieldset>
      )}
    </li>
  )
}

function SquadEditor({ squad, onDone }: { squad: Squad | null; onDone: (saved: boolean) => void }) {
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
  const [opened, setOpened] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leader = members.find((member) => member.id === leaderId) ?? null
  const others = members.filter((member) => member.id !== leaderId)
  const change = (next: SquadMember) => setMembers(members.map((each) => each.id === next.id ? next : each))
  const editor = (member: SquadMember) => (
    <MemberEditor key={member.id} member={member} leader={member.id === leaderId} agents={installed} disabled={busy}
      open={opened === member.id} onToggle={() => setOpened(opened === member.id ? null : member.id)} onChange={change}
      // A leader only coordinates, so it reads; the one it replaces keeps what it had.
      onLead={() => { setLeaderId(member.id); change({ ...member, capability: 'readOnly' }) }}
      onRemove={() => { setMembers(members.filter((each) => each.id !== member.id)); if (opened === member.id) setOpened(null) }} />
  )
  const add = () => {
    const member: SquadMember = { id: crypto.randomUUID(), name: `成员 ${members.length}`, agent: installed[0] ?? 'claude', model: null, effort: null, role: '', capability: 'readOnly' }
    setMembers([...members, member])
    setOpened(member.id)
  }
  const save = async () => {
    const parsed = SquadFields.safeParse({ name, description, instructions, members, leaderId })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? '请检查小队配置'); return }
    setBusy(true); setError(null)
    const saved = await saveSquad(parsed.data, squad?.id)
    setBusy(false)
    if (saved) onDone(true)
    else setError(useCore.getState().error)
  }
  return (
    <form className="squad-page-body squad-editor-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <fieldset className="squad-fields" disabled={busy}>
        <label className="squad-field">小队名称<input className="input" autoFocus={!squad} value={name} maxLength={200} required placeholder="例如：网站团队" onChange={(event) => setName(event.target.value)} /></label>
        <label className="squad-field">一句话说明<input className="input" value={description} maxLength={2000} placeholder="这个小队负责什么，显示在小队列表里" onChange={(event) => setDescription(event.target.value)} /></label>
      </fieldset>
      <section className="squad-block" aria-label="队长">
        <h3>队长</h3>
        <p className="muted squad-block-hint">{LEADER_DUTY}</p>
        {leader && <ul className="squad-member-lines">{editor(leader)}</ul>}
      </section>
      <section className="squad-block" aria-label="成员">
        <h3>成员 <span className="muted">{others.length}</span></h3>
        <p className="muted squad-block-hint">至少一名「开发 / 测试」成员。开发和测试串行执行，只读分析可以并行；点一行展开设置。</p>
        <ul className="squad-member-lines">{others.map(editor)}</ul>
        <button type="button" className="link-button squad-add" disabled={busy || members.length >= MAX_MEMBERS} onClick={add}>
          {members.length >= MAX_MEMBERS ? `最多 ${MAX_MEMBERS} 人（含队长）` : '添加成员'}
        </button>
      </section>
      <section className="squad-block" aria-label="发给队长的指令">
        <label className="squad-field"><span><b>发给队长的指令</b> <span className="muted">（可选）</span></span>
          <textarea className="input" value={instructions} maxLength={10000} rows={3} disabled={busy} placeholder="分工规则、协作方式与验收要求，队长每次接手任务时都会读到" onChange={(event) => setInstructions(event.target.value)} />
        </label>
      </section>
      {error && <p className="modal-error" role="alert">{error}</p>}
      <footer className="squad-editor-footer">
        <button type="button" className="button ghost" disabled={busy} onClick={() => onDone(false)}>取消</button>
        <button className="button primary" type="submit" disabled={busy}>{busy ? '正在保存…' : squad ? '保存' : '创建小队'}</button>
      </footer>
    </form>
  )
}

function SquadPage({ squad }: { squad: Squad }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <PageHeader title={editing ? `编辑「${squad.name}」` : squad.name} description={editing ? null : squad.description || null} back
        actions={editing ? null : <OverviewActions squad={squad} onEdit={() => setEditing(true)} />} />
      {editing ? <SquadEditor squad={squad} onDone={() => setEditing(false)} /> : <SquadOverview squad={squad} />}
    </>
  )
}

function PageHeader({ title, description, back, actions = null }: { title: string; description: string | null; back: boolean; actions?: ReactNode }) {
  return (
    <header className="worktrees-header">
      {back && <button type="button" className="tool-button" aria-label="返回小队列表" data-tooltip="返回小队列表" onClick={() => selectSquad(null)}><ArrowLeftIcon /></button>}
      <div className="worktrees-heading">
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions}
      <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => useCore.setState({ section: 'tasks', selectedSquadId: null, squadDraft: false })}><CloseIcon /></button>
    </header>
  )
}

export function SquadsView() {
  const selected = useCore((state) => state.selectedSquadId)
  const draft = useCore((state) => state.squadDraft)
  const squad = useCore((state) => (selected ? state.squads[selected] ?? null : null))
  return (
    <section className="worktrees-page squads-page" aria-label="研发小队">
      {draft ? (
        <>
          <PageHeader title="新建研发小队" description="先按 队长 / 开发 / 审查 三人预填好了，改名字、换 Agent 或模型都可以。" back />
          <SquadEditor key="new" squad={null} onDone={(saved) => { if (!saved) selectSquad(null) }} />
        </>
      ) : squad ? (
        <SquadPage key={squad.id} squad={squad} />
      ) : (
        <>
          <PageHeader title="研发小队" description="一个只读的队长带几名成员：队长拆分任务、分派给成员、汇总结果。开始任务时选「交给研发小队」，或在任务的执行者里选它。" back={false}
            actions={<button type="button" className="button primary" onClick={() => selectSquad(null, true)}><PlusIcon />新建小队</button>} />
          <SquadList />
        </>
      )}
    </section>
  )
}
