import { createRoot } from '../../packages/desktop/node_modules/react-dom/client'
import { createRpcClient, Discussion, DiscussionCreate } from '@antumi/protocol'
import { useCore } from '../../packages/desktop/src/renderer/src/core-store'
import { DiscussionDraft } from '../../packages/desktop/src/renderer/src/components/DiscussionDraft'

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const query = new URLSearchParams(location.search)
function group(fields: ReturnType<typeof DiscussionCreate.parse>) {
  return Discussion.parse({
    id: id(1), title: '示例群聊', topic: fields.topic, requirements: fields.requirements, projectPaths: fields.projectPaths,
    chairId: id(fields.chair + 2), maxRounds: fields.maxRounds, anonymous: fields.anonymous,
    state: 'running', step: 'round', round: 1, lastRound: fields.maxRounds, topicStart: 0,
    pinnedAt: null, archivedAt: null, createdAt: 0, updatedAt: 0,
    members: fields.members.map((member, index) => ({ ...member, id: id(index + 2), conversationId: id(index + 12),
      model: null, effort: null, role: member.role, status: 'idle' }))
  })
}
const client = createRpcClient((frame) => {
  const request = JSON.parse(frame)
  let result: unknown = null
  if (request.method === 'discussions.create') {
    const output = document.getElementById('captured-request')
    if (output) output.textContent = JSON.stringify(request.params)
    result = group(DiscussionCreate.parse(request.params))
  } else if (request.method === 'discussions.posts') result = []
  queueMicrotask(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, result })))
})
useCore.setState({ rpc: { ...client, features: query.has('legacy') ? ['discussions'] : ['discussions', 'discussion-requirements'],
  close: () => {}, closed: new Promise<void>(() => {}) } })
const from = query.get('from')
const seed = from ? group(DiscussionCreate.parse({ topic: 'Previous topic', projectPaths: [], chair: 0,
  requirements: from === 'empty' ? '' : '请保留我的自定义规则。', members: [{ agent: 'claude', name: 'Ann' }, { agent: 'codex', name: 'Bob' }] })) : null
const root = document.getElementById('root')
if (root) createRoot(root).render(<DiscussionDraft from={seed} />)
