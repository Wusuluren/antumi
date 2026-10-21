import { describe, expect, it } from 'vitest'
import { describeBrowserPage, describeClosedTab, type ChatItem } from '@antumi/protocol'
import { browserRunTabs } from './chat-browser'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
const tabId = '10dbacd0-d598-495a-997a-498a87d1e70e'
const otherId = '20dbacd0-d598-495a-997a-498a87d1e70e'
const page = (url: string, id = tabId) => ({ id, title: url, url })
const call = (id: string, url: string, changes: Partial<ToolItem> = {}): ToolItem => ({
  id, stageId: 'stage', revision: 1, at: 0, kind: 'tool', name: 'antumi.browser_navigate',
  title: url, input: null, output: describeBrowserPage(page(url), 'snapshot'), status: 'done', diffs: [], ...changes
})
const close = (id: string, tab: string): ToolItem => call(id, '', { name: 'antumi.browser_tabs', output: describeClosedTab(tab) })

describe('browserRunTabs', () => {
  it('keeps a tab at its latest successful page, even across different URLs and refreshes', () => {
    const tools = [call('a', 'http://localhost/preview?model=auto'), call('b', 'http://localhost/preview?model=sonnet'),
      call('c', 'http://localhost/other'), call('d', 'http://localhost/other')]
    expect(browserRunTabs(tools)).toEqual({ open: [page('http://localhost/other')], current: page('http://localhost/other'), closed: 0 })
  })

  it('uses snapshots and interactions to update a page reached without an explicit navigation', () => {
    const tools = [call('a', 'http://localhost/', { name: 'antumi.browser_tabs' }),
      call('b', 'http://localhost/next', { name: 'mcp__antumi__browser_click' }),
      call('c', 'http://localhost/final', { name: 'antumi.browser_snapshot' })]
    expect(browserRunTabs(tools).open).toEqual([page('http://localhost/final')])
  })

  it('keeps tabs apart even when their URLs match, in the order they came up, the last acted on current', () => {
    const other = page('http://localhost/', otherId)
    const tools = [call('a', other.url), call('b', other.url, { output: describeBrowserPage(other, null) }), call('c', other.url)]
    expect(browserRunTabs(tools)).toMatchObject({ open: [{ id: tabId }, { id: otherId }], current: { id: tabId } })
  })

  it('drops the tabs the run closed, and counts them', () => {
    const tools = [call('a', 'http://localhost/'), call('b', 'http://localhost/', { output: describeBrowserPage(page('http://localhost/', otherId), null) })]
    expect(browserRunTabs([...tools, close('c', otherId)])).toEqual({ open: [page('http://localhost/')], current: page('http://localhost/'), closed: 1 })
    expect(browserRunTabs([...tools, close('c', otherId), close('d', tabId)])).toEqual({ open: [], current: null, closed: 2 })
  })

  it.each(['running', 'failed', 'denied', 'interrupted'] as const)('does not replace a successful page with a %s result', (status) => {
    const good = call('good', 'http://localhost/')
    expect(browserRunTabs([good, call('bad', 'http://localhost/bad', { status })]).open).toEqual([page('http://localhost/')])
  })

  it('does not invent pages from refusals, missing outputs or unrelated tool results', () => {
    expect(browserRunTabs([
      call('gate', '', { output: '等待用户确认' }), call('empty', '', { output: null }),
      call('cmd', 'http://localhost/', { name: 'Bash' })
    ])).toEqual({ open: [], current: null, closed: 0 })
  })
})
