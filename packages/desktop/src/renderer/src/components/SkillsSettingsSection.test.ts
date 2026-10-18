import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import type { RecommendedSkillRepo, SkillRepo } from '@antumi/protocol'
import { useCore } from '../core-store'
import { notInstalled, SkillsSettingsSection } from './SkillsSettingsSection'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

// Read the live store instead of Zustand's fixed SSR hydration snapshot.
vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const commit = 'a'.repeat(40)
const repo = (url: string): SkillRepo => ({ id: url.split('/').pop() ?? url, url, commit, previousCommit: null, installedAt: 0, updatedAt: 0, plugin: null, skills: [] })
const recommended = (url: string): RecommendedSkillRepo => ({ url, name: url, description: '', license: 'MIT', homepage: url, skills: [] })

beforeEach(() => {
  useCore.setState({ ...useCore.getInitialState(), connection: 'connected', skillRepos: [] }, true)
})

describe('SkillsSettingsSection', () => {
  it('puts installed skills and installing another repository in cards of their own', () => {
    useCore.setState({ skillRepos: [repo('https://github.com/kepano/obsidian-skills')] })
    const html = renderToStaticMarkup(createElement(SkillsSettingsSection))
    expect(html.match(/class="settings-card"/g)).toHaveLength(2)
    expect(html).toContain('已安装 · 1')
    expect(html).toContain('从其他仓库安装')
  })

  it('says where to start when nothing is installed', () => {
    const html = renderToStaticMarkup(createElement(SkillsSettingsSection))
    expect(html).toContain('>已安装<')
    expect(html).toContain('还没有安装技能')
  })

  it('recommends only what is not installed, by address with or without .git', () => {
    const list = [recommended('https://github.com/a/one'), recommended('https://github.com/a/two'), recommended('https://github.com/a/three')]
    expect(notInstalled(list, [repo('https://github.com/a/one'), repo('https://github.com/a/two.git')]).map((each) => each.url)).toEqual(['https://github.com/a/three'])
  })
})
