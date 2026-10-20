import { describe, expect, it } from 'vitest'
import { applicationMenu } from './application-menu'

describe('application menu', () => {
  it('switches authored labels while preserving actions on macOS and Windows', () => {
    for (const platform of ['darwin', 'win32']) {
      const zh = applicationMenu('zh-CN', platform)
      const en = applicationMenu('en', platform)
      expect(en.map((item) => item.label)).toContain('Edit')
      expect(zh.map((item) => item.label)).toContain('编辑')
      const actions = (locale: 'zh-CN' | 'en') => JSON.stringify(applicationMenu(locale, platform), (key, value: unknown) => key === 'label' ? undefined : value)
      expect(actions('en')).toBe(actions('zh-CN'))
    }
    expect(applicationMenu('en', 'darwin')[0]?.label).toBe('Antumi')
    expect(applicationMenu('en', 'win32')[0]?.label).toBe('File')
  })
})
