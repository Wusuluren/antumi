import { describe, expect, it } from 'vitest'
import { defaultStartMode, modeLabel, startModes } from './components/ChatOptionsBar'

const model = (autoMode?: boolean) => ({ id: 'opus', label: 'Opus', description: null, efforts: [], isDefault: true, ...(autoMode === undefined ? {} : { autoMode }) })

describe('startModes', () => {
  it('shows Cursor native modes, without auto or bypass', () => {
    const modes = startModes('cursor', model(true))
    expect(modes).toEqual(['ask', 'plan', 'readOnly'])
    expect(modes.map((mode) => modeLabel('cursor', mode))).toEqual(['Agent', 'Plan', 'Ask'])
    expect(defaultStartMode('cursor', modes)).toBe('ask')
  })
  it('offers auto where the model takes it, and bypass where the agent has it', () => {
    expect(startModes('claude', model(true))).toEqual(['ask', 'acceptEdits', 'plan', 'auto', 'bypass'])
    expect(startModes('claude', model())).toEqual(['ask', 'acceptEdits', 'plan', 'bypass'])
    expect(startModes('claude', undefined)).toEqual(['ask', 'acceptEdits', 'plan', 'bypass'])
    expect(startModes('codex', model())).toEqual(['acceptEdits', 'ask', 'plan', 'readOnly', 'bypass'])
    expect(startModes('codex', model(true))).toEqual(['acceptEdits', 'ask', 'plan', 'readOnly', 'bypass'])
  })

  it('defaults each agent independently and falls back when Claude auto is unavailable', () => {
    expect(defaultStartMode('claude', startModes('claude', model(true)))).toBe('auto')
    expect(defaultStartMode('claude', startModes('claude', model()))).toBe('ask')
    expect(defaultStartMode('codex', startModes('codex', model()))).toBe('acceptEdits')
  })
})
