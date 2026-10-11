import type { AgentCommand } from '../../agent-command'
import type { AgentLaunch } from '../agent-adapter'

// The ChatGPT app's own browser, which its unified-computer-use plugin gives every Codex as the
// cua_repl MCP server: beside Kando's browser tools Codex reached for it first, and its policy,
// kept in that app, refuses a Codex that Kando runs. A whole entry, disabled, overrides the
// plugin's; enabled=false alone is an incomplete server that Codex refuses to start with, and a
// whole one is harmless where the plugin is not installed.
const HIDDEN_CODEX_BROWSERS: readonly string[] = ['-c', 'mcp_servers.cua_repl={command="/usr/bin/true",enabled=false}']

// app-server takes the thread, sandbox and extra roots over the protocol instead; Kando's MCP
// server goes in as a config override.
export function codexCommand({ mcp }: AgentLaunch): AgentCommand {
  return { command: 'codex', args: [
    'app-server',
    ...(mcp ? ['-c', `mcp_servers.kando.command=${JSON.stringify(mcp.command)}`, '-c', `mcp_servers.kando.args=${JSON.stringify(mcp.args)}`, ...HIDDEN_CODEX_BROWSERS] : [])
  ] }
}
