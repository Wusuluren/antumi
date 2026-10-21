import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { describeBrowserPage, describeClosedTab, type ChatItem, type ChatToolStatus } from '@antumi/protocol'
import { ChatBrowserWindow } from './ChatBrowserWindow'

vi.mock('../core-store', () => ({ showBrowserTab: vi.fn() }))

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
const tabId = '10dbacd0-d598-495a-997a-498a87d1e70e'
const otherId = '20dbacd0-d598-495a-997a-498a87d1e70e'
const click: ToolItem = { kind: 'tool', id: 'click', stageId: 'stage', revision: 1, at: 0,
  name: 'mcp__claude_in_chrome__computer', title: 'Click', input: '{"action":"left_click"}',
  output: null, status: 'running', diffs: [] }
const page = (id: string, tab: string, title: string): ToolItem => ({ kind: 'tool', id, stageId: 'stage', revision: 1, at: 0,
  name: 'antumi.browser_navigate', title: 'http://localhost/', input: null, status: 'done', diffs: [],
  output: describeBrowserPage({ id: tab, title, url: `http://localhost/${id}` }, 'snapshot') })
const close = (id: string, tab: string): ToolItem => ({ ...page(id, tab, ''), name: 'antumi.browser_tabs', output: describeClosedTab(tab) })
const render = (tools: ToolItem[]) => renderToStaticMarkup(createElement(ChatBrowserWindow, { tools }))

describe('the browser window', () => {
  it('follows the running action, and offers no way to open a browser that is not Antumi\'s', () => {
    const html = render([click])
    expect(html).toContain('data-action="click"')
    expect(html).toContain('正在操作页面…')
    expect(html).not.toContain('正在输入')
    expect(html).not.toContain('chat-browser-tab')
    expect(html).not.toContain('chat-browser-open')
  })

  it.each([
    ['done', '已完成'], ['failed', '失败'], ['denied', '已拒绝'], ['interrupted', '已中断']
  ] as const)('keeps a %s result distinct from active browser work', (status: ChatToolStatus, text) => {
    const html = render([{ ...click, status }])
    expect(html).toContain(`data-status="${status}"`)
    expect(html).toContain(text)
    expect(html).not.toContain('正在操作页面…')
  })

  it('shows the tabs the run left open, the last acted on current, with a way to open it', () => {
    const html = render([page('one', tabId, 'First'), page('two', otherId, 'Second'), page('three', tabId, 'First again')])
    expect(html.match(/class="chat-browser-tab"/g)).toHaveLength(2)
    expect(html).toMatch(/data-active="true"[^>]*><i[^>]*><\/i><span>First again/)
    expect(html).toContain('localhost/three')
    expect(html).toContain('chat-browser-open')
    expect(html).not.toContain('示意')
  })

  it('drops a closed tab, and says so once none is left', () => {
    const tools = [page('one', tabId, 'First'), page('two', otherId, 'Second'), close('x', otherId)]
    const html = render(tools)
    expect(html.match(/class="chat-browser-tab"/g)).toHaveLength(1)
    expect(html).not.toContain('Second')
    const gone = render([...tools, close('y', tabId)])
    expect(gone).toContain('打开过 2 个标签页，都已关闭')
    expect(gone).not.toContain('chat-browser-open')
  })
})
