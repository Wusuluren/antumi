import { spawn } from 'node:child_process'
import os from 'node:os'
import readline from 'node:readline'
import type { McpProbe } from '@kando/protocol'
import { McpHttpSession } from './mcp-http'
import type { ResolvedMcpServer } from './mcp-servers'

const PROTOCOL_VERSION = '2025-06-18'
// npx and uvx fetch a package on first use, which can take most of a minute.
const TIMEOUT_MS = 60_000
const STDERR_LIMIT = 2000
const MAX_PAGES = 20

type Message = Record<string, unknown>
type Exchange = (message: Message) => Promise<Message | null>

// Connects to a server as an agent would, lists its tools and leaves: what the user sees before
// handing it to agents. Never throws: what went wrong is the result.
export async function probeMcpServer(server: ResolvedMcpServer, now: () => number = Date.now, timeoutMs = TIMEOUT_MS): Promise<McpProbe> {
  const connection = server.transport.type === 'stdio' ? openCommand(server.transport) : openHttp(server.transport)
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${Math.round(timeoutMs / 1000)} 秒内没有回应`)), timeoutMs).unref())
  try {
    const tools = await Promise.race([listTools(connection.exchange, connection.notify), timer])
    return { ok: true, tools, error: null, stderr: connection.stderr(), at: now() }
  } catch (error) {
    return { ok: false, tools: [], error: error instanceof Error ? error.message : String(error), stderr: connection.stderr(), at: now() }
  } finally {
    await connection.close()
  }
}

async function listTools(exchange: Exchange, notify: (message: Message) => Promise<void>): Promise<McpProbe['tools']> {
  const init = await exchange({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'kando', version: '1' } } })
  failed(init, '初始化')
  await notify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  const tools: McpProbe['tools'] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const reply = await exchange({ jsonrpc: '2.0', id: 2 + page, method: 'tools/list', params: cursor ? { cursor } : {} })
    failed(reply, '列出工具')
    const result = reply?.result
    const listed = result && typeof result === 'object' && 'tools' in result && Array.isArray(result.tools) ? result.tools : []
    for (const tool of listed) {
      if (tool && typeof tool === 'object' && 'name' in tool && typeof tool.name === 'string') {
        tools.push({ name: tool.name, description: 'description' in tool && typeof tool.description === 'string' ? tool.description.slice(0, 500) : '' })
      }
    }
    const next = result && typeof result === 'object' && 'nextCursor' in result && typeof result.nextCursor === 'string' ? result.nextCursor : undefined
    if (!next) break
    cursor = next
  }
  return tools
}

function failed(reply: Message | null, step: string): void {
  if (!reply) throw new Error(`${step}时连接断了`)
  const error = reply.error
  if (error && typeof error === 'object') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : JSON.stringify(error)
    throw new Error(`${step}失败：${message}`)
  }
}

type Connection = { exchange: Exchange; notify: (message: Message) => Promise<void>; stderr: () => string | null; close: () => Promise<void> }

function openCommand(transport: Extract<ResolvedMcpServer['transport'], { type: 'stdio' }>): Connection {
  // Its own process group, so what npx started goes with it.
  const child = spawn(transport.command, transport.args, { cwd: transport.cwd ?? os.homedir(), env: { ...process.env, ...transport.env }, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-STDERR_LIMIT) })
  const waiting = new Map<unknown, (message: Message | null) => void>()
  let ended: Error | null = null
  const end = (error: Error) => {
    ended ??= error
    for (const resolve of waiting.values()) resolve(null)
    waiting.clear()
  }
  child.on('error', (error) => end(new Error(`启动不了 ${transport.command}：${error.message}`)))
  child.on('exit', (code) => end(new Error(`进程退出了（${code ?? '信号'}）`)))
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let message: unknown
    try { message = JSON.parse(line) } catch { return }
    if (!message || typeof message !== 'object' || !('id' in message)) return
    waiting.get(message.id)?.(Object.fromEntries(Object.entries(message)))
    waiting.delete(message.id)
  })
  const write = (message: Message) => new Promise<void>((resolve) => {
    if (!child.stdin.writable) return resolve()
    child.stdin.write(`${JSON.stringify(message)}\n`, () => resolve())
  })
  return {
    exchange: async (message) => {
      if (ended) throw ended
      const reply = new Promise<Message | null>((resolve) => waiting.set(message.id, resolve))
      await write(message)
      const answered = await reply
      if (!answered && ended) throw ended
      return answered
    },
    notify: write,
    stderr: () => stderr.trim() || null,
    close: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      try {
        if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
        else child.kill()
      } catch {
        child.kill()
      }
    }
  }
}

function openHttp(transport: Extract<ResolvedMcpServer['transport'], { type: 'http' }>): Connection {
  const session = new McpHttpSession(transport.url, transport.headers)
  return {
    exchange: async (message) => {
      let reply: Message | null = null
      // A refused request is answered with an error as well as thrown: the answer says which step.
      const sent = session.send(message, (received) => { if (received.id === message.id) reply = received })
      await sent.catch((error: unknown) => { if (!reply) throw error })
      return reply
    },
    notify: (message) => session.send(message, () => {}),
    stderr: () => null,
    close: () => session.close()
  }
}
