import type { AgentAdapter } from '../agent-adapter'
import { claudeCommand } from './claude-command'
import { CLAUDE_MODE_NAMES, ClaudeStream } from './claude-stream'
import { hasClaudeCredentials, readClaudeUsage } from './claude-usage'

export const claude: AgentAdapter = {
  kind: 'claude',
  createDriver: (stageId, options) => new ClaudeStream(stageId, options),
  command: claudeCommand,
  permissionModes: Object.keys(CLAUDE_MODE_NAMES),
  session: { preassignedId: true, folderBound: true, nativeFork: true },
  // Claude Code asks for MCP tools itself, under whatever mode the user set.
  mcpApproval: 'agent',
  signedIn: hasClaudeCredentials,
  usage: readClaudeUsage
}
