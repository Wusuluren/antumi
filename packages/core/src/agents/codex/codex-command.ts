import { RESERVED_MCP_SERVER_NAME } from '@antumi/protocol'
import type { AgentCommand, AgentMcpServer } from '../../agent-command'
import { startNote } from '../../agent-prompt'
import type { AgentLaunch } from '../agent-adapter'

// The ChatGPT app's own browser, which its unified-computer-use plugin gives every Codex as the
// cua_repl MCP server: beside Antumi's browser tools Codex reached for it first, and its policy,
// kept in that app, refuses a Codex that Antumi runs. A whole entry, disabled, overrides the
// plugin's; enabled=false alone is an incomplete server that Codex refuses to start with, and a
// whole one is harmless where the plugin is not installed.
const HIDDEN_CODEX_BROWSERS: readonly string[] = ['-c', 'mcp_servers.cua_repl={command="/usr/bin/true",enabled=false}']

// A whole entry, as an inline table: it replaces one of the same name in the user's config.toml
// rather than merging with it. JSON arrays of strings are TOML arrays too.
function codexServer(server: AgentMcpServer): string {
  return server.type === 'stdio'
    ? `{command=${JSON.stringify(server.command)},args=${JSON.stringify(server.args)}}`
    : `{url=${JSON.stringify(server.url)}}`
}

// app-server takes the thread, sandbox and extra roots over the protocol instead; Antumi's MCP
// server goes in as a config override, as does the start note (the user's vault itself is a
// writable root of each turn, see CodexAppServer). A JSON string is a TOML basic string. A skills
// bundle (AgentLaunch.skills) is not given: Codex reads skills from fixed folders only; the places
// to try are skills.config in its config and the cwds of skills/list (CodexAppServer).
export function codexCommand({ mcp, userMcp = [], knowledgeBase }: AgentLaunch): AgentCommand {
  const note = startNote({ knowledgeBase, todos: Boolean(mcp) })
  return { command: 'codex', args: [
    'app-server',
    ...(mcp ? ['-c', `mcp_servers.${RESERVED_MCP_SERVER_NAME}.command=${JSON.stringify(mcp.command)}`, '-c', `mcp_servers.${RESERVED_MCP_SERVER_NAME}.args=${JSON.stringify(mcp.args)}`, ...HIDDEN_CODEX_BROWSERS] : []),
    ...userMcp.flatMap((server) => ['-c', `mcp_servers.${server.name}=${codexServer(server)}`]),
    ...(note ? ['-c', `developer_instructions=${JSON.stringify(note)}`] : [])
  ] }
}
