import type { AgentAdapter } from '../agent-adapter'
import { CODEX_MODES, CodexAppServer } from './codex-app-server'
import { codexCommand } from './codex-command'
import { hasCodexCredentials, readCodexUsage } from './codex-usage'

export const codex: AgentAdapter = {
  kind: 'codex',
  createDriver: (stageId, options) => new CodexAppServer(stageId, options),
  command: codexCommand,
  permissionModes: Object.keys(CODEX_MODES),
  // A thread is Codex's own, wherever the conversation's folder moved.
  session: { preassignedId: false, folderBound: false, nativeFork: true },
  // Codex asks nothing for MCP tools, so Kando asks in the chat.
  mcpApproval: 'kando',
  signedIn: hasCodexCredentials,
  usage: readCodexUsage
}
