import { canReuseConversation, type AgentKind, type ChatItem, type Conversation } from '@antumi/protocol'
import { openBeside, openConversationDraft, perform, selectConversation, selectTask, showView, useConversationArchiveSupported, useConversationPinSupported, useCore } from '../core-store'
import { proposeHandoff } from '../chat-handoff'
import { agentLabel } from '../labels'
import { offerDraft } from '../chat-drafts'
import { saidText } from '../chat-state'
import { confirmQuota } from './AgentQuota'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { ArchiveIcon, CopyIcon, HandoffIcon, PencilIcon, PinIcon, SplitIcon, StopIcon, TrashIcon } from './icons'
import { EMPTY_DRAFT, saveComposerDraft } from '../composer-drafts'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { currentInstalledAgents, otherInstalledAgent, useInstalledAgents } from '../installed-agents'

// Every way into a handoff ends in the conversation's composer, with the agent picked there (by
// default the other one here), to be sent from it with whatever the user adds.
export function beginHandoff(conversation: Conversation, agent?: AgentKind): void {
  const state = useCore.getState()
  const from = (conversation.taskId ? state.tasks[conversation.taskId]?.agent : null) ?? conversation.agent
  const target = agent ?? otherInstalledAgent(from, currentInstalledAgents())
  if (!target) {
    useCore.setState({ error: `这台电脑上只找到了 ${agentLabel(from)}。装好另一个 Agent 后，在 设置 → 智能体 里重新检测，就可以移交了。` })
    return
  }
  proposeHandoff(conversation.id, target)
  if (conversation.taskId) {
    selectTask(conversation.taskId)
    showView('chat')
  } else selectConversation(conversation.id)
}

// A new conversation opens as a page its first message starts.
export function newConversation(projects?: readonly string[]): void {
  openConversationDraft(projects)
}

export function useReuseConversationSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('conversation-configuration') ?? false)
}

export async function newConversationFrom(conversation: Conversation): Promise<void> {
  if (!canReuseConversation(conversation)) return
  const configuration = await perform((rpc) => rpc.call('conversations.configuration', { id: conversation.id }))
  if (!configuration) return
  const previous = useCore.getState().conversationDraftFrom
  if (previous) saveComposerDraft(previous.key, EMPTY_DRAFT)
  const key = `new-from:${crypto.randomUUID()}`
  openConversationDraft(configuration.projectPaths, null, { key, title: conversation.title, configuration })
}

// A new conversation holding this one's chat up to a message, opened once core has it. A fork
// before one of the user's messages leaves that message in the new chat's input, to change or send.
export async function forkConversation(id: string, item: ChatItem): Promise<void> {
  const forked = await perform((rpc) => rpc.call('conversations.fork', { id, stageId: item.stageId, itemId: item.id }))
  if (!forked) return
  if (item.kind === 'user') offerDraft(forked.id, { text: saidText(item.text), images: item.images })
  selectConversation(forked.id)
}

// What a start tells core: that it may offer bypass, which an older core does not take.
export function startOptions(): { allowBypass?: boolean } {
  const options = useCore.getState().rpc?.features.includes('chat-options') ?? false
  return options ? { allowBypass: true } : {}
}

export function continueConversation(id: string) {
  const agent = useCore.getState().conversations[id]?.agent
  if (agent && !confirmQuota(agent)) return Promise.resolve(null)
  return perform((rpc) => rpc.call('conversations.continue', { id, ...startOptions() }))
}

export function stopConversation(id: string) {
  return perform((rpc) => rpc.call('conversations.stop', { id }))
}

export function renameConversation(id: string, title: string) {
  return perform((rpc) => rpc.call('conversations.rename', { id, title }))
}

export function pinConversation(id: string, pinned: boolean) {
  return perform((rpc) => rpc.call('conversations.setPinned', { id, pinned }))
}

export function archiveConversation(id: string, archived: boolean) {
  return perform((rpc) => rpc.call('conversations.setArchived', { id, archived }))
}

export async function deleteConversation(conversation: Conversation): Promise<boolean> {
  if (!window.confirm('删除这条会话及其聊天记录？项目目录或 Antumi 托管目录都会保留，不会改动其中的文件。')) return false
  return (await perform((rpc) => rpc.call('conversations.delete', { id: conversation.id }))) !== null
}

// The row's right-click menu: the header's actions, and the one place a conversation is deleted.
export function ConversationContextMenu({ conversation, at, onClose, onRename, onHandoff, split = null }: {
  conversation: Conversation
  at: MenuPoint
  onClose: () => void
  onRename: () => void
  onHandoff: () => void
  // Where it can open beside the conversation in front: on the right, or in the other column.
  split?: 'right' | 'other' | null
}) {
  const pick = (action: () => void) => () => {
    onClose()
    action()
  }
  // Offered only while another agent is installed to take the work.
  const other = otherInstalledAgent(conversation.agent, useInstalledAgents())
  const pinnable = useConversationPinSupported() && !conversation.taskId
  const pinned = conversation.pinnedAt != null
  const archivable = useConversationArchiveSupported() && !conversation.taskId && !conversation.discussionId
  const archived = conversation.archivedAt != null
  const busy = conversation.chat?.turn === 'running' || conversation.chat?.turn === 'awaiting'
  const reusable = useReuseConversationSupported() && canReuseConversation(conversation)
  return (
    <ContextMenu at={at} label={`会话「${conversation.title}」的操作`} onClose={onClose}>
      {split && <MenuItem label={split === 'right' ? '在右侧分屏打开' : '在另一列打开'} icon={<SplitIcon />} hint={`${PRIMARY_KEY_LABEL} 点击`} onSelect={pick(() => openBeside(conversation.id))} />}
      {reusable && <MenuItem label="按当前配置新建会话" icon={<CopyIcon />} onSelect={pick(() => void newConversationFrom(conversation))} />}
      {conversation.sessionId && <MenuItem label="停止会话" icon={<StopIcon />} onSelect={pick(() => void stopConversation(conversation.id))} />}
      {other && !archived && <MenuItem label="移交给其他智能体…" icon={<HandoffIcon />} onSelect={pick(onHandoff)} />}
      <div className="menu-separator" role="separator" />
      {pinnable && !archived && <MenuItem label={pinned ? '取消置顶' : '置顶'} icon={<PinIcon />} onSelect={pick(() => void pinConversation(conversation.id, !pinned))} />}
      <MenuItem label="重命名" icon={<PencilIcon />} onSelect={pick(onRename)} />
      {archivable && (
        <MenuItem
          label={archived ? '取消归档' : '归档'}
          icon={<ArchiveIcon />}
          hint={!archived && busy ? '等 Agent 这一轮结束' : null}
          disabled={!archived && busy}
          onSelect={pick(() => void archiveConversation(conversation.id, !archived))}
        />
      )}
      <div className="menu-separator" role="separator" />
      <MenuItem label="删除会话" icon={<TrashIcon />} danger onSelect={pick(() => void deleteConversation(conversation))} />
    </ContextMenu>
  )
}
