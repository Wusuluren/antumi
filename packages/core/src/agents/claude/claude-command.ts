import { RESERVED_MCP_SERVER_NAME, SQUAD_TOOL_NAMES, HISTORY_TOOLS, historyToolName, SHOW_PREVIEW_TOOL, terminalToolName, TODO_TOOLS, todoToolName } from '@antumi/protocol'
import { BROWSER_READ_TOOLS, type AgentCommand } from '../../agent-command'
import { startNote } from '../../agent-prompt'
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
  const { providerSessionId, resume, handoffPath, extraProjects, preferred = {}, planOnly, readOnly, readable = [], mcp, userMcp = [], forkAt, userBrowser, knowledgeBase, skills } = launch
  // Folders it may read but never edit: a plan-only stage's, or a read-only worker's.
  const fenced = planOnly ?? readOnly
  const allowBypass = (launch.allowBypass ?? false) && !fenced
  // A remembered bypass needs the user's say-so for this start too. Asking goes by manual on
  // the command line, and is passed too, so Claude Code's own default mode cannot override it.
  const chosen = preferred.permissionMode && (preferred.permissionMode !== 'bypass' || allowBypass) ? preferred.permissionMode : undefined
  const allowed = planOnly ? 'plan' : chosen
  const wanted = allowed === 'ask' ? 'manual' : allowed ? CLAUDE_MODE_NAMES[allowed] : undefined
  const reads = [
    ...(handoffPath ? [`Read(/${handoffPath})`] : []),
    ...claudeReadRules(readable),
    // Planning around what dependencies left on their branches means reading git history.
    ...(fenced ? GIT_READ_TOOLS : []),
    // The vault it may not write is readable without asking, and without being a working
    // folder: as one, Claude would load the vault's own skills too.
    ...(knowledgeBase && !knowledgeBase.write ? claudeReadRules([`${knowledgeBase.path}/**`]) : []),
    // Showing a file the agent wrote asks nothing of the user, nor does reading the browser's
    // page; opening and acting on a page go through Claude's own confirmation. (Codex asks
    // nothing for Antumi's MCP tools, so for it the site gate in core is the only check.)
    // Reading or stopping a terminal the conversation opened itself asks nothing either; running
    // a command in one is the agent's to ask about, under the mode the user set. Reading the user's
    // history, which only reads and is there only where the user allows it, asks nothing.
    ...(mcp ? [...Object.values(SQUAD_TOOL_NAMES), SHOW_PREVIEW_TOOL, ...BROWSER_READ_TOOLS, terminalToolName('read'), terminalToolName('stop'), ...HISTORY_TOOLS.map(historyToolName), ...TODO_TOOLS.map(todoToolName)].map((tool) => `mcp__${RESERVED_MCP_SERVER_NAME}__${tool}`) : [])
  ]
  const denials = fenced ? claudeEditDenials(fenced.dirs) : []
  const note = startNote({ knowledgeBase, todos: Boolean(mcp) })
  const servers = {
    ...(mcp ? { [RESERVED_MCP_SERVER_NAME]: { type: 'stdio', command: mcp.command, args: mcp.args, ...(mcp.env ? { env: mcp.env } : {}) } } : {}),
    ...Object.fromEntries(userMcp.map((server) => [server.name, server.type === 'stdio' ? { type: 'stdio', command: server.command, args: server.args, ...(server.env ? { env: server.env } : {}) } : { type: 'http', url: server.url }]))
  }
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
    // A vault it may write is a working folder, edits in it going by the mode as a project's do.
    ...(knowledgeBase?.write ? ['--add-dir', knowledgeBase.path] : []),
    ...(note ? ['--append-system-prompt', note] : []),
    // Antumi's skills as a plugin: read, not a working folder.
    ...(skills ? ['--plugin-dir', skills.dir] : []),
    ...(denials.length ? ['--disallowedTools', denials.join(',')] : []),
    ...(reads.length ? ['--allowedTools', reads.join(',')] : []),
    // Beside the user's own MCP configuration, which Claude still loads: not --strict-mcp-config.
    ...(Object.keys(servers).length ? ['--mcp-config', JSON.stringify({ mcpServers: servers })] : []),
    // Claude in Chrome, either way, so Antumi's setting wins over Claude Code's own default.
    ...(userBrowser === undefined ? [] : [userBrowser ? '--chrome' : '--no-chrome'])
  ] }
}
