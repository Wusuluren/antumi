import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { checkDiscussionAction, MAX_DETAILS_LENGTH, type Discussion, type DiscussionAction, type DiscussionMember, type DiscussionPost } from '@kando/protocol'
import { loadConversation, perform, selectConversation, selectDiscussion, selectTask, useCore } from '../core-store'
import { controlDiscussion, discussionProgress, EVERYONE, loadDiscussionPosts, MEMBER_STATUS_LABEL, mentionedMembers, postToDiscussion, renameDiscussion, useDiscussionPosts } from '../discussions'
import { agentLabel, messageTime, reasonText } from '../labels'
import { setPreference, usePreferences } from '../preferences'
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

// A member's face: its agent's mark, and its letter (A, B…) to tell two on the same agent apart.
function MemberFace({ member, index }: { member: DiscussionMember | undefined; index: number }) {
  return (
    <span className="discussion-face" aria-hidden="true">
      {member && <AgentIcon agent={member.agent} />}
      {index >= 0 && <span className="discussion-face-letter">{String.fromCharCode(65 + index)}</span>}
    </span>
  )
}

function PostHead({ post, member, chair }: { post: DiscussionPost; member: DiscussionMember | undefined; chair: boolean }) {
  return (
    <div className="discussion-msg-head">
      <span className="discussion-msg-name">{member ? member.name : '已移除的成员'}</span>
      {chair && <span className="discussion-tag" data-chair="">主持</span>}
      {KIND_LABEL[post.kind] && post.kind !== 'summary' && <span className="discussion-tag">{KIND_LABEL[post.kind]}</span>}
      {member?.model && <span>{member.model}</span>}
      <span className="discussion-msg-time">{messageTime(post.createdAt)}</span>
    </div>
  )
}

// The user's words with the members it names standing out, as a chat app marks an @.
function MentionedText({ text, names }: { text: string; names: readonly string[] }) {
  const tags = [EVERYONE, ...names].map((name) => `@${name}`).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${tags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return <>{text.split(pattern).map((part, index) => (tags.includes(part) ? <span key={index} className="discussion-at">{part}</span> : part))}</>
}

function PendingPost({ member }: { member: DiscussionMember | undefined }) {
  if (member?.status === 'awaiting') {
    return <span className="discussion-typing">在等你确认，<button type="button" className="link-button" onClick={() => void openMember(member)}>去处理</button></span>
  }
  return <span className="discussion-typing" role="status"><i /><i /><i />正在思考</span>
}

// One post, as a chat app lays a group out: a member's on the left, its face beside a bubble under
// its name; the user's on the right; Kando's own notes in the middle; the summary as a card.
function Post({ post, discussion }: { post: DiscussionPost; discussion: Discussion }) {
  if (post.kind === 'notice') return <p className="discussion-system">{post.text}</p>
  if (post.kind === 'user') {
    return (
      <div className="discussion-msg" data-mine="">
        <span className="discussion-face discussion-face-me" aria-hidden="true">我</span>
        <div className="discussion-msg-body">
          <div className="discussion-bubble"><MentionedText text={post.text} names={discussion.members.map((member) => member.name)} /></div>
        </div>
      </div>
    )
  }
  const index = discussion.members.findIndex((each) => each.id === post.memberId)
  const member = discussion.members[index]
  const summary = post.kind === 'summary' && post.state === 'done'
  return (
    <article className="discussion-msg" data-kind={post.kind} data-state={post.state}>
      <MemberFace member={member} index={index} />
      <div className="discussion-msg-body">
        <PostHead post={post} member={member} chair={member !== undefined && member.id === discussion.chairId} />
        {summary ? (
          <div className="discussion-bubble discussion-summary">
            <div className="discussion-summary-head">讨论总结</div>
            <div className="discussion-summary-body"><ChatMarkdown text={post.text} /></div>
            <div className="discussion-summary-foot">
              <span>{discussion.members.length} 位成员 · {discussion.round} 轮</span>
              <button type="button" className="link-button" onClick={() => void taskFromSummary(discussion, post)}>从结论新建任务</button>
            </div>
          </div>
        ) : (
          <div className="discussion-bubble" data-failed={post.state === 'failed' || undefined}>
            {post.state === 'pending' ? <PendingPost member={member} /> : (
              <>
                {post.text && <ChatMarkdown text={post.text} />}
                {post.state === 'failed' && <p className="discussion-post-failed">这次没有发言成功：{reasonText(post.error ?? '', post.error ?? '未知原因')}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

// Posts by round, each opened by a note in the middle. The first round's independent answers go one
// after another, or side by side to compare them; the summary is announced by who gives it.
function Rounds({ discussion, posts }: { discussion: Discussion; posts: readonly DiscussionPost[] }) {
  const sideBySide = usePreferences((p) => p.discussionSideBySide)
  const rounds = new Map<number, DiscussionPost[]>()
  for (const post of posts) rounds.set(post.round, [...(rounds.get(post.round) ?? []), post])
  const chair = discussion.members.find((member) => member.id === discussion.chairId)
  return (
    <>
      {[...rounds].map(([round, list]) => {
        const openings = list.filter((post) => post.kind === 'opening')
        const rest = list.filter((post) => post.kind !== 'opening')
        const what = openings.length > 0 ? '各自独立作答，彼此看不到' : list.some((post) => post.kind === 'rebuttal') ? '互相回应' : null
        return (
          <section key={round} className="discussion-round" aria-label={round === 0 ? '开场' : `第 ${round} 轮`}>
            {round > 0 && (
              <div className="discussion-system">
                第 {round} 轮{what && ` · ${what}`}
                {openings.length > 1 && (
                  <button type="button" className="link-button" aria-pressed={sideBySide} onClick={() => setPreference('discussionSideBySide', !sideBySide)}>
                    {sideBySide ? '按顺序看' : '并排对比'}
                  </button>
                )}
              </div>
            )}
            {openings.length > 0 && (
              <div className="discussion-openings" data-side-by-side={(sideBySide && openings.length > 1) || undefined}>
                {openings.map((post) => <Post key={post.id} post={post} discussion={discussion} />)}
              </div>
            )}
            {rest.map((post) => (
              <Fragment key={post.id}>
                {post.kind === 'summary' && <p className="discussion-system">讨论结束 · {chair ? `${chair.name} 总结` : '总结'}</p>}
                <Post post={post} discussion={discussion} />
              </Fragment>
            ))}
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
          <span className="muted">（{discussion.members.length}）</span>
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
