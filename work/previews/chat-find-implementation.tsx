import { useState } from 'react'
import { createRoot } from '../../packages/desktop/node_modules/react-dom/client'
import { ChatItem, Conversation, Discussion, DiscussionPost, createRpcClient } from '@antumi/protocol'
import { useCore } from '../../packages/desktop/src/renderer/src/core-store'
import { useChat } from '../../packages/desktop/src/renderer/src/chat-state'
import { useDiscussionPosts } from '../../packages/desktop/src/renderer/src/discussions'
import { usePreferences } from '../../packages/desktop/src/renderer/src/preferences'
import { ConversationChat } from '../../packages/desktop/src/renderer/src/components/ConversationChat'
import { DiscussionView } from '../../packages/desktop/src/renderer/src/components/DiscussionView'

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const query = new URLSearchParams(location.search)
const conversation = (index: number) => Conversation.parse({ id: id(index), title: '聊天搜索验证', titleLocked: false,
  agent: 'claude', workspacePath: '/tmp', projectPaths: [], managedWorkspace: false, sessionId: null,
  chat: { turn: 'idle' }, ...(query.has('task') ? { taskId: id(99) } : {}), createdAt: 0, updatedAt: 0 })
const chats = [conversation(1), conversation(2)]
function item(index: number, fields: Record<string, unknown>) {
  return ChatItem.parse({ id: `item:${index}`, stageId: id(10), revision: 1, at: index * 1000, ...fields })
}
const initial = [
  item(3, { kind: 'user', text: '请分析缓存方案，保留所有细节。', images: [] }),
  item(4, { kind: 'reasoning', text: '隐藏思考：缓存命中率影响延迟。', streaming: false }),
  item(5, { kind: 'tool', name: 'Bash', title: 'Read cache configuration', input: 'cat cache.conf',
    status: 'done', output: '缓存工具输出\n' + '普通输出\n'.repeat(850) + '输出末尾唯一', diffs: [] }),
  item(6, { kind: 'tool', name: 'Task', title: '分析子任务', input: '{"prompt":"检查缓存策略"}',
    status: 'done', output: '子任务完整输出唯一', diffs: [], metrics: null }),
  item(7, { kind: 'assistant', text: '# 缓存方案\n\n缓存可以降低数据库负载。\n\n跨**节点**匹配也应支持。', streaming: false }),
  item(8, { kind: 'turn', state: 'completed', durationMs: 1000, error: null })
]
const old = [item(1, { kind: 'user', text: '更早缓存问题', images: [] }), item(2, { kind: 'assistant', text: '历史缓存回复', streaming: false })]
const older = [item(0, { kind: 'assistant', text: '最早历史唯一', streaming: false })]
let failed = false
const client = createRpcClient((frame) => {
  const request = JSON.parse(frame)
  const output = document.getElementById('captured-request')
  if (output) output.textContent = JSON.stringify([...JSON.parse(output.textContent || '[]'), request])
  let result: unknown = null
  if (request.method === 'conversations.watchChat') result = { items: request.params.id === id(1) ? initial : [item(20, { kind: 'assistant', text: '另一个会话文本', streaming: false })], before: request.params.id === id(1) ? id(30) : null }
  else if (request.method === 'conversations.stages' || request.method === 'discussions.posts') result = []
  else if (request.method === 'conversations.chatItems') {
    if (query.has('fail') && !failed) {
      failed = true
      setTimeout(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: 'temporary failure' } })), 150)
      return
    }
    result = request.params.before === id(30) ? { items: old, before: id(31) } : { items: older, before: null }
  }
  setTimeout(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, result })), request.method === 'conversations.chatItems' ? 150 : 0)
})
const group = Discussion.parse({ id: id(40), title: '缓存方案讨论', topic: '如何提高缓存命中率', projectPaths: [],
  chairId: id(41), maxRounds: 1, anonymous: false, state: 'done', step: null, round: 1, lastRound: 1,
  topicStart: 0, pinnedAt: null, archivedAt: null, createdAt: 0, updatedAt: 0,
  members: [{ id: id(41), conversationId: id(1), agent: 'claude', name: '分析师', model: null, effort: null, role: '', status: 'idle' },
    { id: id(42), conversationId: id(2), agent: 'codex', name: '审查员', model: null, effort: null, role: '', status: 'idle' }] })
const posts = ['缓存能减少数据库请求。', '缓存也需要失效策略。', '推荐渐进引入缓存。'].map((text, index) => DiscussionPost.parse({
  id: id(50 + index), discussionId: group.id, sequence: index + 1, round: 1, memberId: id(41),
  kind: index === 2 ? 'summary' : 'opening', text, mentions: [], topic: false, state: 'done', error: null, createdAt: index * 1000, updatedAt: index * 1000
}))
useCore.setState({ rpc: { ...client, features: ['discussions'], close: () => {}, closed: new Promise<void>(() => {}) },
  conversations: Object.fromEntries(chats.map((chat) => [chat.id, chat])), discussions: { [group.id]: group } })
useDiscussionPosts.setState({ [group.id]: posts })
usePreferences.setState({ foldTurns: true })
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.body.dataset.escaped = 'true'
})
function Fixture() {
  const [index, setIndex] = useState(0)
  return <>
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: 12, display: 'flex', gap: 16 }}><span>聊天搜索 · 实际组件</span>
        <button onClick={() => setIndex((previous) => 1 - previous)}>切换会话</button>
        <button onClick={() => useChat.setState((state) => {
          const page = state[id(1)]
          return page ? { [id(1)]: { ...page, items: [...page.items, item(9, { kind: 'assistant', text: '流式缓存更新', streaming: true })] } } : {}
        })}>追加流式消息</button>
      </header>
      {query.has('group') ? <DiscussionView id={group.id} /> : <ConversationChat conversation={chats[index]} />}
    </main>
    <aside className="side-panel" style={{ display: 'none' }}><input aria-label="检查器输入框" /></aside>
  </>
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<Fixture />)
