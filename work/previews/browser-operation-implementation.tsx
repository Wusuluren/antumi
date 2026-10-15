import { useState } from 'react'
import { createRoot } from '../../packages/desktop/node_modules/react-dom/client'
import type { ChatItem, ChatToolStatus } from '@antumi/protocol'
import { ChatBrowserActivity } from '../../packages/desktop/src/renderer/src/components/ChatBrowserActivity'
import { ChatToolIcon } from '../../packages/desktop/src/renderer/src/components/ChatToolIcon'

function App() {
  const [action, setAction] = useState('navigate')
  const [status, setStatus] = useState<ChatToolStatus>('running')
  const tool: Extract<ChatItem, { kind: 'tool' }> = {
    kind: 'tool', id: action, stageId: 'stage', revision: 1, at: Date.now(),
    name: `mcp__claude_in_chrome__${action}`, display: { server: 'Claude in Chrome', name: action },
    title: '', input: '{"url":"https://chowbus.atlassian.net/wiki/spaces/D/pages/AI-Menu-ASK"}',
    output: null, status, diffs: []
  }
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', background: 'var(--surface)', minHeight: 420 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {['navigate', 'click', 'type', 'scroll', 'get_page_text', 'screenshot'].map((value) => <button className="button" key={value} onClick={() => { setAction(value); setStatus('running') }}>{value}</button>)}
        <button className="button" onClick={() => setStatus('done')}>完成</button>
        <button className="button" onClick={() => setStatus('failed')}>失败</button>
      </div>
      <div className="chat-view" style={{ display: 'block' }}>
        <div className="chat-tool-row"><ChatToolIcon name={tool.name} display={tool.display} status={status} /><span className="chat-tool-summary">浏览器操作 4 次</span></div>
        <ChatBrowserActivity tool={tool} />
      </div>
    </div>
  )
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
