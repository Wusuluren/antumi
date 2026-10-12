import { useState } from 'react'
import { DEFAULT_DISCUSSION_ROUNDS, MAX_DISCUSSION_MEMBERS, MAX_DISCUSSION_ROUNDS, MIN_DISCUSSION_MEMBERS, type AgentKind, type Discussion } from '@kando/protocol'
import { resolveModel, useAgentCatalog } from '../agent-models'
import { closeDiscussionDraft, selectDiscussion } from '../core-store'
import { createDiscussion, defaultMemberName, loadDiscussionPosts } from '../discussions'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { effortLabel } from './ChatOptionsBar'
import { ChatModelPicker, ChatPicker } from './ChatPicker'
import { AgentIcon, CloseIcon } from './icons'
import { ProjectPicker } from './ProjectPicker'

// A member as picked: name is null while it follows the agent and model.
type Draft = { key: string; agent: AgentKind; model?: string; effort?: string; name: string | null; role: string }

const ROLE_HINTS = ['支持方', '反对方', '关注安全和风险', '关注性能和成本', '挑毛病的人']

function MemberRow({ member, index, agents, chair, busy, removable, onChange, onRemove, onChair }: {
  member: Draft
  index: number
  agents: readonly AgentKind[]
  chair: boolean
  busy: boolean
  removable: boolean
  onChange: (next: Draft) => void
  onRemove: () => void
  onChair: () => void
}) {
  const catalog = useAgentCatalog(member.agent, true)
  const { model, effort } = resolveModel(catalog, { model: member.model, effort: member.effort })
  const shownName = member.name ?? defaultMemberName(member.agent, member.model ?? null)
  return (
    <li className="discussion-draft-member">
      <span className="discussion-draft-index">{String.fromCharCode(65 + index)}</span>
      <ChatPicker
        label="Agent"
        value={member.agent}
        placeholder="Agent"
        disabled={busy}
        options={agents.map((agent) => ({ value: agent, label: agentLabel(agent), icon: <AgentIcon agent={agent} /> }))}
        onChange={(value) => {
          const agent = agents.find((each) => each === value)
          if (agent) onChange({ ...member, agent, model: undefined, effort: undefined })
        }}
      />
      {!catalog && <span className="chat-options-note muted">{catalog === undefined ? '正在读取模型…' : '默认模型'}</span>}
      {catalog && (
        <ChatModelPicker
          align="start"
          models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
          model={model?.id ?? null}
          effort={effort ?? null}
          disabled={busy}
          onModel={(value) => {
            const next = catalog.models.find((each) => each.id === value)
            if (next) onChange({ ...member, model: next.id, effort: member.effort && next.efforts.includes(member.effort) ? member.effort : undefined })
          }}
          onEffort={(value) => onChange({ ...member, effort: value })}
        />
      )}
      <input
        className="discussion-draft-name"
        aria-label={`成员 ${index + 1} 的名字，消息里用它 @ 这个成员`}
        value={shownName}
        maxLength={60}
        disabled={busy}
        onChange={(event) => onChange({ ...member, name: event.target.value })}
        onBlur={() => { if (member.name !== null && !member.name.trim()) onChange({ ...member, name: null }) }}
      />
      <input
        className="discussion-draft-role"
        aria-label={`成员 ${index + 1} 的立场或角度`}
        placeholder={`可不填，如：${ROLE_HINTS[index % ROLE_HINTS.length]}`}
        value={member.role}
        maxLength={2000}
        disabled={busy}
        onChange={(event) => onChange({ ...member, role: event.target.value })}
      />
      <label className="discussion-draft-chair" data-tooltip="讨论结束后由主持人写总结">
        <input type="radio" name="discussion-chair" checked={chair} disabled={busy} onChange={onChair} />
        主持
      </label>
      <button type="button" className="icon-button" aria-label={`移除成员 ${index + 1}`} data-tooltip="移除" disabled={busy || !removable} onClick={onRemove}>
        <CloseIcon />
      </button>
    </li>
  )
}

// A new group chat: a topic, the projects its members may read, and who discusses it. One begun from
// another group starts with its members, projects and options, for a topic of its own.
export function DiscussionDraft({ from }: { from: Discussion | null }) {
  const installed = useInstalledAgents()
  const [topic, setTopic] = useState('')
  const [projectPaths, setProjectPaths] = useState<string[]>(() => from?.projectPaths ?? [])
  const [members, setMembers] = useState<Draft[]>(() => {
    if (from) {
      return from.members.map((member) => ({
        key: crypto.randomUUID(), agent: member.agent, model: member.model ?? undefined, effort: member.effort ?? undefined, name: member.name, role: member.role
      }))
    }
    const first = installed[0] ?? 'claude'
    const second = installed[1] ?? first
    return [
      { key: crypto.randomUUID(), agent: first, name: null, role: '' },
      { key: crypto.randomUUID(), agent: second, name: null, role: '' }
    ]
  })
  const [chair, setChair] = useState(() => Math.max(0, from?.members.findIndex((member) => member.id === from.chairId) ?? 0))
  const [rounds, setRounds] = useState(from?.maxRounds ?? DEFAULT_DISCUSSION_ROUNDS)
  const [anonymous, setAnonymous] = useState(from?.anonymous ?? false)
  const [busy, setBusy] = useState(false)
  // Names in use more than once would make @ ambiguous.
  const names = members.map((member) => (member.name ?? defaultMemberName(member.agent, member.model ?? null)).trim())
  const clash = names.find((name, index) => names.indexOf(name) !== index)
  const canStart = !busy && topic.trim() !== '' && members.length >= MIN_DISCUSSION_MEMBERS && !clash && names.every(Boolean)

  const update = (index: number, next: Draft) => setMembers(members.map((each, at) => (at === index ? next : each)))
  const add = () => setMembers([...members, { key: crypto.randomUUID(), agent: installed[members.length % Math.max(installed.length, 1)] ?? 'claude', name: null, role: '' }])
  const remove = (index: number) => {
    setMembers(members.filter((_, at) => at !== index))
    setChair((current) => (current === index ? 0 : current > index ? current - 1 : current))
  }

  const start = async () => {
    if (!canStart) return
    setBusy(true)
    const created = await createDiscussion({
      topic: topic.trim(),
      projectPaths,
      members: members.map((member, index) => ({
        agent: member.agent,
        ...(member.model ? { model: member.model } : {}),
        ...(member.effort ? { effort: member.effort } : {}),
        name: names[index] ?? agentLabel(member.agent),
        role: member.role.trim()
      })),
      chair,
      maxRounds: rounds,
      anonymous
    })
    setBusy(false)
    if (!created) return
    void loadDiscussionPosts(created.id)
    selectDiscussion(created.id)
  }

  return (
    <section className="detail terminal-view discussion-view" aria-label="新群聊">
      <header className="detail-header conversation-header">
        <span className="terminal-view-title">新群聊</span>
        <div className="toolbar">
          <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={closeDiscussionDraft}><CloseIcon /></button>
        </div>
      </header>
      <div className="discussion-draft">
        {from && <p className="discussion-draft-from">沿用群聊「{from.title}」的成员、项目和设置，各成员从头开始，不带之前的讨论。</p>}
        <p className="muted">
          几个 Agent 先各自独立作答，再一轮轮看彼此的观点、反驳或修正，最后由主持人总结共识和分歧。讨论只读：成员可以读所选项目的代码来佐证，但不会改动文件。
        </p>
        <label className="discussion-draft-field">
          <span>主题</span>
          <textarea
            className="discussion-draft-topic"
            rows={4}
            autoFocus
            value={topic}
            disabled={busy}
            placeholder="要讨论什么？写清楚问题和背景，例如：本仓库的 chat-host 要不要拆成两层？各自的利弊是什么？"
            onChange={(event) => setTopic(event.target.value)}
          />
        </label>
        <div className="discussion-draft-field">
          <span>项目（可不选）</span>
          <ProjectPicker projects={projectPaths.map((path) => ({ path, worktreePath: null }))} onChange={setProjectPaths} locked={busy} />
        </div>
        <div className="discussion-draft-field">
          <span>成员</span>
          <ul className="discussion-draft-members">
            {/* What each column of a member is: the name most of all, as it is what @ picks it by. */}
            <li className="discussion-draft-member discussion-draft-member-head" aria-hidden="true">
              <span />
              <span>Agent</span>
              <span>模型</span>
              <span>名字（@ 它时用）</span>
              <span>立场或角度</span>
              <span />
              <span />
            </li>
            {members.map((member, index) => (
              <MemberRow
                key={member.key}
                member={member}
                index={index}
                agents={installed}
                chair={chair === index}
                busy={busy}
                removable={members.length > MIN_DISCUSSION_MEMBERS}
                onChange={(next) => update(index, next)}
                onRemove={() => remove(index)}
                onChair={() => setChair(index)}
              />
            ))}
          </ul>
          {members.length < MAX_DISCUSSION_MEMBERS && (
            <button type="button" className="link-button discussion-draft-add" disabled={busy} onClick={add}>＋ 添加成员</button>
          )}
          {clash && <p className="discussion-draft-error">有两个成员都叫「{clash}」，改一个名字，好在消息里 @ 它。</p>}
        </div>
        <div className="discussion-draft-options">
          <label>
            最多
            <select value={rounds} disabled={busy} onChange={(event) => setRounds(Number(event.target.value))}>
              {Array.from({ length: MAX_DISCUSSION_ROUNDS }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
            轮（大家都维持立场时提前总结）
          </label>
          <label data-tooltip="互评时只用「成员 A / B」称呼，不透露是哪个 Agent 和模型，减少对品牌的偏向">
            <input type="checkbox" checked={anonymous} disabled={busy} onChange={(event) => setAnonymous(event.target.checked)} />
            匿名互评
          </label>
          <span className="chat-dock-spacer" />
          <button type="button" className="button primary" disabled={!canStart} onClick={() => void start()}>
            {busy ? '正在启动…' : '开始讨论'}
          </button>
        </div>
      </div>
    </section>
  )
}
