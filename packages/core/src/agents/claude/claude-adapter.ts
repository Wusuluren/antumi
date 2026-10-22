import { parseClaudeQuick } from '../../model-metering'
import type { AgentAdapter } from '../agent-adapter'
import { claudeAccounts } from './claude-account'
import { claudeCommand } from './claude-command'
import { claudeProviderModels } from './claude-provider'
import { CLAUDE_MODE_NAMES, ClaudeStream } from './claude-stream'
import { hasClaudeCredentials, readClaudeUsage } from './claude-usage'

export const claude: AgentAdapter = {
  kind: 'claude',
  createDriver: (stageId, options) => new ClaudeStream(stageId, options),
  command: claudeCommand,
  providerModels: claudeProviderModels,
  permissionModes: Object.keys(CLAUDE_MODE_NAMES),
  session: { preassignedId: true, folderBound: true, nativeFork: 'any' },
  // Claude Code asks for MCP tools itself, under whatever mode the user set.
  mcpApproval: 'agent',
  signedIn: hasClaudeCredentials,
  usage: readClaudeUsage,
  accounts: claudeAccounts,
  // Haiku, with no tools, no MCP servers, no skills, and no session left for --resume.
  quick: {
    parse: parseClaudeQuick,
    command: (prompt, model) => ({
      command: 'claude',
      args: ['-p', ...(model ? ['--model', model] : []), '--output-format', 'json', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'],
      stdin: prompt,
      output: 'stdout'
    })
  }
}
