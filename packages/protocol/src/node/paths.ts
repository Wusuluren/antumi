import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { DAEMON_PROTOCOL_VERSION } from './daemon-protocol'

export function antumiHome(env: NodeJS.ProcessEnv = process.env, homedir: string = os.homedir()): string {
  return env.ANTUMI_HOME ? path.resolve(env.ANTUMI_HOME) : path.join(homedir, '.antumi')
}

// sun_path is 104 bytes on macOS and 108 on Linux; leave headroom.
const MAX_SOCKET_PATH_BYTES = 100

export type AntumiPaths = {
  home: string
  database: string
  coreEndpoint: string
  worktrees: string
  daemonSocket: string
  // Task source instances and their settings; no secrets.
  sourcesConfig: string
  // Credential records for task sources; owner-only.
  credentials: string
  // Machine-level behavior owned by core, not by a particular desktop window.
  awakeConfig: string
  // How chats run: whether agents suggest the user's next message.
  chatSettings: string
  // Where the first Jira integration kept its settings and token; migrated on start.
  legacyJiraConfig: string
  // Images, by content hash; owner-only.
  attachments: string
  sessions: string
  // The hosted browser: where the desktop app says its host listens (owner-only), for core to
  // connect to. Earlier versions kept a Chromium download and profile here too.
  browser: string
  browserHostFile: string
  // Agent Skills Antumi installed: their repositories, the lock that pins them, and the bundles
  // built from them for agents.
  skills: string
  // The user's MCP servers; their secrets are in credentials.
  mcpServers: string
  // Which projects' setup and check commands the user allowed, by a hash of them.
  projectTrust: string
}

export function antumiPaths(home: string = antumiHome()): AntumiPaths {
  return {
    home,
    database: path.join(home, 'antumi.db'),
    coreEndpoint: path.join(home, 'core.json'),
    worktrees: path.join(home, 'worktrees'),
    daemonSocket: daemonSocketPath(home),
    sourcesConfig: path.join(home, 'sources.json'),
    credentials: path.join(home, 'credentials.json'),
    awakeConfig: path.join(home, 'awake.json'),
    chatSettings: path.join(home, 'chat-settings.json'),
    legacyJiraConfig: path.join(home, 'jira.json'),
    attachments: path.join(home, 'attachments'),
    sessions: path.join(home, 'sessions'),
    browser: path.join(home, 'browser'),
    browserHostFile: path.join(home, 'browser', 'host.json'),
    skills: path.join(home, 'skills'),
    mcpServers: path.join(home, 'mcp-servers.json'),
    projectTrust: path.join(home, 'project-trust.json')
  }
}

// Versioned name lets an old daemon keep serving its PTYs while a new one starts.
function daemonSocketPath(home: string): string {
  const name = `daemon-v${DAEMON_PROTOCOL_VERSION}`
  const suffix = createHash('sha256').update(home).digest('hex').slice(0, 12)
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\antumi-${name}-${suffix}`
  }
  const inHome = path.join(home, `${name}.sock`)
  return Buffer.byteLength(inHome) <= MAX_SOCKET_PATH_BYTES
    ? inHome
    : path.join(os.tmpdir(), `antumi-${name}-${suffix}.sock`)
}
