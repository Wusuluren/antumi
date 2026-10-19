import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { EMPTY_FILE_TABS, openedFile, useFileTabs } from '../file-tabs'
import { FileEditor } from './FileEditor'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})
// Rendered on the server a store reads its initial state; these read what the test set.
vi.mock('zustand', async (original) => {
  const actual = await original<typeof import('zustand')>()
  return { ...actual, create: <T>() => (initializer: StateCreator<T>) => {
    const store = actual.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})

const render = (tree: boolean) => {
  useFileTabs.setState({ chat: { ...EMPTY_FILE_TABS, tree } })
  return renderToStaticMarkup(createElement(FileEditor, { conversationId: 'chat', roots: ['/work/app'], updatedAt: 0, onEmpty: () => {}, inspector: 'conversation', editor: true }))
}

beforeEach(() => useFileTabs.setState({}, true))

describe('file editor', () => {
  it('offers edit and preview in the file location bar for Markdown files only', () => {
    for (const name of ['README.md', 'notes.MD', 'guide.markdown', 'app.ts']) {
      useFileTabs.setState({ chat: openedFile(EMPTY_FILE_TABS, { path: `/work/app/${name}`, root: '/work/app', relative: name, kind: 'file' }, null) })
      const html = renderToStaticMarkup(createElement(FileEditor, { conversationId: 'chat', roots: ['/work/app'], updatedAt: 0, onEmpty: () => {}, inspector: 'conversation', editor: true }))
      expect(html.includes('Markdown 显示方式')).toBe(name !== 'app.ts')
      if (name !== 'app.ts') expect(html).toContain('aria-checked="false">预览</button>')
    }
  })

  it('folds the tree away and keeps the button that opens it again, with no file open', () => {
    const folded = render(false)
    expect(folded).toContain('aria-label="打开文件树"')
    expect(folded).toContain('aria-pressed="false"')
    expect(folded).toContain('打开文件树选择文件。')
    expect(folded).not.toContain('file-editor-tree')
    expect(render(true)).toContain('aria-label="收起文件树"')
  })
})
