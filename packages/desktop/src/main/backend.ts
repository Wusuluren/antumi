import { execFile, spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { AGENT_KINDS, agentDescriptor, type AgentKind, type CoreEndpoint } from '@antumi/protocol'
import { antumiPaths, daemonSchemas, readCoreEndpoint } from '@antumi/protocol/node'

// Where CLIs land that a Finder-launched app's minimal PATH misses.
const EXTRA_PATH_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')]
const START_WAIT_MS = 15_000
// Interactive rc files are slower than a bare login shell; the answer is worth the wait, and a
// shell that never answers falls back to the PATH the app was started with.
const SHELL_PATH_TIMEOUT_MS = 5_000
const PATH_MARKER = '__antumi_path__'

// The PATH between the last marker and the end of that line, whatever the shell's rc files
// printed before it; the fallback when it printed no marker at all.
export function pathFromShellOutput(stdout: string, fallback: string): string {
  const at = stdout.lastIndexOf(PATH_MARKER)
  return at === -1 ? fallback : (stdout.slice(at + PATH_MARKER.length).split('\n')[0] ?? '').trim()
}

// A GUI app inherits launchd's PATH, which has no homebrew or ~/.local: the agents and the
// user's shell live there, so ask the login shell once and pass the result down. Interactive as
// well as login, the way a terminal starts it: version managers and installers add their
// directories from rc files (~/.zshrc), which a login shell alone never reads.
function loginShellPath(): Promise<string> {
  if (process.platform === 'win32') {
    const parts = (process.env.PATH ?? '').split(';').filter(Boolean)
    const local = process.env.LOCALAPPDATA
    const installed = local ? AGENT_KINDS.flatMap((kind) => agentDescriptor(kind).windowsPathDirs ?? []).map((dir) => join(local, dir)) : []
    for (const dir of installed) {
      if (!parts.some((part) => part.toLowerCase() === dir.toLowerCase())) parts.push(dir)
    }
    return Promise.resolve(parts.join(';'))
  }
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    execFile(shell, ['-l', '-i', '-c', `printf '%s%s' '${PATH_MARKER}' "$PATH"`], { timeout: SHELL_PATH_TIMEOUT_MS }, (_error, stdout) => {
      const reported = pathFromShellOutput(stdout, '')
      const parts = (reported || process.env.PATH || '').split(':').filter(Boolean)
      for (const dir of EXTRA_PATH_DIRS) {
        if (!parts.includes(dir)) parts.push(dir)
      }
      resolve(parts.join(':'))
    })
  })
}

function reachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const settle = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(800, () => settle(false))
    socket.once('connect', () => settle(true))
    socket.once('error', () => settle(false))
  })
}

// The core serving this home, if one answers on its port.
async function runningCore(): Promise<CoreEndpoint | null> {
  const endpoint = await readCoreEndpoint()
  return endpoint !== null && (await reachable(endpoint.port)) ? endpoint : null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const DaemonReply = z.object({ id: z.unknown(), result: z.record(z.string(), z.unknown()).optional() })

function parsedLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

// One request to the daemon over its socket, as core speaks to it: a JSON line out, the line
// with the same id back. Null when no daemon answers, or this one does not know the method.
function daemonCall(method: 'info' | 'retire'): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const socket = net.connect(antumiPaths().daemonSocket)
    let buffered = ''
    const settle = (value: Record<string, unknown> | null) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(2000, () => settle(null))
    socket.once('error', () => settle(null))
    socket.once('connect', () => socket.write(`${JSON.stringify({ id: 1, method, params: {} })}\n`))
    socket.on('data', (chunk) => {
      buffered += chunk.toString('utf8')
      for (const line of buffered.split('\n').slice(0, -1)) {
        // Daemon events share the socket; only the reply to this request settles it.
        const reply = DaemonReply.safeParse(parsedLine(line))
        if (reply.success && reply.data.id === 1) settle(reply.data.result ?? null)
      }
      buffered = buffered.slice(buffered.lastIndexOf('\n') + 1)
    })
  })
}

function daemonReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(antumiPaths().daemonSocket)
    socket.setTimeout(800, () => { socket.destroy(); resolve(false) })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

// A daemon from another build is replaced only when it runs nothing (an agent, a terminal shell):
// it decides that itself, so nothing starts between asking and leaving. One that still runs
// something stays, and is asked again at the next launch; one from before info and retire stays
// until it ends (a restart of the computer). True when it left.
async function retireOldDaemon(): Promise<boolean> {
  const info = await daemonCall('info')
  if (!info || info.version === app.getVersion()) return false
  const answer = await daemonCall('retire')
  if (answer?.retired !== true) {
    console.log(`[antumi] daemon ${String(info.version)} still runs ${String(answer?.live ?? '?')} sessions; keeping it until they end`)
    return false
  }
  console.log(`[antumi] daemon ${String(info.version)} is older than this app (${app.getVersion()}); replacing it`)
  const until = Date.now() + 10_000
  while (Date.now() < until && (await daemonReachable())) await sleep(200)
  return true
}

// Asks core to leave, and waits for it to: it closes its server and removes its endpoint file on
// SIGTERM. Sessions live in the daemon, so the agents it served run on. True once its process is gone.
async function retireCore(endpoint: CoreEndpoint): Promise<boolean> {
  return terminate(endpoint.pid)
}

// SIGTERM, then waiting: a core leaves cleanly on it, and one already gone counts as gone.
export async function terminate(pid: number, ms = 10_000): Promise<boolean> {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return !alive(pid)
  }
  return exited(pid, ms)
}

// Whether a process still exists: only ESRCH says it does not (EPERM is one of someone else's).
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
  }
}

async function exited(pid: number, ms = 10_000): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until && alive(pid)) await sleep(200)
  return !alive(pid)
}

// Whether a daemon serves the socket. Only a refused connection or no socket at all proves none
// does; a timeout or any other error proves nothing.
function daemonPresence(): Promise<'there' | 'gone' | 'unknown'> {
  return new Promise((resolve) => {
    const socket = net.connect(antumiPaths().daemonSocket)
    const settle = (presence: 'there' | 'gone' | 'unknown') => {
      socket.destroy()
      resolve(presence)
    }
    socket.setTimeout(2000, () => settle('unknown'))
    socket.once('connect', () => settle('there'))
    socket.once('error', (error) => settle('code' in error && (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') ? 'gone' : 'unknown'))
  })
}

export type InstallBlocker = { sessionId: string; agent?: AgentKind }
// stopped false: blockers are the sessions the daemon still runs, or null when daemon or core
// could not be shown to have stopped (no answer, or still there after the wait).
export type BackendStop = { stopped: true } | { stopped: false; blockers: InstallBlocker[] | null }

// Leaves daemon and core stopped: before an installer replaces the app's files (Windows will not
// overwrite what runs from them, and the NSIS installer ends every Antumi.exe it finds), or as the
// app quits. The daemon leaves only if it runs nothing (it decides, as for retireOldDaemon), then
// core goes; the sessions still running come back instead. Nothing counts as stopped until its
// process is seen gone.
export async function stopBackend(): Promise<BackendStop> {
  const presence = await daemonPresence()
  if (presence === 'unknown') return { stopped: false, blockers: null }
  if (presence === 'there') {
    const info = await daemonCall('info')
    const answer = daemonSchemas.retire.result.safeParse(await daemonCall('retire'))
    if (!answer.success) return { stopped: false, blockers: null }
    if (!answer.data.retired) return { stopped: false, blockers: answer.data.blockers ?? [] }
    const pid = typeof info?.pid === 'number' ? info.pid : null
    const gone = pid === null ? await daemonGone() : await exited(pid)
    if (!gone) return { stopped: false, blockers: null }
  }
  const core = await runningCore()
  if (core && !(await retireCore(core))) return { stopped: false, blockers: null }
  return { stopped: true }
}

async function daemonGone(): Promise<boolean> {
  const until = Date.now() + 10_000
  while (Date.now() < until) {
    if ((await daemonPresence()) === 'gone') return true
    await sleep(200)
  }
  return false
}

// Quitting the app leaves nothing behind: the daemon and core end, so the next launch starts this
// build's instead of talking to whatever an earlier launch left serving the home. The daemon leaves
// only once nothing runs in it, and names the sessions that still do. A build run from source
// leaves both to the user.
export async function stopBackendOnQuit(): Promise<BackendStop> {
  if (!app.isPackaged) return { stopped: true }
  return stopBackend()
}

// Ends daemon and core whatever they run: on SIGTERM the daemon takes its agents and shells with it.
// Only after the user has agreed to lose what runs there.
export async function forceStopBackend(): Promise<void> {
  const info = await daemonCall('info')
  const daemonPid = typeof info?.pid === 'number' ? info.pid : null
  const core = await runningCore()
  if (daemonPid !== null) await terminate(daemonPid, 5_000)
  if (core) await terminate(core.pid, 5_000)
}

// Starts daemon and core from the app's bundled copies when none serve this home yet, or when
// the ones that do are of another build: an app updated in place would otherwise keep talking to
// what it found, and lack whatever the update put there. The daemon only goes when it runs nothing.
// Both are detached with their own logs: closing the window never touches them, and quitting ends
// them (stopBackendOnQuit). A daemon already serving the socket makes the spawned one exit by
// itself (endpoint-claim), so starting one is safe to over-ask.
export async function ensureBackend(): Promise<void> {
  if (!app.isPackaged) return
  const daemonReplaced = await retireOldDaemon()
  const running = await runningCore()
  const coreCurrent = running?.version === app.getVersion()
  if (coreCurrent && !daemonReplaced) return
  if (running && !coreCurrent) {
    console.log(`[antumi] core ${running.version ?? '(unversioned)'} is older than this app (${app.getVersion()}); replacing it`)
    await retireCore(running)
  }
  const paths = antumiPaths()
  const logs = join(paths.home, 'logs')
  mkdirSync(logs, { recursive: true, mode: 0o700 })
  const backend = join(process.resourcesPath, 'backend')
  const env = {
    // Without Windows' own Path, which a PATH beside it would leave the children to pick between.
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')),
    PATH: await loginShellPath(),
    // The Electron binary doubles as the Node that runs them; each strips or scopes the flag
    // before anything of the user's inherits it.
    ELECTRON_RUN_AS_NODE: '1',
    ANTUMI_MCP_JS: join(backend, 'mcp.mjs')
  }
  const launch = (name: 'daemon' | 'core') => {
    const log = openSync(join(logs, `${name}.log`), 'a')
    spawn(process.execPath, [join(backend, `${name}.mjs`)], {
      env,
      detached: true,
      // Detached on Windows means a console of its own, which would stay open on screen.
      windowsHide: true,
      stdio: ['ignore', log, log]
    }).unref()
  }
  launch('daemon')
  // A core of this build stays: it reconnects to the new daemon by itself.
  if (!coreCurrent) launch('core')
  // The renderer retries on its own; waiting here only surfaces a start that never lands.
  const until = Date.now() + START_WAIT_MS
  while (Date.now() < until) {
    if (await runningCore()) return
    await sleep(300)
  }
  console.error(`[antumi] core did not come up; see ${join(logs, 'core.log')}`)
}
