import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { ChatItem } from '@antumi/protocol'
import type { ChatStageOptions } from '../../chat-driver'
import { AcpDriver } from './acp-driver'
import type { AcpDialect } from './acp-dialect'

// An agent that speaks plain ACP and adds nothing: what a new agent's dialect starts from.
const plain: AcpDialect = { name: 'Plain', idPrefix: 'plain', modes: { ask: 'default', plan: 'plan' } }
const OPTIONS: ChatStageOptions = { cwd: '/work', extraDirs: [], resume: null }
const Request = z.looseObject({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional(), params: z.unknown().optional(), error: z.looseObject({ code: z.number() }).optional() })
const modes = { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }] }

const receive = (driver: AcpDriver, frame: unknown, at = 2) => driver.apply({ dir: 'in', at, frame })
const due = (driver: AcpDriver) => {
  const frames = driver.due()
  frames.forEach((frame) => driver.apply({ dir: 'out', at: 1, frame }))
  return frames.map((frame) => Request.parse(frame))
}
const items = <K extends ChatItem['kind']>(driver: AcpDriver, kind: K) => driver.items.list().filter((item): item is Extract<ChatItem, { kind: K }> => item.kind === kind)

function opened(): AcpDriver {
  const driver = new AcpDriver(plain, 'stage', OPTIONS)
  due(driver)
  // Listing auth methods asks nothing of a dialect that names none: the CLI is signed in on its own.
  receive(driver, { id: 'plain-init', result: { protocolVersion: 1, authMethods: [{ id: 'oauth' }] } })
  due(driver)
  receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
  return driver
}

describe('ACP without a dialect of its own', () => {
  it('opens a session with nothing but the standard handshake', () => {
    const driver = new AcpDriver(plain, 'stage', OPTIONS)
    const [init] = due(driver)
    expect(init).toMatchObject({ id: 'plain-init', method: 'initialize', params: { clientCapabilities: { terminal: false } } })
    expect(JSON.stringify(init)).not.toContain('_meta')
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1, authMethods: [{ id: 'oauth' }] } })
    expect(due(driver).map((frame) => frame.method)).toEqual(['session/new'])
    receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
    expect(driver.ready()).toBe(true)
    expect(driver.failure()).toBeNull()
    expect(items(driver, 'state').at(-1)).toMatchObject({ permissionMode: 'ask', permissionModes: ['ask', 'plan'] })
  })

  it('runs a turn: streamed reply, a command named by its kind, an approval, the end', () => {
    const driver = opened()
    const message = driver.send('hello')
    driver.apply({ dir: 'out', at: 3, frame: message.logged })
    expect(Request.parse(message.wire)).toMatchObject({ id: 'plain-prompt-1', method: 'session/prompt' })
    expect(driver.turnSignal(message.logged, 'out')).toBe('prompt')

    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Running the tests.' } } } })
    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'tool_call', toolCallId: 'call', title: 'pnpm test', kind: 'execute', status: 'pending', rawInput: { command: 'pnpm test' } } } })
    receive(driver, { id: 7, method: 'session/request_permission', params: { sessionId: 'session', toolCall: { toolCallId: 'call', title: 'pnpm test', kind: 'execute' }, options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Reject', kind: 'reject_once' }] } })
    expect(driver.activity()).toBe('awaiting')
    const [approval] = items(driver, 'approval')
    expect(approval).toMatchObject({ tool: 'commandExecution', title: 'pnpm test' })
    const answer = driver.respond(approval!.requestId, { decision: 'allow', choice: 'yes' })
    expect(answer).toEqual([{ jsonrpc: '2.0', id: 7, result: { outcome: { outcome: 'selected', optionId: 'yes' } } }])
    answer.forEach((frame) => driver.apply({ dir: 'out', at: 4, frame }))

    receive(driver, { method: 'session/update', params: { sessionId: 'session', update: { sessionUpdate: 'tool_call_update', toolCallId: 'call', status: 'completed', rawOutput: { exitCode: 0 } } } })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn' } })
    expect(items(driver, 'tool')[0]).toMatchObject({ name: 'commandExecution', status: 'done', execution: { status: 'completed', exitCode: 0 } })
    expect(items(driver, 'turn')[0]).toMatchObject({ state: 'completed', error: null })
    expect(driver.takeMessages().map((each) => each.role)).toEqual(['user', 'assistant'])
  })

  it('tells the agent of the user\'s vault ahead of its first prompt only, and only on the wire', () => {
    const driver = new AcpDriver(plain, 'stage', { ...OPTIONS, knowledgeBase: { path: '/notes/vault', write: true } })
    due(driver)
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1, agentCapabilities: { sessionCapabilities: { additionalDirectories: true } } } })
    const [session] = due(driver)
    expect(session).toMatchObject({ method: 'session/new', params: { additionalDirectories: ['/notes/vault'] } })
    receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
    const first = driver.send('hello')
    expect(Request.parse(first.wire).params).toMatchObject({ prompt: [{ type: 'text', text: expect.stringMatching(/^用户的 Obsidian 知识库在 \/notes\/vault。[\s\S]*\n\nhello$/) }] })
    expect(Request.parse(first.logged).params).toEqual({ sessionId: 'session', prompt: [{ type: 'text', text: 'hello' }] })
    driver.apply({ dir: 'out', at: 3, frame: first.logged })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn' } })
    expect(Request.parse(driver.send('again').wire).params).toMatchObject({ prompt: [{ type: 'text', text: 'again' }] })
    // A vault it may not write is no folder of the session: it reads the vault by its path.
    const reading = new AcpDriver(plain, 'stage', { ...OPTIONS, knowledgeBase: { path: '/notes/vault', write: false } })
    due(reading)
    receive(reading, { id: 'plain-init', result: { protocolVersion: 1, agentCapabilities: { sessionCapabilities: { additionalDirectories: true } } } })
    expect(JSON.stringify(due(reading))).not.toContain('additionalDirectories')
  })

  it('refuses requests from extensions it never declared', () => {
    const driver = opened()
    const message = driver.send('hello')
    driver.apply({ dir: 'out', at: 3, frame: message.logged })
    receive(driver, { id: 8, method: 'cursor/ask_question', params: { toolCallId: 'q', questions: [{ id: 'a', prompt: 'Which?', options: [] }] } })
    expect(items(driver, 'question')).toEqual([])
    expect(due(driver)).toContainEqual(expect.objectContaining({ id: 8, error: expect.objectContaining({ code: -32601 }) }))
  })

  it('passes Markdown conventions only on the first wire prompt', () => {
    const driver = new AcpDriver(plain, 'stage', { ...OPTIONS, knowledgeBase: { path: '/notes/plain', write: true, kind: 'markdown' } })
    due(driver)
    receive(driver, { id: 'plain-init', result: { protocolVersion: 1 } })
    due(driver)
    receive(driver, { id: 'plain-session', result: { sessionId: 'session', modes } })
    const first = driver.send('hello')
    expect(JSON.stringify(first.wire)).toContain('普通 Markdown')
    expect(JSON.stringify(first.wire)).toContain('相对路径链接')
    expect(JSON.stringify(first.wire)).not.toContain('Obsidian')
    expect(JSON.stringify(first.logged)).not.toContain('知识库')
    driver.apply({ dir: 'out', at: 3, frame: first.logged })
    receive(driver, { id: 'plain-prompt-1', result: { stopReason: 'end_turn' } })
    expect(JSON.stringify(driver.send('again').wire)).not.toContain('知识库')
  })

  it('switches modes by the ids its dialect maps Antumi\'s to', () => {
    const driver = opened()
    expect(Request.parse(driver.setOption('permissionMode', 'plan')[0])).toMatchObject({ method: 'session/set_mode', params: { modeId: 'plan' } })
    expect(() => driver.setOption('permissionMode', 'readOnly')).toThrow()
  })
})
