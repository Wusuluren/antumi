import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChatItem, ChatToolStatus } from '@kando/protocol'
import { ChatBrowserActivity } from './ChatBrowserActivity'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
const tool: ToolItem = { kind: 'tool', id: 'click', stageId: 'stage', revision: 1, at: 0,
  name: 'mcp__claude_in_chrome__computer', title: 'Click', input: '{"action":"left_click"}',
  output: null, status: 'running', diffs: [] }
const render = (status: ChatToolStatus) => renderToStaticMarkup(createElement(ChatBrowserActivity, { tool, status }))

describe('browser activity', () => {
  it('labels the window as a schematic and exposes only the real action as status text', () => {
    const html = render('running')
    expect(html).toContain('data-action="click"')
    expect(html).toContain('示意')
    expect(html).toContain('正在操作页面…')
    expect(html).not.toContain('正在输入')
  })

  it.each([
    ['done', '已完成'], ['failed', '失败'], ['denied', '已拒绝'], ['interrupted', '已中断']
  ] as const)('keeps a %s result distinct from active browser work', (status, text) => {
    const html = render(status)
    expect(html).toContain(`data-status="${status}"`)
    expect(html).toContain(text)
    expect(html).not.toContain('正在操作页面…')
  })
})
