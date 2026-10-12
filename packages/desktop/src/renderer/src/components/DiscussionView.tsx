import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { checkDiscussionAction, MAX_DETAILS_LENGTH, type Discussion, type DiscussionAction, type DiscussionMember, type DiscussionPost } from '@kando/protocol'
import { loadConversation, perform, selectConversation, selectDiscussion, selectTask, useCore } from '../core-store'
import { controlDiscussion, discussionProgress, loadDiscussionPosts, MEMBER_STATUS_LABEL, mentionedMembers, postToDiscussion, renameDiscussion, useDiscussionPosts } from '../discussions'
import { agentLabel, messageTime, reasonText } from '../labels'
import { usePreferences } from '../preferences'
import { ChatMarkdown } from './ChatMarkdown'
import { sendsMessage } from './ChatComposer'
import { DiscussionDot } from './SidebarDiscussions'
import { AgentIcon, CloseIcon, EnterIcon, PlayIcon, StopIcon } from './icons'
import { projectNames } from './ProjectPicker'
import { Spinner } from './Spinner'
import { TitleEditor } from './TitleEditor'
import { useDiscussionMentionMenu } from './DiscussionMentions'

const ACTIONS: Array<{ action: DiscussionAction; label: string; hint: string }> = [
  { action: 'pause', label: '暂停', hint: '这一轮说完后先停下' },
  { action: 'resume', label: '继续', hint: '从停下的地方接着讨论' },
  { action: 'nextRound', label: '再来一轮', hint: '大家再看一遍彼此的观点，然后重新总结' },
  { action: 'conclude', label: '立即总结', hint: '这一轮说完就请主持人总结' },
  { action: 'stop', label: '停止', hint: '打断正在发言的成员并暂停' }
]

const KIND_LABEL: Partial<Record<DiscussionPost['kind'], string>> = { opening: '独立作答', rebuttal: '回应', reply: '回答你', summary: '总结' }

// A member's own conversation, where its tool calls and approvals are: it is kept out of the list,
// so it may need fetching before it can be shown.
async function openMember(member: DiscussionMember): Promise<void> {
  if (!useCore.getState().conversations[member.conversationId]) await loadConversation(member.conversationId)
  selectConversation(member.conversationId)
}

// The summary as a task's details, for the conclusion to be carried out.
async function taskFromSummary(discussion: Discussion, summary: DiscussionPost): Promise<void> {
  const details = [`来自群聊「${discussion.title}」的结论。`, '', '## 讨论主题', discussion.topic, '', summary.text].join('\n').slice(0, MAX_DETAILS_LENGTH)
  const task = await perform((rpc) => rpc.call('tasks.create', { title: discussion.title, details, repos: discussion.projectPaths }))
  if (task) selectTask(task.id)
}

function MemberChip({ member, chair, onMention }: { member: DiscussionMember; chair: boolean; onMention: () => void }) {
  const status = MEMBER_STATUS_LABEL[member.status]
  return (
    <li className="discussion-member" data-status={member.status}>
      <button
        type="button"
        className="discussion-member-open"
        data-tooltip={`${member.role ? `立场：${member.role}\n` : ''}点开看它的工具调用和确认请求`}
        onClick={() => void openMember(member)}
      >
        <span className="discussion-member-mark"><AgentIcon agent={member.agent} /></span>
        <span className="discussion-member-name">{member.name}</span>
        {chair && <span className="discussion-member-chair">主持</span>}
        <span className="discussion-member-status">
          {member.status === 'working' && <Spinner />}
          {status}
        </span>
      </button>
      <button type="button" className="icon-button discussion-member-mention" aria-label={`@${member.name}`} data-tooltip="只问它" onClick={onMention}>@</button>
    </li>
  )
}

function PostHead({ post, member, children }: { post: DiscussionPost; member: DiscussionMember | undefined; children?: ReactNode }) {
  return (
    <div className="discussion-post-head">
      {member ? <span className="discussion-member-mark"><AgentIcon agent={member.agent} /></span> : null}
      <span className="discussion-post-author">{member ? member.name : post.memberId === null ? '你' : '已移除的成员'}</span>
      {member && <span className="muted">{agentLabel(member.agent)}{member.model ? ` · ${member.model}` : ''}</span>}
      {KIND_LABEL[post.kind] && <span className="discussion-post-kind">{KIND_LABEL[post.kind]}</span>}
      <span className="discussion-post-time">{messageTime(post.createdAt)}</span>
      {children}
    </div>
  )
}

function Post({ post, discussion, wide }: { post: DiscussionPost; discussion: Discussion; wide: boolean }) {
  const member = discussion.members.find((each) => each.id === post.memberId)
  if (post.kind === 'notice') return <p className="discussion-notice muted">{post.text}</p>
  if (post.kind === 'user') {
    const named = discussion.members.filter((each) => post.mentions.includes(each.id)).map((each) => each.name)
    return (
      <div className="discussion-user">
        {named.length > 0 && <span className="discussion-user-to muted">问 {named.join('、')}</span>}
        <div className="discussion-user-text">{post.text}</div>
      </div>
    )
  }
  return (
    <article className="discussion-post" data-kind={post.kind} data-state={post.state} data-wide={wide || undefined}>
      <PostHead post={post} member={member}>
        {post.kind === 'summary' && post.state === 'done' && (
          <button type="button" className="link-button discussion-post-action" onClick={() => void taskFromSummary(discussion, post)}>从结论新建任务</button>
        )}
      </PostHead>
      {post.state === 'pending' ? (
        <p className="discussion-post-pending muted">
          <Spinner />
          {member?.status === 'awaiting' ? <>在等你确认，<button type="button" className="link-button" onClick={() => member && void openMember(member)}>去处理</button></> : '正在思考…'}
        </p>
      ) : post.state === 'failed' ? (
        <>
          {post.text && <ChatMarkdown text={post.text} />}
          <p className="discussion-post-failed">这次没有发言成功：{reasonText(post.error ?? '', post.error ?? '未知原因')}</p>
        </>
      ) : (
        <ChatMarkdown text={post.text} />
      )}
    </article>
  )
}

// Posts by round; the first round's independent answers side by side, the rest one after another.
function Rounds({ discussion, posts }: { discussion: Discussion; posts: readonly DiscussionPost[] }) {
  const rounds = new Map<number, DiscussionPost[]>()
  for (const post of posts) rounds.set(post.round, [...(rounds.get(post.round) ?? []), post])
  return (
    <>
      {[...rounds].map(([round, list]) => {
        const openings = list.filter((post) => post.kind === 'opening')
        const rest = list.filter((post) => post.kind !== 'opening')
        return (
          <section key={round} className="discussion-round" aria-label={round === 0 ? '开场' : `第 ${round} 轮`}>
            {round > 0 && <h3 className="discussion-round-title">第 {round} 轮</h3>}
            {openings.length > 0 && (
              <div className="discussion-openings">
                {openings.map((post) => <Post key={post.id} post={post} discussion={discussion} wide={false} />)}
              </div>
            )}
            {rest.map((post) => <Post key={post.id} post={post} discussion={discussion} wide />)}
          </section>
        )
      })}
    </>
  )
}

export function DiscussionView({ id }: { id: string }) {
  const discussion = useCore((s) => s.discussions[id])
  const posts = useDiscussionPosts((all) => all[id])
  const width = usePreferences((s) => s.chatWidth)
  const fontSize = usePreferences((s) => s.chatFontSize)
  const font = usePreferences((s) => s.chatFont)
  const [renaming, setRenaming] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const mentionMenu = useDiscussionMentionMenu({ text, setText, members: discussion?.members ?? [], input })
  const list = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => { if (!posts) void loadDiscussionPosts(id) }, [id, posts])
  // Follows new posts while the user is at the bottom; leaves them be once they scroll up.
  useLayoutEffect(() => {
    const element = list.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [posts])

  if (!discussion) return null
  const mentions = mentionedMembers(text, discussion.members)
  const busyNamed = discussion.members.filter((member) => mentions.includes(member.id) && member.status !== 'idle')
  const canSend = !busy && text.trim() !== '' && busyNamed.length === 0
  const chairId = discussion.chairId

  const act = async (action: DiscussionAction) => {
    setBusy(true)
    await controlDiscussion(id, action)
    setBusy(false)
  }
  const send = async () => {
    if (!canSend) return
    setBusy(true)
    const sent = await postToDiscussion(id, text.trim(), mentions)
    setBusy(false)
    if (sent) {
      setText('')
      pinned.current = true
    }
  }
  const mention = (member: DiscussionMember) => {
    const tag = `@${member.name} `
    setText((current) => (current.includes(`@${member.name}`) ? current : `${tag}${current}`))
    input.current?.focus()
  }

  return (
    <section className="detail terminal-view discussion-view" aria-label={`群聊「${discussion.title}」`}>
      <header className="detail-header conversation-header">
        <DiscussionDot discussion={discussion} />
        <div className="header-meta">
          {renaming
            ? <TitleEditor title={discussion.title} label="群聊标题" onSave={(title) => void renameDiscussion(id, title)} onDone={() => setRenaming(false)} />
            : <button type="button" className="terminal-view-title conversation-title" title={`${discussion.title}\n点击重命名`} onClick={() => setRenaming(true)}>{discussion.title}</button>}
          <span className="muted">{discussionProgress(discussion)}</span>
          {discussion.projectPaths.length > 0 && <span className="muted" title={discussion.projectPaths.join('\n')}>{projectNames(discussion.projectPaths)}</span>}
          {discussion.anonymous && <span className="muted">匿名互评</span>}
        </div>
        <div className="toolbar">
          {ACTIONS.filter(({ action }) => checkDiscussionAction(discussion, action) === null).map(({ action, label, hint }) => (
            <button key={action} type="button" className="button discussion-action" data-tooltip={hint} disabled={busy} onClick={() => void act(action)}>
              {action === 'resume' && <PlayIcon />}
              {action === 'stop' && <StopIcon />}
              {label}
            </button>
          ))}
          <span className="toolbar-separator" aria-hidden="true" />
          <button type="button" className="tool-button" aria-label="关闭" data-tooltip="关闭" onClick={() => selectDiscussion(null)}><CloseIcon /></button>
        </div>
      </header>
      <div className="terminal-body">
        <div className="chat-view discussion-body" data-width={width} data-font-size={fontSize} data-font={font}>
          <ul className="discussion-members" aria-label="成员">
            {discussion.members.map((member) => <MemberChip key={member.id} member={member} chair={member.id === chairId} onMention={() => mention(member)} />)}
          </ul>
          <div
            ref={list}
            className="chat-list discussion-list"
            onScroll={(event) => {
              const element = event.currentTarget
              pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48
            }}
          >
            <div className="discussion-topic">
              <span className="discussion-post-kind">主题</span>
              <ChatMarkdown text={discussion.topic} />
            </div>
            {posts ? <Rounds discussion={discussion} posts={posts} /> : <p className="muted"><Spinner /> 正在读取发言…</p>}
          </div>
          <div className="chat-dock">
            <div className="chat-input-card" data-working={busy || undefined}>
              {mentionMenu.menu}
              <textarea
                ref={input}
                className="chat-input"
                rows={2}
                value={text}
                aria-label="发言"
                placeholder={discussion.state === 'done' || discussion.state === 'paused'
                  ? '补充看法或追问，发出后大家再讨论一轮；@成员 只问它，@所有人 让大家现在都回答'
                  : '插一句话，下一轮大家都会看到；@成员 只问它，@所有人 让大家现在都回答'}
                {...mentionMenu.inputProps}
                onChange={(event) => {
                  setText(event.target.value)
                  mentionMenu.track(event.target)
                }}
                onKeyDown={(event) => {
                  if (mentionMenu.onKeyDown(event)) return
                  if (!sendsMessage(event)) return
                  event.preventDefault()
                  void send()
                }}
              />
              <div className="chat-options">
                {busyNamed.length > 0 && <span className="chat-options-note muted">{busyNamed.map((member) => member.name).join('、')} 还在发言，等它说完再问</span>}
                <span className="chat-dock-spacer" />
                <button type="button" className="chat-input-button" aria-label="发送（Enter）" data-tooltip="发送（Enter）" data-tooltip-side="top-end" disabled={!canSend} onClick={() => void send()}>
                  <EnterIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
