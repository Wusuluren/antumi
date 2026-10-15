import { describe, expect, it } from 'vitest'
import { codeFontStack } from './code-font'

describe('codeFontStack', () => {
  it('sets code in the bundled font, with Chinese in the platform\'s own', () => {
    expect(codeFontStack('')).toBe('"Geist Mono Variable", Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace')
  })

  it('puts a picked family first, quoted, and keeps the bundled one behind it', () => {
    expect(codeFontStack('JetBrains Mono')).toBe('"JetBrains Mono", "Geist Mono Variable", Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace')
  })
})
