import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createRpcClient, rpcSchemas, type RpcConnection } from '@antumi/protocol'
import { createMcpHandler } from './mcp-server'
import { todoToolsOverCore } from './mcp-todo-tools'
import { TaskStore } from './task-store'
import { TodoStore } from './todo-store'

const Frame = z.object({ id: z.number(), method: z.string(), params: z.unknown() })

describe('to-do MCP tools', () => {
  let root: string
  let tasks: TaskStore
  let todos: TodoStore
  let rpc: RpcConnection

  // A core that answers the to-do methods from a store of its own.
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-mcp-todos-'))
    const file = path.join(root, 'kando.db')
    tasks = new TaskStore(file)
    todos = new TodoStore(file)
    const answer = (method: string, raw: unknown): unknown => {
      if (method === 'todos.list') return todos.list(rpcSchemas['todos.list'].params.parse(raw).id)
      if (method === 'todos.add') {
        const { id, ...group } = rpcSchemas['todos.add'].params.parse(raw)
        return todos.add(id, group)
      }
      const { id, groupId, itemId, done } = rpcSchemas['todos.check'].params.parse(raw)
      return todos.check(id, groupId, itemId, done)
    }
    const client = createRpcClient((text) => {
      const frame = Frame.parse(JSON.parse(text))
      queueMicrotask(() => {
        try {
          client.receive(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: answer(frame.method, frame.params) }))
        } catch (error) {
          client.receive(JSON.stringify({ jsonrpc: '2.0', id: frame.id, error: { code: -32000, message: String(error) } }))
        }
      })
    })
    rpc = { ...client, features: ['conversation-todos'], close: () => {}, closed: new Promise(() => {}) }
  })

  afterEach(() => {
    todos.close()
    tasks.close()
    rmSync(root, { recursive: true, force: true })
  })

  const conversationId = '00000000-0000-4000-8000-000000000001'
  const text = (result: { content: Array<{ text: string }> }) => result.content.map((part) => part.text).join('')

  it('lets the agent write a group down, read it back with ids, and tick it off', async () => {
    const withCore = async <T>(action: (connection: RpcConnection) => Promise<T>) => action(rpc)
    const tools = todoToolsOverCore(withCore, conversationId)
    const handler = createMcpHandler({ preview: async () => {}, planOnly: true, todo: tools })
    const listed = JSON.stringify(await handler(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })))
    expect(listed).toContain('todo_add')
    expect(listed).toContain('todo_check')

    const tool = (name: string) => tools.find((each) => each.spec.name === name)!
    const added = await tool('todo_add').run({ title: '真机验证', note: '上线前', items: ['加载已解压', { text: '重载后自动恢复', owner: 'agent' }] })
    expect(added.isError).toBe(false)
    expect(text(added)).toContain('已记成待办')
    const [group] = todos.list(conversationId)
    expect(group).toMatchObject({ title: '真机验证', note: '上线前', items: [{ text: '加载已解压', owner: 'user' }, { text: '重载后自动恢复', owner: 'agent' }] })

    expect(text(await tool('todo_list').run({}))).toContain(`组 id ${group!.id}`)
    const checked = await tool('todo_check').run({ group: group!.id, item: group!.items[0]!.id })
    expect(text(checked)).toContain('1 项未完成')
    expect((await tool('todo_add').run({ title: '', items: [] })).isError).toBe(true)
    expect((await tool('todo_check').run({ group: 'nope' })).isError).toBe(true)
  })
})
