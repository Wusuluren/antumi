import { createRoot } from '../../packages/desktop/node_modules/react-dom/client'
import { ChatSettings, createRpcClient } from '@antumi/protocol'
import { useCore } from '../../packages/desktop/src/renderer/src/core-store'
import { usePreferences } from '../../packages/desktop/src/renderer/src/preferences'
import { SettingsPage } from '../../packages/desktop/src/renderer/src/components/SettingsPage'

const legacy = new URLSearchParams(location.search).has('legacy')
let settings = ChatSettings.parse({ promptSuggestions: true, ...legacy ? {} : { titleNaming: 'off', titleModels: {} } })
const client = createRpcClient((frame) => {
  const request = JSON.parse(frame)
  const output = document.getElementById('requests')
  if (output) output.textContent = JSON.stringify([...JSON.parse(output.textContent || '[]'), request])
  let result: unknown = null
  if (request.method === 'system.setChatSettings') {
    settings = ChatSettings.parse({ ...settings, ...request.params })
    result = settings
  } else if (request.method === 'conversations.chatCatalog') result = { models: [
    { id: 'haiku', label: 'Haiku', description: '轻量模型', efforts: [], isDefault: false },
    { id: 'sonnet', label: 'Sonnet', description: '通用模型', efforts: [], isDefault: true }
  ] }
  queueMicrotask(() => client.receive(JSON.stringify({ jsonrpc: '2.0', id: request.id, result })))
})
useCore.setState({ rpc: { ...client, features: ['chat-options'], close: () => {}, closed: new Promise<void>(() => {}) },
  connection: 'connected', chatSettings: settings, settingsSection: 'agents' })
usePreferences.setState({ quickModels: { claude: 'haiku' } })
const root = document.getElementById('root')
if (root) createRoot(root).render(<SettingsPage />)
