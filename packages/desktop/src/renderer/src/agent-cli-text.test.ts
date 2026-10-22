import { afterEach, describe, expect, it } from 'vitest'
import { initialAgentCliStatus } from '@antumi/protocol'
import { cliErrorText, cliStatusText } from './agent-cli-text'
import { setLocale } from './i18n'

afterEach(() => setLocale('zh-CN'))
describe('CLI maintenance copy', () => {
  it('distinguishes unknown latest, app-managed, native-managed, unchanged, and verified success', () => {
    const initial = initialAgentCliStatus('codex')
    const states = [
      initial,
      { ...initial, channel: 'desktop' as const, availability: 'managed' as const },
      { ...initial, channel: 'native' as const, availability: 'managed' as const },
      { ...initial, phase: 'unchanged' as const },
      { ...initial, phase: 'succeeded' as const }
    ]
    for (const locale of ['zh-CN', 'en'] as const) {
      setLocale(locale)
      expect(new Set(states.map(cliStatusText)).size).toBe(states.length)
      expect(cliStatusText(initial)).not.toBe(cliStatusText({ ...initial, availability: 'current' }))
      expect(cliErrorText('agent-cli-active')).not.toBe(cliErrorText('agent-cli-network'))
    }
  })
})
