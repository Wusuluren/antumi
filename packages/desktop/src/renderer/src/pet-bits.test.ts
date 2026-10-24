import { describe, expect, it } from 'vitest'
import { petBits } from './pet-bits'
import { freshMemory, pickBit, remember, type Context } from './pet-brain'

const context = (over: Partial<Context> = {}): Context => ({
  now: 100_000, level: 'medium', mood: 'idle', reduced: false, typingUntil: 0, idleFor: 5_000,
  pointer: null, pointerDistance: null, urge: null, message: null, on: 'floor', random: () => .5, ...over
})

describe('peek behavior', () => {
  it('stays out of quiet mode, typing, working, attention and reduced motion', () => {
    const peek = petBits().find((bit) => bit.id === 'peek')
    if (!peek) throw new Error('missing peek behavior')
    expect(peek.score(context())).toBeGreaterThan(0)
    for (const over of [{ typingUntil: 100_001 }, { reduced: true }, { mood: 'running' }, { mood: 'waiting' }, { idleFor: 1000 }] as const) {
      expect(peek.score(context(over))).toBe(0)
    }
    expect(pickBit([peek], context({ level: 'quiet' }), freshMemory())).toBeNull()
  })

  it('does not repeat immediately after withdrawing', () => {
    const peek = petBits().find((bit) => bit.id === 'peek')
    if (!peek) throw new Error('missing peek behavior')
    expect(pickBit([peek], context(), remember(freshMemory(), 'peek', 90_000))).toBeNull()
    expect(pickBit([peek], context(), remember(freshMemory(), 'peek', 1000))?.id).toBe('peek')
  })
})
