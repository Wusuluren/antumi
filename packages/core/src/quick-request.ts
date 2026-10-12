import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { agentDescriptor, quickModel, type AgentKind, type ChatCatalog } from '@kando/protocol'
import type { QuickCommand } from './agents/agent-adapter'
import { adapterOf } from './agents'
import { Rejection } from './rejection'

const TIMEOUT_MS = 120_000
// Opening an old conversation with translation on asks for many at once; a few run, the rest wait.
const AT_ONCE = 2

export type QuickDeps = {
  catalog(agent: AgentKind): Promise<ChatCatalog | null>
  // Runs a one-off command to its end: what it printed, or why it failed.
  run?(command: QuickCommand, cwd: string): Promise<string>
}

// Small jobs for an agent, such as translating a reply or writing a commit message: one request with
// no tools and nothing kept, on the model the user picked for it or else its cheapest. It runs here
// rather than in the daemon: like the catalog probe, nothing of it outlives core, and there is no
// session to keep. A few run at once.
export class QuickRequests {
  private running = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly deps: QuickDeps) {}

  ask(agent: AgentKind, prompt: string, picked?: string): Promise<{ text: string; model: string | null }> {
    return this.queued(() => this.request(agent, prompt, picked))
  }

  private async request(agent: AgentKind, prompt: string, picked: string | undefined): Promise<{ text: string; model: string | null }> {
    const quick = adapterOf(agent).quick
    if (!quick) throw new Rejection('quick-unsupported', `${agent} takes no one-off requests`)
    if (process.platform === 'win32') throw new Rejection('quick-unsupported', 'not on Windows yet')
    const catalog = await this.deps.catalog(agent).catch(() => null)
    // A pick the agent no longer lists has gone: its cheapest stands in. Without a catalog to tell,
    // the pick is tried as it is.
    const gone = picked !== undefined && catalog !== null && !catalog.models.some((each) => each.id === picked)
    const model = picked !== undefined && !gone ? picked : quickModel(agentDescriptor(agent).quickModels, catalog)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'kando-quick-'))
    try {
      const outputFile = path.join(dir, 'answer.md')
      const command = await quick.command(prompt, model, outputFile)
      const printed = await (this.deps.run ?? runQuick)(command, dir)
      const text = (command.output === 'file' ? await readFile(outputFile, 'utf8').catch(() => '') : printed).trim()
      if (!text) throw new Rejection('quick-failed', 'the agent gave no answer')
      return { text, model }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  private async queued<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= AT_ONCE) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.running++
    try {
      return await work()
    } finally {
      this.running--
      this.waiting.shift()?.()
    }
  }
}

function runQuick(command: QuickCommand, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Rejection('quick-timeout', 'the agent took too long'))
    }, TIMEOUT_MS)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err = (err + chunk).slice(-2000) })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Rejection('quick-failed', error.message))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Rejection('quick-failed', err.trim().split('\n').at(-1) || `exited with ${code}`))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(command.stdin ?? '')
  })
}
