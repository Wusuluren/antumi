import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

it('moves what was kept under the old names, without overwriting a newer value', async () => {
  const stored = new Map<string, string>([['kando.preferences', 'old'], ['kando.composer-drafts', 'stale'], ['antumi.composer-drafts', 'new'], ['other', 'x']])
  vi.stubGlobal('localStorage', {
    get length() { return stored.size },
    key: (index: number) => [...stored.keys()][index] ?? null,
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key)
  })
  vi.resetModules()
  await import('./storage-keys')
  expect(Object.fromEntries(stored)).toEqual({ 'antumi.preferences': 'old', 'antumi.composer-drafts': 'new', other: 'x' })
})
