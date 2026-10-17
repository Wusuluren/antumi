import { parseCodexQuick } from '../../model-metering'
import type { AgentAdapter } from '../agent-adapter'
import { CODEX_MODES, CodexAppServer } from './codex-app-server'
import { codexCommand } from './codex-command'
import { hasCodexCredentials, readCodexUsage, useCodexResetCredit } from './codex-usage'

export const codex: AgentAdapter = {
  kind: 'codex',
  createDriver: (stageId, options) => new CodexAppServer(stageId, options),
  command: codexCommand,
  permissionModes: Object.keys(CODEX_MODES),
  // A thread is Codex's own, wherever the conversation's folder moved.
  session: { preassignedId: false, folderBound: false, nativeFork: true },
  // Codex asks only before a tool it reads as acting on the outside world, which Antumi's own are
  // not marked as, so Antumi asks in the chat.
  mcpApproval: 'antumi',
  signedIn: hasCodexCredentials,
  usage: readCodexUsage,
  useResetCredit: useCodexResetCredit,
  // At low effort, read-only, and not kept in its history. Its progress goes to stdout too, so the
  // answer comes from a file.
  quick: {
    parse: parseCodexQuick,
    command: (prompt, model, outputFile) => ({
      command: 'codex',
      args: ['exec', '--json', ...(model ? ['-m', model] : []), '-c', 'model_reasoning_effort="low"', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-o', outputFile, '--', '-'],
      stdin: prompt,
      output: 'file'
    })
  }
}
