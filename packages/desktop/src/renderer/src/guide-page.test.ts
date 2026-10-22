import { describe, expect, it } from 'vitest'
import { guideFor, guideImage, guidePage } from './guide-page'

describe('guidePage', () => {
  it("takes the guide's heading for the page's title and leaves the rest as its body", () => {
    expect(guidePage('# Welcome\n\nFirst steps.\n')).toEqual({ title: 'Welcome', body: 'First steps.\n' })
    expect(guidePage('First steps.\n')).toEqual({ title: '新手指导', body: 'First steps.\n' })
  })

  it('finds a heading in both bundled guides', () => {
    expect(guideFor('zh-CN').title).toBe('欢迎使用 Antumi')
    expect(guideFor('en').title).toBe('Welcome to Antumi')
  })

  it('bundles every screenshot the guides show', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const sources = [...guideFor(locale).body.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1] ?? '')
      expect(sources.length).toBeGreaterThan(0)
      for (const src of sources) expect(guideImage(src), src).toBeTruthy()
    }
  })
})
