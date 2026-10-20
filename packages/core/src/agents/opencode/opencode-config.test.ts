import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { opencodeConfig, OPENCODE_AUTO_AGENT, OPENCODE_BYPASS_AGENT, OPENCODE_READ_ONLY_AGENT } from './opencode-config'

const agents = (launch: Parameters<typeof opencodeConfig>[0]) => JSON.parse(opencodeConfig(launch)).agents

describe('OpenCode config Antumi adds', () => {
  it('adds a read-only agent that edits nothing and asks before running anything', () => {
    expect(agents({})[OPENCODE_READ_ONLY_AGENT]).toEqual(expect.objectContaining({ mode: 'primary', permissions: [
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'shell', resource: '*', effect: 'ask' },
      { action: 'external_directory', resource: '*', effect: 'ask' }
    ] }))
  })

  it('adds an automatic agent that works in the project and asks only to go outside it', () => {
    expect(agents({})[OPENCODE_AUTO_AGENT].permissions).toEqual([
      { action: 'edit', resource: '*', effect: 'allow' },
      { action: 'shell', resource: '*', effect: 'allow' },
      { action: 'external_directory', resource: '*', effect: 'ask' }
    ])
  })

  it('adds the allow-everything agent only where the stage may bypass', () => {
    expect(agents({})).not.toHaveProperty(OPENCODE_BYPASS_AGENT)
    expect(agents({ allowBypass: true })[OPENCODE_BYPASS_AGENT].permissions).toEqual([{ action: '*', resource: '*', effect: 'allow' }])
    expect(agents({ allowBypass: true, planOnly: { dirs: ['/work'] } })).not.toHaveProperty(OPENCODE_BYPASS_AGENT)
    expect(agents({ allowBypass: true, readOnly: { dirs: ['/work'] } })).not.toHaveProperty(OPENCODE_BYPASS_AGENT)
  })

  it('points it at the skills bundle in the Agent Skills layout', () => {
    expect(JSON.parse(opencodeConfig({ skills: { dir: '/antumi/skills/bundles/abc' } })).skills).toEqual([path.join('/antumi/skills/bundles/abc', '.agents', 'skills')])
  })
})
