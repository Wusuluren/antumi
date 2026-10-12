import { Rejection } from '../../rejection'
import type { AgentAdapter, AgentStage } from '../agent-adapter'
import { CURSOR_MODES, CursorAcp } from './cursor-acp'
import { cursorCatalog, cursorInstallation, detectCursorCli, requireCursorCli } from './cursor-cli'
import { cursorMcpReadyFile, cursorMcpServer, prepareCursorMcp, waitForCursorMcp } from './cursor-mcp'
import { readCursorUsage } from './cursor-usage'

const readyFile = (stage: AgentStage) => cursorMcpReadyFile(stage.sessionsRoot, stage.conversationId, stage.stageId)

export const cursor: AgentAdapter = {
  kind: 'cursor',
  createDriver: (stageId, options) => new CursorAcp(stageId, options),
  command: () => ({ command: 'cursor-agent', args: ['acp'] }),
  permissionModes: Object.keys(CURSOR_MODES),
  // Kando sets the mode over ACP, so a stage always starts in one Cursor has.
  fallbackMode: 'ask',
  session: { preassignedId: false, folderBound: true, nativeFork: false },
  // Its CLI starts cold and loads the session before it answers.
  startTimeoutMs: 60_000,
  mcpApproval: 'agent',
  catalog: cursorCatalog,
  detect: detectCursorCli,
  usage: readCursorUsage,
  installation: cursorInstallation,
  // Asking only: it reads nothing and changes nothing.
  quick: {
    command: async (prompt, model) => ({
      command: await requireCursorCli(),
      args: ['-p', ...(model ? ['--model', model] : []), '--output-format', 'text', '--mode', 'ask', '--trust', prompt],
      stdin: null,
      output: 'stdout'
    })
  },
  launch: {
    // Kando's MCP server reports, through a file, that Cursor connected to it.
    mcp: (server, stage) => cursorMcpServer(server, readyFile(stage), stage.planOnly),
    prepare: async (stage, mcp) => {
      const command = await requireCursorCli()
      if (!mcp) throw new Rejection('cursor-mcp-unavailable', 'Cursor 需要 Kando MCP 配置')
      await prepareCursorMcp(readyFile(stage))
      return { command }
    },
    ready: (stage) => waitForCursorMcp(readyFile(stage))
  },
  turns: {
    serialized: true,
    stopAfterCancel: { cancelGraceMs: 2000, termGraceMs: 2000 },
    firstFrameTimeoutMs: 30_000,
    retryByRestart: true,
    denialAsMessage: true
  },
  optionsFromState: true,
  discovery: {
    commands: ['cursor-agent'],
    applications: {
      darwin: ['Cursor.app'],
      win32: ['cursor/Cursor.exe'],
      linux: ['cursor/cursor', 'Cursor/cursor', 'cursor', 'Cursor.AppImage']
    }
  }
}
