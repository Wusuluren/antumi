import { spawn } from 'node:child_process'
import readline from 'node:readline'
import { antumiPaths, planLaunch } from '@antumi/protocol/node'
import { CredentialStore } from './credential-store'
import { McpHttpSession } from './mcp-http'
import { McpServerStore, type ResolvedMcpServer } from './mcp-servers'

// What an agent starts in place of one of the user's MCP servers (mcp-main --run): it reads the
// server and its secrets from Antumi's files, so neither the agent's configuration, its command line
// nor Antumi's logs ever hold them. A command is started with its env added and the agent's stdio
// handed straight to it; an address is reached over HTTP, this process carrying the messages.
export async function runUserMcp(home: string, name: string): Promise<void> {
  const paths = antumiPaths(home)
  const credentials = new CredentialStore(paths.credentials)
  await credentials.load()
  const store = new McpServerStore(paths.mcpServers, credentials)
  await store.load()
  const server = store.resolve(name)
  if (!server) throw new Error(`Antumi 里没有名为 ${name} 的 MCP 服务器`)
  if (server.transport.type === 'stdio') await runCommand(server.transport)
  else await bridge(server.transport)
}

function runCommand(transport: Extract<ResolvedMcpServer['transport'], { type: 'stdio' }>): Promise<void> {
  // Set where this launcher runs as Antumi's bundled Node; the user's own server is not that.
  const { ELECTRON_RUN_AS_NODE: _ours, ...env } = process.env
  const cwd = transport.cwd ?? process.cwd()
  const launch = planLaunch(transport.command, transport.args, cwd, { ...env, ...transport.env })
  const child = spawn(launch.file, launch.args, { cwd, env: launch.env, stdio: 'inherit', windowsHide: true })
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => child.kill(signal))
  return new Promise((resolve, reject) => {
    child.on('error', (error) => reject(new Error(`启动不了 ${transport.command}：${error.message}`)))
    child.on('exit', (code, signal) => {
      process.exitCode = code ?? (signal ? 1 : 0)
      resolve()
    })
  })
}

// The agent's side is newline-delimited JSON-RPC on stdio, as for any command; each message goes
// out as a request of its own, so a slow tool call holds up nothing else.
async function bridge(transport: Extract<ResolvedMcpServer['transport'], { type: 'http' }>): Promise<void> {
  const session = new McpHttpSession(transport.url, transport.headers)
  const write = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`)
  const inFlight = new Set<Promise<void>>()
  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    if (!line.trim()) continue
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      console.error('antumi mcp: 收到的不是 JSON-RPC 消息，已忽略')
      continue
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) continue
    const sent = session.send(Object.fromEntries(Object.entries(message)), write).catch((error: unknown) => {
      console.error(`antumi mcp: ${error instanceof Error ? error.message : String(error)}`)
    })
    inFlight.add(sent)
    void sent.finally(() => inFlight.delete(sent))
  }
  await Promise.all(inFlight)
  await session.close()
}
