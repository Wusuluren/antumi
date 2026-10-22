import { describe, expect, it } from 'vitest'
import type { AgentLaunch } from '../agent-adapter'
import { piCommand, piStartMode } from './pi-command'
import { PI_CONFIG_ENV } from './pi-extension'

const LAUNCH: AgentLaunch = { providerSessionId: null, resume: false, handoffPath: null, extraProjects: [] }
const config = (launch: AgentLaunch) => JSON.parse(piCommand(launch).env?.[PI_CONFIG_ENV] ?? '{}')

describe('Pi command', () => {
  it('runs Pi in RPC mode, resuming its session file or forking it whole', () => {
    expect(piCommand(LAUNCH).args).toEqual(['--mode', 'rpc'])
    expect(piCommand({ ...LAUNCH, providerSessionId: '/s/a.jsonl', resume: true }).args).toEqual(['--mode', 'rpc', '--session', '/s/a.jsonl'])
    expect(piCommand({ ...LAUNCH, providerSessionId: '/s/a.jsonl', resume: true, forkAt: 'whole-session' }).args).toEqual(['--mode', 'rpc', '--fork', '/s/a.jsonl'])
    expect(piCommand({ ...LAUNCH, providerSessionId: '/s/a.jsonl' }).args).toEqual(['--mode', 'rpc'])
  })

  it('gives it the skills bundle and tells it of the other projects and the read-only folders', () => {
    expect(config({ ...LAUNCH, extraProjects: ['/work/other'], knowledgeBase: { path: '/vault', write: true } }).workDirs).toEqual(['/work/other', '/vault'])
    const args = piCommand({ ...LAUNCH, extraProjects: ['/work/other'], readOnly: { dirs: ['/work/repo'] }, skills: { dir: '/antumi/skills/b' } }).args
    expect(args).toContain('/antumi/skills/b/.agents/skills')
    const note = args[args.indexOf('--append-system-prompt') + 1]
    expect(note).toContain('- /work/other')
    expect(note).toMatch(/只读[\s\S]*- \/work\/repo/)
  })

  it('hands the extension its servers, fences and mode, with no secret in sight', () => {
    const launch: AgentLaunch = {
      ...LAUNCH,
      mcp: { command: 'node', args: ['mcp.mjs', '--ready-file', '/r.json'] },
      userMcp: [{ name: 'github', type: 'stdio', command: 'antumi', args: ['mcp', '--run', 'github'] }, { name: 'docs', type: 'http', url: 'https://docs.example/mcp' }],
      planOnly: { dirs: ['/work/repo'] },
      knowledgeBase: { path: '/vault', write: false }
    }
    expect(config(launch)).toMatchObject({
      mode: 'plan',
      servers: { antumi: { command: 'node', args: ['mcp.mjs', '--ready-file', '/r.json'] }, github: { command: 'antumi', args: ['mcp', '--run', 'github'] }, docs: { url: 'https://docs.example/mcp' } },
      noEdit: ['/work/repo', '/vault']
    })
    expect(config(launch).readTools).toContain('mcp__antumi__show_preview')
    expect(config(launch).readTools).not.toContain('mcp__antumi__terminal_run')
  })

  it('starts in the mode remembered, bypass only where allowed, a fenced stage in its own', () => {
    expect(piStartMode({ preferred: { permissionMode: 'readOnly' } })).toBe('readOnly')
    expect(piStartMode({ preferred: { permissionMode: 'bypass' } })).toBe('ask')
    expect(piStartMode({ preferred: { permissionMode: 'bypass' }, allowBypass: true })).toBe('bypass')
    expect(piStartMode({ preferred: { permissionMode: 'acceptEdits' } })).toBe('acceptEdits')
    expect(piStartMode({ preferred: { permissionMode: 'auto' } })).toBe('ask')
    expect(piStartMode({ preferred: { permissionMode: 'ask' }, planOnly: true })).toBe('plan')
  })
})
