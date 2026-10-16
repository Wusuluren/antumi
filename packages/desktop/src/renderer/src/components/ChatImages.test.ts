import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ChatImageStrip } from './ChatImages'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

const images = [{ id: `${'a'.repeat(64)}.png`, width: 1600, height: 400 }]

describe('image thumbnails', () => {
  it('sets every image in a composer in the same square, and keeps a sent one in its own shape', () => {
    const composer = renderToStaticMarkup(createElement(ChatImageStrip, { images, onRemove: () => {} }))
    expect(composer).toContain('data-square=""')
    expect(composer).not.toContain('aspect-ratio')
    const sent = renderToStaticMarkup(createElement(ChatImageStrip, { images }))
    expect(sent).not.toContain('data-square')
    expect(sent).toContain('aspect-ratio:1600 / 400')
  })
})
