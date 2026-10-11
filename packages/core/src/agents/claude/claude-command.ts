import { SHOW_PREVIEW_TOOL, terminalToolName } from '@kando/protocol'
import { BROWSER_READ_TOOLS, type AgentCommand } from '../../agent-command'
import type { AgentLaunch } from '../agent-adapter'
import { CLAUDE_MODE_NAMES } from './claude-stream'

// Claude splits these lists on commas, so a path with one in it is left out rather than garbled.
const usable = (paths: readonly string[]) => paths.filter((file) => !file.includes(','))

// Claude may read exactly these files without asking; nothing else in the attachment folder.
// `//` starts an absolute path in Claude's permission rules.
export function claudeReadRules(files: readonly string[]): string[] {
  return usable(files)
    .filter((file) => file.startsWith('/'))
    .map((file) => `Read(/${file})`)
}

// Claude may edit nothing under these folders, whatever mode it is switched to. Its plan drafts go
// to ~/.claude/plans instead, so plan mode still works; an Edit rule covers every editing tool.
export function claudeEditDenials(dirs: readonly string[]): string[] {
  return usable(dirs)
    .filter((dir) => dir.startsWith('/'))
    .map((dir) => `Edit(/${dir}/**)`)
}

// Read-only git lets the agent look at a dependency's branch without a prompt.
export const GIT_READ_TOOLS = ['Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git show:*)']

// Claude Code in print mode, speaking stream-json both ways.
export function claudeCommand(launch: AgentLaunch): AgentCommand {
  const { providerSessionId, resume, handoffPath, extraProjects, preferred = {}, planOnly, readable = [], mcp, forkAt } = launch
  const allowBypass = (launch.allowBypass ?? false) && !planOnly
  // A remembered bypass needs the user's say-so for this start too. Asking goes by manual on
  // the command line, and is passed too, so Claude Code's own default mode cannot override it.
  const chosen = preferred.permissionMode && (preferred.permissionMode !== 'bypass' || allowBypass) ? preferred.permissionMode : undefined
  const allowed = planOnly ? 'plan' : chosen
  const wanted = allowed === 'ask' ? 'manual' : allowed ? CLAUDE_MODE_NAMES[allowed] : undefined
  const reads = [
    ...(handoffPath ? [`Read(/${handoffPath})`] : []),
    ...claudeReadRules(readable),
    // Planning around what dependencies left on their branches means reading git history.
    ...(planOnly ? GIT_READ_TOOLS : []),
    // Showing a file the agent wrote asks nothing of the user, nor does reading the browser's
    // page; opening and acting on a page go through Claude's own confirmation. (Codex asks
    // nothing for MCP tools, so for it the site gate in core is the only check.)
    // Reading or stopping a terminal the conversation opened itself asks nothing either; running
    // a command in one is the agent's to ask about, under the mode the user set.
    ...(mcp ? [SHOW_PREVIEW_TOOL, ...BROWSER_READ_TOOLS, terminalToolName('read'), terminalToolName('stop')].map((tool) => `mcp__kando__${tool}`) : [])
  ]
  const denials = planOnly ? claudeEditDenials(planOnly.dirs) : []
  return { command: 'claude', args: [
    '-p', '--verbose', '--output-format', 'stream-json', '--input-format', 'stream-json',
    '--include-partial-messages', '--permission-prompt-tool', 'stdio',
    // Makes bypass a mode the user can switch to, without starting in it.
    ...(allowBypass ? ['--allow-dangerously-skip-permissions'] : []),
    ...(wanted ? ['--permission-mode', wanted] : []),
    ...(preferred.model ? ['--model', preferred.model] : []),
    ...(preferred.effort ? ['--effort', preferred.effort] : []),
    ...(resume && providerSessionId ? ['--resume', providerSessionId, ...(forkAt ? ['--resume-session-at', forkAt, '--fork-session'] : [])] : providerSessionId ? ['--session-id', providerSessionId] : []),
    ...extraProjects.flatMap((project) => ['--add-dir', project]),
    ...(denials.length ? ['--disallowedTools', denials.join(',')] : []),
    ...(reads.length ? ['--allowedTools', reads.join(',')] : []),
    ...(mcp ? ['--mcp-config', JSON.stringify({ mcpServers: { kando: { type: 'stdio', command: mcp.command, args: mcp.args } } })] : [])
  ] }
}
