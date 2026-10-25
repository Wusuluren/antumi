import { describe, expect, it } from 'vitest'
import { agentSetupIdentity, type AgentKind, type EnvironmentCheck, type SourceDescriptor } from '@antumi/protocol'
import { configuredSources, initialSetupStatus, preferredSetupAgent, SetupProgress, setupStep, type SetupSituation } from './setup-progress'

const check = (tool: AgentKind, signedIn: boolean | null, status: EnvironmentCheck['status'] = 'ok'): EnvironmentCheck => ({ tool, status, signedIn, version: '1.0.0', path: `/bin/${tool}` })
const situation = (...checks: EnvironmentCheck[]): SetupSituation => ({ environment: { checks, checkedAt: 0, searchPath: [] }, disabled: [], providers: [], sources: [] })
const active = SetupProgress.parse({ status: 'active' })
const source: SourceDescriptor = { provider: 'jira', name: 'Jira', settings: [{ key: 'site', type: 'url', label: 'Site', required: true }], instances: [{ instance: 'default', enabled: false, settings: { site: 'https://example.com' }, credential: { configured: true, source: 'store', account: 'user' } }] }

describe('first-run setup', () => {
  it('does not auto-guide existing users, and preserves a saved checkpoint on reload', () => {
    expect(initialSetupStatus(false, false)).toBe('active')
    expect(initialSetupStatus(true, false)).toBe('dismissed')
    expect(initialSetupStatus(false, true)).toBe('dismissed')
    const saved = { ...active, status: 'paused', agent: 'codex', sourceChoice: 'configure' }
    expect(SetupProgress.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
    expect(SetupProgress.parse(undefined).status).toBe('new')
  })

  it('waits for both environment and source facts before proposing configuration', () => {
    expect(setupStep(active, { ...situation(), environment: null })).toBe('waiting')
    expect(setupStep(active, { ...situation(check('codex', true)), sources: null })).toBe('waiting')
  })

  it('prefers ready then installed agents without changing an explicit choice', () => {
    const s = situation(check('claude', false), check('codex', true))
    expect(preferredSetupAgent(s)).toBe('codex')
    expect(setupStep(active, s)).toBe('sources')
    expect(setupStep({ ...active, agent: 'claude' }, s)).toBe('agent')
    expect(preferredSetupAgent(situation(check('claude', null, 'missing'), check('opencode', null)))).toBe('opencode')
  })

  it('requires only one prepared agent and a configured or skipped source, never a conversation', () => {
    const s = situation(check('codex', true), check('claude', false))
    expect(setupStep({ ...active, sourceChoice: 'skip' }, s)).toBe('done')
    expect(setupStep(active, { ...s, sources: [source] })).toBe('done')
  })

  it('accepts an explicit native confirmation, without letting it override later sign-out or launch failure', () => {
    const s = situation(check('opencode', null))
    expect(setupStep(active, s)).toBe('agent')
    const confirmed = { ...active, agent: 'opencode' as const, confirmed: agentSetupIdentity('opencode', s.environment) }
    expect(setupStep(confirmed, s)).toBe('sources')
    expect(s.environment?.checks[0]?.signedIn).toBeNull()
    expect(setupStep(confirmed, situation(check('opencode', false)))).toBe('agent')
    expect(setupStep(confirmed, situation(check('opencode', null, 'unknown')))).toBe('agent')
    expect(setupStep(confirmed, { ...s, disabled: ['opencode'] })).toBe('agent')
    expect(setupStep(confirmed, { ...s, environment: { checks: [{ ...check('opencode', null), version: '2.0.0' }], checkedAt: 0, searchPath: [] } })).toBe('agent')
  })

  it('lets a first-use authorization agent proceed only after acknowledging that authorization is deferred', () => {
    const s = situation(check('antigravity', false))
    expect(setupStep(active, s)).toBe('agent')
    expect(setupStep({ ...active, confirmed: agentSetupIdentity('antigravity', s.environment) }, s)).toBe('sources')
  })

  it('does not count an installed plugin, partial settings, or a failed login as a configured source', () => {
    expect(configuredSources([{ ...source, instances: [] }])).toEqual([])
    const instance = source.instances[0]!
    expect(configuredSources([{ ...source, instances: [{ ...instance, credential: { configured: false, source: null, account: null } }] }])).toEqual([])
    expect(configuredSources([{ ...source, instances: [{ ...instance, settings: { site: ' ' } }] }])).toEqual([])
    expect(configuredSources([source])).toEqual([source])
  })

  it('returns to the broken agent before completion, even after skipping sources', () => {
    expect(setupStep({ ...active, agent: 'codex', sourceChoice: 'skip' }, situation(check('codex', false)))).toBe('agent')
  })
})
