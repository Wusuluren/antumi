import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import { DAEMON_PROTOCOL_VERSION } from './daemon-protocol'
import { legacyHome } from './paths'
import { writePrivateJson } from './private-file'

// Written into the moved home; core finishes the move from it (home-repair) and marks it repaired.
export const HOME_MIGRATION_FILE = 'migrated-from-kando.json'
export const HomeMigrationRecord = z.object({ from: z.string(), to: z.string(), at: z.number(), repaired: z.boolean() })
export type HomeMigrationRecord = z.infer<typeof HomeMigrationRecord>

export type HomeMigrationResult = 'moved' | 'deferred' | 'nothing'

const LOCK_WAIT_MS = 15_000

// Moves ~/.kando, the home from before the rename, to ~/.antumi. Daemon, core and the app each call
// it before they read the home, and whichever comes first moves it under a lock; the others wait.
// It moves only what nothing runs from: a daemon still answering or a core still alive keeps the
// old home in use (antumiHome finds it) until a later start. Never deletes anything.
export async function migrateHome(env: NodeJS.ProcessEnv = process.env, homedir: string = os.homedir()): Promise<HomeMigrationResult> {
  const from = legacyHome(env, homedir)
  if (!from) return 'nothing'
  const to = path.join(homedir, '.antumi')
  if (!existsSync(from) && !existsSync(`${to}.migrating`)) return 'nothing'
  const lock = `${to}.migrating`
  const held = await takeLock(lock)
  if (!held) {
    await waitForLock(lock)
    return existsSync(to) ? 'moved' : 'nothing'
  }
  try {
    if (existsSync(to) || !existsSync(from)) return 'nothing'
    if (await inUse(from)) return 'deferred'
    // The database first, inside the old home: a home caught between the two renames still opens.
    for (const suffix of ['', '-wal', '-shm']) {
      const old = path.join(from, `kando.db${suffix}`)
      if (existsSync(old)) await rename(old, path.join(from, `antumi.db${suffix}`))
    }
    await rename(from, to)
    await writePrivateJson(path.join(to, HOME_MIGRATION_FILE), { from, to, at: Date.now(), repaired: false } satisfies HomeMigrationRecord)
    console.log(`[antumi] moved ${from} to ${to}`)
    return 'moved'
  } finally {
    await rm(lock, { force: true })
  }
}

async function takeLock(lock: string): Promise<boolean> {
  await mkdir(path.dirname(lock), { recursive: true })
  try {
    await (await open(lock, 'wx')).close()
    return true
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
    // A lock left by a process that died mid-move would block every start after it.
    const age = Date.now() - (await stat(lock).then((info) => info.mtimeMs, () => Date.now()))
    if (age < LOCK_WAIT_MS * 2) return false
    await rm(lock, { force: true })
    return takeLock(lock)
  }
}

async function waitForLock(lock: string): Promise<void> {
  const until = Date.now() + LOCK_WAIT_MS
  while (Date.now() < until && existsSync(lock)) await sleep(100)
}

async function inUse(home: string): Promise<boolean> {
  if (await coreAlive(home)) return true
  const sockets = await daemonSockets(home)
  for (const socket of sockets) {
    if (await socketLive(socket)) return true
  }
  return false
}

async function coreAlive(home: string): Promise<boolean> {
  const text = await readFile(path.join(home, 'core.json'), 'utf8').catch(() => null)
  if (text === null) return false
  let pid: number
  try {
    // Only the pid: a core of any version wrote one.
    const parsed = z.looseObject({ pid: z.number().int() }).safeParse(JSON.parse(text))
    if (!parsed.success) return false
    pid = parsed.data.pid
  } catch {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: a process of another user holds the pid, which proves nothing either way.
    return errorCode(error) !== 'ESRCH'
  }
}

// Every daemon version kept its socket in the home, or in the temp dir under the old name when the
// home's path was too long.
async function daemonSockets(home: string): Promise<string[]> {
  const suffix = createHash('sha256').update(home).digest('hex').slice(0, 12)
  if (process.platform === 'win32') {
    return Array.from({ length: DAEMON_PROTOCOL_VERSION }, (_, index) => `\\\\.\\pipe\\kando-daemon-v${index + 1}-${suffix}`)
  }
  const inHome = (await readdir(home).catch(() => [])).filter((name) => /^daemon-v\d+\.sock$/.test(name)).map((name) => path.join(home, name))
  const inTemp = (await readdir(os.tmpdir()).catch(() => []))
    .filter((name) => name.startsWith('kando-daemon-v') && name.endsWith(`-${suffix}.sock`))
    .map((name) => path.join(os.tmpdir(), name))
  return [...inHome, ...inTemp]
}

// Only a refused or missing socket proves no daemon serves it; a timeout or EPERM proves nothing.
function socketLive(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const connection = net.connect(socket)
    connection.setTimeout(1000, () => { connection.destroy(); resolve(true) })
    connection.once('connect', () => { connection.destroy(); resolve(true) })
    connection.once('error', (error) => resolve(!['ECONNREFUSED', 'ENOENT'].includes(errorCode(error) ?? '')))
  })
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}
