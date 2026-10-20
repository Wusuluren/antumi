import { parseArgs } from 'node:util'
import { RpcError } from '@antumi/protocol'
import { serveMcp } from './mcp-server'
import { antumiHome, writePrivateJson } from '@antumi/protocol/node'
import { runUserMcp } from './user-mcp-launch'

// Antumi's MCP server, a process of its own that an agent starts over stdio: core configures it
// for every chat (see mcpCommand), and it reaches core over RPC like any other client.
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    home: { type: 'string' },
    conversation: { type: 'string' },
    'plan-only': { type: 'boolean' },
    history: { type: 'boolean' },
    'no-todos': { type: 'boolean' },
    'ready-file': { type: 'string' },
    // One of the user's MCP servers, started in its place (see runUserMcp).
    run: { type: 'string' }
  }
})

// Speaks MCP on stdout, so nothing else may print there.
const readyFile = values['ready-file']
const served = values.run
  ? runUserMcp(values.home ?? antumiHome(), values.run)
  : serveMcp(values.home, values.conversation, values['plan-only'], readyFile ? () => writePrivateJson(readyFile, { ready: true }) : undefined, values.history, !values['no-todos'])
served.catch((error: unknown) => {
  const reason = error instanceof RpcError && error.reason ? ` (${error.reason})` : ''
  console.error(`antumi mcp: ${error instanceof Error ? error.message : String(error)}${reason}`)
  process.exitCode = 1
})
