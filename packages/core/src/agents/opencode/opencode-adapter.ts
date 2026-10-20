import type { AgentAdapter } from '../agent-adapter'
import { OPENCODE_MODES, OpenCodeAcp } from './opencode-acp'
import { detectOpenCode, opencodeCatalog, opencodeInstallation, requireOpenCode } from './opencode-cli'
import { opencodeConfig } from './opencode-config'

export const opencode: AgentAdapter = {
  kind: 'opencode',
  createDriver: (stageId, options) => new OpenCodeAcp(stageId, options),
  // Extra projects and a vault it may write go in the ACP session's additionalDirectories, and
  // Antumi's MCP servers in its mcpServers (AcpDriver); the rest rides in its config.
  command: (launch) => ({
    command: 'opencode',
    args: ['acp'],
    env: { OPENCODE_CONFIG_CONTENT: opencodeConfig(launch), OPENCODE_DISABLE_AUTOUPDATE: '1' }
  }),
  permissionModes: Object.keys(OPENCODE_MODES),
  // Antumi sets the mode over ACP, so a stage always starts in one OpenCode has.
  fallbackMode: 'ask',
  // A session belongs to its folder: loading it from another is refused.
  session: { preassignedId: false, folderBound: true, nativeFork: false },
  // It starts a server of its own and loads its providers' models before it answers.
  startTimeoutMs: 60_000,
  // Its agents allow every tool unless the user's config says otherwise, Antumi's terminal tools
  // among them, so Antumi asks in the chat.
  mcpApproval: 'antumi',
  catalog: opencodeCatalog,
  detect: detectOpenCode,
  installation: opencodeInstallation,
  launch: {
    mcp: (server) => server,
    prepare: async () => ({ command: await requireOpenCode() }),
    ready: async () => {}
  },
  turns: {
    serialized: true,
    stopAfterCancel: { cancelGraceMs: 2000, termGraceMs: 2000 },
    retryByRestart: true
  },
  optionsFromState: true,
  discovery: { commands: ['opencode'], applications: { darwin: ['OpenCode.app'] } }
}
