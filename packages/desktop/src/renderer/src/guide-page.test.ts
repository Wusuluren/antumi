import { describe, expect, it } from 'vitest'
import { guideFor, guideImage, guidePage, guideSections, guideSettingsSection } from './guide-page'

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

  it('splits the body at its headings and names the steps it can tell are done', () => {
    expect(guideSections('Intro.\n\n## One\n\n<!-- guide-step: agents -->\n\nDo it.\n\n## Two\n\nMore.\n')).toEqual([
      { heading: null, step: null, body: 'Intro.\n\n' },
      { heading: 'One', step: 'agents', body: 'Do it.\n\n' },
      { heading: 'Two', step: null, body: 'More.\n' }
    ])
    for (const locale of ['zh-CN', 'en'] as const) {
      expect(guideSections(guideFor(locale).body).flatMap((section) => section.step ?? [])).toEqual(['agents', 'providers'])
    }
  })

  it('links each setup step to its place in Settings, and only to sections that exist', () => {
    expect(guideSettingsSection('antumi:settings/model-providers')).toBe('model-providers')
    expect(guideSettingsSection('https://example.com')).toBeNull()
    for (const locale of ['zh-CN', 'en'] as const) {
      const sections = [...guideFor(locale).body.matchAll(/\]\((antumi:[^)]+)\)/g)].map((match) => guideSettingsSection(match[1] ?? ''))
      expect(sections).toEqual(['agents', 'model-providers', 'accounts', 'plugins'])
    }
  })
})
