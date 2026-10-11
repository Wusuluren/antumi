import type { AgentAdapter } from '../agent-adapter'
import { CURSOR_MODES, CursorAcp } from './cursor-acp'
import { cursorCatalog, cursorInstallation, detectCursorCli } from './cursor-cli'
import { readCursorUsage } from './cursor-usage'

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
  discovery: {
    commands: ['cursor-agent'],
    applications: {
      darwin: ['Cursor.app'],
      win32: ['cursor/Cursor.exe'],
      linux: ['cursor/cursor', 'Cursor/cursor', 'cursor', 'Cursor.AppImage']
    }
  }
}
