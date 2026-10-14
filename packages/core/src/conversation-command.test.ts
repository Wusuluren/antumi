import { describe, expect, it } from 'vitest'
import { chatCommand } from './conversation-command'

describe('chatCommand', () => {
  it('gives Codex Kando\'s tools and hides the ChatGPT app\'s browser beside them', () => {
    const mcp = { command: 'node', args: ['mcp.mjs', '--home', '/k'] }
    const args = chatCommand('codex', null, false, null, [], { mcp }).args
    expect(args.slice(0, 5)).toEqual(['app-server', '-c', 'mcp_servers.kando.command="node"', '-c', 'mcp_servers.kando.args=["mcp.mjs","--home","/k"]'])
    expect(args).toEqual(expect.arrayContaining(['-c', 'mcp_servers.cua_repl={command="/usr/bin/true",enabled=false}']))
    // Without Kando's tools there is nothing to choose between, and nothing is hidden.
    expect(chatCommand('codex', null, false, null, []).args).toEqual(['app-server'])
  })

  it('starts Claude with what the conversation chose, and bypass only when allowed now', () => {
    const args = chatCommand('claude', 'session-1', true, null, [], { preferred: { permissionMode: 'plan', model: 'sonnet', effort: 'high' } }).args
    expect(args).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--model', 'sonnet', '--effort', 'high', '--resume', 'session-1']))
    expect(args).not.toContain('--allow-dangerously-skip-permissions')
    expect(chatCommand('claude', 's', false, null, [], { preferred: { permissionMode: 'bypass' } }).args).not.toContain('--permission-mode')
    const allowed = chatCommand('claude', 's', false, null, [], { preferred: { permissionMode: 'bypass' }, allowBypass: true }).args
    expect(allowed).toEqual(expect.arrayContaining(['--allow-dangerously-skip-permissions', '--permission-mode', 'bypassPermissions']))
    // Asking is passed as manual, so a default mode in Claude Code's settings cannot override it.
    expect(chatCommand('claude', 's', false, null, [], { preferred: { permissionMode: 'ask' } }).args).toEqual(expect.arrayContaining(['--permission-mode', 'manual']))
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--permission-mode')
  })

  it('lets Claude show a file, read its own terminals and the user\'s history without asking', () => {
    const args = chatCommand('claude', 's', false, null, [], { mcp: { command: 'node', args: ['mcp.mjs'] } }).args
    const allowed = args[args.indexOf('--allowedTools') + 1]?.split(',') ?? []
    expect(allowed).toEqual(expect.arrayContaining(['mcp__kando__show_preview', 'mcp__kando__terminal_read', 'mcp__kando__history_list', 'mcp__kando__history_read']))
    expect(allowed).not.toContain('mcp__kando__terminal_run')
  })

  it('gives Cursor each extra project as a workspace root before its ACP server', () => {
    expect(chatCommand('cursor', null, false, null, ['/code/web', '/code/api']).args).toEqual(['--add-dir', '/code/web', '--add-dir', '/code/api', 'acp'])
    expect(chatCommand('cursor', null, false, null).args).toEqual(['acp'])
  })

  it('lets Claude drive the user\'s Chrome as the setting says, either way, and leaves Codex as it is', () => {
    expect(chatCommand('claude', 's', false, null, [], { userBrowser: true }).args).toContain('--chrome')
    expect(chatCommand('claude', 's', false, null, [], { userBrowser: false }).args).toContain('--no-chrome')
    // Unset (a catalog probe) leaves Claude Code's own default.
    expect(chatCommand('claude', 's', false, null, []).args.filter((arg) => arg.endsWith('chrome'))).toEqual([])
    expect(chatCommand('codex', null, false, null, [], { userBrowser: true }).args).toEqual(['app-server'])
  })

  it('gives each agent the user\'s vault as its own folder, writable where the stage may write, and says where it is', () => {
    const vault = { path: '/notes/vault', write: true }
    const claude = chatCommand('claude', 's', false, null, ['/code/web'], { knowledgeBase: vault }).args
    expect(claude).toEqual(expect.arrayContaining(['--add-dir', '/code/web', '--add-dir', '/notes/vault', '--append-system-prompt', expect.stringContaining('/notes/vault')]))
    expect(claude).not.toContain('--allowedTools')
    // Where it may not write, the vault is readable without asking, and not a working folder.
    const fenced = chatCommand('claude', 's', false, null, [], { planOnly: { dirs: ['/code/app'] }, knowledgeBase: { ...vault, write: false } }).args
    expect(fenced).not.toContain('--add-dir')
    expect(fenced[fenced.indexOf('--allowedTools') + 1]).toContain('Read(//notes/vault/**)')
    expect(fenced).toEqual(expect.arrayContaining(['--append-system-prompt', expect.stringContaining('/notes/vault')]))
    // Codex hears of it in its config; the root itself goes with each turn.
    expect(chatCommand('codex', null, false, null, [], { knowledgeBase: vault }).args).toEqual(['app-server', '-c', expect.stringMatching(/^developer_instructions=".*\/notes\/vault.*"$/)])
    expect(chatCommand('cursor', null, false, null, ['/code/web'], { knowledgeBase: vault }).args).toEqual(['--add-dir', '/code/web', '--add-dir', '/notes/vault', 'acp'])
    expect(chatCommand('cursor', null, false, null, [], { knowledgeBase: { ...vault, write: false } }).args).toEqual(['acp'])
    // Without one, nothing changes.
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--append-system-prompt')
  })

  it('hands Kando\'s skills to the agents that load a folder of them, each its own way', () => {
    const skills = { dir: '/kando/skills/bundles/abc' }
    expect(chatCommand('claude', 's', false, null, [], { skills }).args).toEqual(expect.arrayContaining(['--plugin-dir', '/kando/skills/bundles/abc']))
    expect(chatCommand('claude', 's', false, null, [], { skills }).args).not.toContain('--add-dir')
    expect(chatCommand('cursor', null, false, null, ['/code/web'], { skills }).args).toEqual(['--add-dir', '/code/web', '--add-dir', '/kando/skills/bundles/abc', 'acp'])
    expect(chatCommand('codex', null, false, null, [], { skills }).args).toEqual(['app-server'])
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--plugin-dir')
  })

  it.each(['markdown', 'obsidian'] as const)('passes %s instructions to Claude and Codex without changing folder access', (kind) => {
    const base = { path: '/notes', write: true, kind }
    const format = kind === 'markdown' ? '普通 Markdown' : 'Obsidian Markdown'
    const claude = chatCommand('claude', null, false, null, [], { knowledgeBase: base }).args
    expect(claude).toEqual(expect.arrayContaining(['--add-dir', '/notes', '--append-system-prompt', expect.stringContaining(format)]))
    const codex = chatCommand('codex', null, false, null, [], { knowledgeBase: base }).args
    expect(codex).toEqual(['app-server', '-c', expect.stringContaining(format)])
  })

  it('starts a Claude stage that may only plan in plan mode, its folders not editable and no bypass', () => {
    const args = chatCommand('claude', 's', false, null, ['/code/web'], {
      preferred: { permissionMode: 'acceptEdits' },
      allowBypass: true,
      planOnly: { dirs: ['/code/app', '/code/web'] },
      readable: ['/kando/attachments/a.png']
    }).args
    expect(args).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--disallowedTools', 'Edit(//code/app/**),Edit(//code/web/**)']))
    expect(args).not.toContain('--allow-dangerously-skip-permissions')
    // One list of what it may read: its images and git history.
    expect(args.filter((arg) => arg === '--allowedTools')).toHaveLength(1)
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read(//kando/attachments/a.png),Bash(git log:*),Bash(git diff:*),Bash(git show:*)')
  })
})
