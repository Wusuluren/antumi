import type { McpServer as UserMcpServer } from '@antumi/protocol'
import type { AgentMcpServer, McpServer } from './agent-command'
import { mcpCommand } from './mcp-command'

// The tools every conversation has (showing a file the agent wrote, the browser), acting for this
// one conversation, whose tabs are the only ones it reaches; and the user's history, where allowed.
export function antumiChatMcpServer(home: string, conversationId: string, { history = false, todos = true }: { history?: boolean; todos?: boolean } = {}): McpServer {
  return mcpCommand('--home', home, '--conversation', conversationId, ...(history ? ['--history'] : []), ...(todos ? [] : ['--no-todos']))
}

// One of the user's MCP servers as an agent is handed it. Antumi's launcher (mcp-main --run) starts a
// command with its env, and carries a server's messages where it needs headers; a server that
// needs nothing is reached at its address by the agent itself.
export function userMcpServer(home: string, server: UserMcpServer): AgentMcpServer {
  const { transport } = server
  if (transport.type === 'http' && transport.headerKeys.length === 0) return { name: server.name, type: 'http', url: transport.url }
  return { name: server.name, type: 'stdio', ...mcpCommand('--home', home, '--run', server.name) }
}
