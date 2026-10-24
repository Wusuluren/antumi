import { afterEach, describe, expect, it } from 'vitest'
import type { Environment, EnvironmentCheck } from '@antumi/protocol'
import { guideStepDone } from './guide-steps'
import { setLocale } from './i18n'

afterEach(() => setLocale('zh-CN'))

const check = (tool: EnvironmentCheck['tool'], signedIn: boolean | null, status: EnvironmentCheck['status'] = 'ok'): EnvironmentCheck => ({ tool, status, version: '1.0.0', path: `/bin/${tool}`, signedIn })
const environment = (...checks: EnvironmentCheck[]): Environment => ({ checks, searchPath: [], checkedAt: 0 })
const situation = { environment: null, disabled: [], providers: [], locale: 'zh-CN' }

describe('guideStepDone', () => {
  it('counts the agent step done once an enabled agent says it is signed in', () => {
    expect(guideStepDone('agents', situation)).toBeNull()
    expect(guideStepDone('agents', { ...situation, environment: environment(check('claude', false), check('opencode', null)) })).toBeNull()
    expect(guideStepDone('agents', { ...situation, environment: environment(check('claude', true), check('codex', true)) })).toBe('Claude Code、Codex 已就绪')
    expect(guideStepDone('agents', { ...situation, environment: environment(check('claude', true)), disabled: ['claude'] })).toBeNull()
    expect(guideStepDone('agents', { ...situation, environment: environment(check('codex', true, 'unknown')) })).toBeNull()
  })

  it('counts the provider step done once a provider is added', () => {
    expect(guideStepDone('providers', situation)).toBeNull()
    expect(guideStepDone('providers', { ...situation, providers: [{ name: '火山方舟' }] })).toBe('已添加 火山方舟')
    setLocale('en')
    expect(guideStepDone('providers', { ...situation, locale: 'en', providers: [{ name: 'Ark' }, { name: 'Kimi' }] })).toBe('Ark and Kimi added')
  })
})
