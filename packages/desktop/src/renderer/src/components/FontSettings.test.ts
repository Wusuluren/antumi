import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Resettable } from './SettingsControls'

describe('Resettable', () => {
  const render = (changed: boolean) => renderToStaticMarkup(createElement(Resettable, { changed, label: '终端字号', onReset: () => {}, children: createElement('output', null, '13 px') }))

  it('offers the way back only once the value is off its default, keeping its room', () => {
    expect(render(false)).toMatch(/<button[^>]*hidden=""/)
    expect(render(true)).not.toMatch(/<button[^>]*hidden=""/)
    expect(render(true)).toContain('aria-label="终端字号恢复默认"')
  })
})
