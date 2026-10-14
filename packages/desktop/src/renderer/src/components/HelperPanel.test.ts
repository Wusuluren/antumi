import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateCreator } from 'zustand'
import { createRpcClient, Task, type Conversation, type RpcConnection } from '@kando/protocol'
import { useCore } from '../core-store'
import { HandToHelperItem } from './ChatContextMenu'
import { ConversationInspector } from './ConversationInspector'
import { TaskInspector } from './TaskInspector'
import { ConversationView } from './ConversationView'
import { TaskToolbar } from './TaskActions'
import { HelperPanel } from './HelperPanel'

vi.hoisted(() => {
  vi.stubGlobal('window', { kando: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

vi.mock('zustand', async (importOriginal) => {
  const zustand = await importOriginal<typeof import('zustand')>()
  return { ...zustand, create: <T>() => (initializer: StateCreator<T>) => {
    const store = zustand.create(initializer)
    return Object.assign((selector: (state: T) => unknown) => selector(store.getState()), store)
  } }
})
const parent: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Main', titleLocked: false, agent: 'claude',
  workspacePath: '/w', projectPaths: [], managedWorkspace: true, sessionId: null, createdAt: 0, updatedAt: 0
}
const helper: Conversation = { ...parent, id: '22222222-2222-4222-8222-222222222222', helperOf: parent.id, title: '小助手', chat: { turn: 'awaiting' } }
const task = Task.parse({ id: 'task', title: 'Task', details: '', repos: [], dependsOn: [], conversationId: parent.id, status: 'running', agent: 'claude', createdAt: 0, updatedAt: 0 })
function connect(features = ['conversation-helper']) {
  const client = createRpcClient(() => {})
  const rpc: RpcConnection = { ...client, features, close() {}, closed: new Promise(() => {}) }
  useCore.setState({ rpc, conversations: { [parent.id]: parent }, tasks: { [task.id]: task } })
}
const renderMenu = (selection: string, conversation: Conversation = parent) => renderToStaticMarkup(createElement(HandToHelperItem, { parent: conversation, selection, inspector: 'conversation', onClose: () => {} }))

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  connect()
})

describe('helper UI', () => {
  it('offers the selection action for free and task chats, and only with a supported eligible selection', () => {
    expect(renderMenu('selected')).toContain('交给小助手')
    expect(renderMenu('selected', { ...parent, taskId: 'task' })).toContain('交给小助手')
    expect(renderMenu(' ')).toBe('')
    for (const patch of [{ helperOf: parent.id }, { discussionId: parent.id }, { squadRunId: parent.id }, { routineId: parent.id }, { archivedAt: 1 }]) {
      expect(renderMenu('selected', { ...parent, ...patch })).toBe('')
    }
    connect([])
    expect(renderMenu('selected')).toBe('')
  })

  it('always offers the tab in both inspectors and marks it when the helper awaits approval', () => {
    useCore.setState({ conversations: { [parent.id]: parent, [helper.id]: helper } })
    const conversationHtml = renderToStaticMarkup(createElement(ConversationInspector, { conversation: parent, widthRatio: 0.35, onWidthRatioChange: () => {} }))
    const taskHtml = renderToStaticMarkup(createElement(TaskInspector, { task, widthRatio: 0.35, onWidthRatioChange: () => {} }))
    for (const html of [conversationHtml, taskHtml]) {
      expect(html).toContain('小助手')
      expect(html).toContain('aria-label="小助手等你处理"')
    }
  })

  it('marks both inspector buttons while keeping a no-project parent inspectable', () => {
    useCore.setState({ conversations: { [parent.id]: parent, [helper.id]: helper } })
    const conversationHtml = renderToStaticMarkup(createElement(ConversationView, { id: parent.id }))
    const taskHtml = renderToStaticMarkup(createElement(TaskToolbar, { task, view: 'chat' }))
    for (const html of [conversationHtml, taskHtml]) {
      expect(html).toContain('aria-label="检查器"')
      expect(html).toContain('aria-label="小助手等你处理"')
    }
  })

  it('renders an input without creating an agent for the empty helper', () => {
    const html = renderToStaticMarkup(createElement(HelperPanel, { parent }))
    expect(html).toContain('不占主会话的上下文')
    expect(html).toContain('placeholder="交给小助手…"')
    expect(html).toContain('正在读取模型')
  })

  it('removes the entry and tab on older cores', () => {
    connect([])
    const html = renderToStaticMarkup(createElement(ConversationInspector, { conversation: parent, widthRatio: 0.35, onWidthRatioChange: () => {} }))
    expect(html).not.toContain('小助手')
  })
})
