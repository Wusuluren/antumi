import { Rejection } from '../../rejection'
import type { AgentAdapter, AgentStage } from '../agent-adapter'
import { clearMcpReadyFile, mcpReadyFile, mcpReadyWithin, mcpServerReporting } from '../mcp-ready-file'
import { OPENCODE_MODES, OpenCodeAcp } from './opencode-acp'
import { detectOpenCode, opencodeCatalog, opencodeInstallation, requireOpenCode } from './opencode-cli'
import { opencodeConfig } from './opencode-config'

const readyFile = (stage: AgentStage) => mcpReadyFile(stage, 'opencode')
// It starts the server with its own, after loading its config and providers.
const MCP_WAIT_MS = 20_000
const MCP_SETTLE_MS = 1500

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
  // A session belongs to its folder: loading it from another is refused. Its ACP forks a session
  // whole (session/fork), with no point to stop at.
  session: { preassignedId: false, folderBound: true, nativeFork: 'latest' },
  // It starts a server of its own and loads its providers' models before it answers.
  startTimeoutMs: 60_000,
  // Its agents allow every tool unless the user's config says otherwise, Antumi's terminal tools
  // among them, so Antumi asks in the chat.
  mcpApproval: 'antumi',
  catalog: opencodeCatalog,
  detect: detectOpenCode,
  installation: opencodeInstallation,
  // Antumi's server rides in its config, where OpenCode loads it beside the session, not before
  // the session opens as one given in session/new: a first message sent before it has listed the
  // tools goes without them. So the stage waits for that.
  launch: {
    mcp: (server, stage) => mcpServerReporting(server, readyFile(stage), stage.planOnly, true),
    prepare: async (stage) => {
      const command = await requireOpenCode()
      await clearMcpReadyFile(readyFile(stage))
      return { command }
    },
    ready: async (stage) => {
      if (!await mcpReadyWithin(readyFile(stage), MCP_WAIT_MS)) throw new Rejection('opencode-mcp-unavailable', 'OpenCode 未能加载 Antumi MCP，请检查 OpenCode 配置后重试')
      // Listed is not yet offered: it takes listed tools in after a 100ms debounce and a reload of
      // its catalog, under a second as measured on 2.1.1, and says nothing when it has. A turn that
      // still comes first has them from the next one.
      await new Promise((resolve) => setTimeout(resolve, MCP_SETTLE_MS))
    }
  },
  turns: {
    serialized: true,
    stopAfterCancel: { cancelGraceMs: 2000, termGraceMs: 2000 },
    retryByRestart: true
  },
  optionsFromState: true,
  discovery: { commands: ['opencode'], applications: { darwin: ['OpenCode.app'] } }
}
