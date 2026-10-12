import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ChatItem } from '@kando/protocol'
import { ChatSubagents } from './ChatSubagents'

vi.mock('../chat-disclosure', () => ({ useChosen: () => [null, () => {}] }))
vi.mock('./ChatMarkdown', () => ({ ChatMarkdown: () => null }))

type ToolItem = Extract<ChatItem, { kind: 'tool' }>

const subagent = (metrics: ToolItem['metrics'], id = 'tool:task', status: ToolItem['status'] = 'done'): ToolItem => ({
  id, stageId: 'stage', revision: 1, at: 0, kind: 'tool', name: 'Task', title: 'Settings UI',
  input: '{"prompt":"Read the settings code"}', status, output: null, diffs: [], metrics
})
const render = (metrics: ToolItem['metrics']) => renderToStaticMarkup(createElement(ChatSubagents, { tools: [subagent(metrics)] }))

describe('subagent card', () => {
  it('shows the time when the agent reports nothing else about the subagent', () => {
    expect(render({ tools: 0, tokens: 0, durationMs: 584_426 })).toContain('用了 10 分钟')
  })
  it('keeps the time out of sight when the subagent reported its tools and tokens', () => {
    const html = render({ tools: 12, tokens: 0, durationMs: 584_426 })
    expect(html).toContain('12 工具')
    expect(html).not.toContain('用了 10 分钟')
  })
})

describe('subagent fan', () => {
  const fan = (tools: ToolItem[]) => renderToStaticMarkup(createElement(ChatSubagents, { tools }))
  const count = (html: string, needle: string) => html.split(needle).length - 1

  it('draws a wire and a card for each subagent sent off together', () => {
    const html = fan([subagent(null, 'a'), subagent(null, 'b', 'running'), subagent(null, 'c', 'failed')])
    expect(count(html, '<path d="M0,50')).toBe(3)
    expect(count(html, 'class="chat-subagent-card"')).toBe(3)
    expect(html).toContain('派出 3 个 · 1 个进行中')
    expect(html).toContain('1 个没有完成')
  })
  it('fans out to a lone subagent too', () => {
    const html = fan([subagent(null)])
    expect(html).toContain('主 Agent')
    expect(count(html, '<path d="M0,50')).toBe(1)
  })
})
