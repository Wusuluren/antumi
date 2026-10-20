import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { opencodeConfig, OPENCODE_READ_ONLY_AGENT } from './opencode-config'

describe('OpenCode config Antumi adds', () => {
  it('adds a read-only agent that edits nothing and asks before running anything', () => {
    const config = JSON.parse(opencodeConfig({}))
    expect(config).toEqual({ agents: { [OPENCODE_READ_ONLY_AGENT]: expect.objectContaining({ mode: 'primary' }) } })
    expect(config.agents[OPENCODE_READ_ONLY_AGENT].permissions).toEqual([
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'shell', resource: '*', effect: 'ask' },
      { action: 'external_directory', resource: '*', effect: 'ask' }
    ])
  })

  it('points it at the skills bundle in the Agent Skills layout', () => {
    expect(JSON.parse(opencodeConfig({ skills: { dir: '/antumi/skills/bundles/abc' } })).skills).toEqual([path.join('/antumi/skills/bundles/abc', '.agents', 'skills')])
  })
})
