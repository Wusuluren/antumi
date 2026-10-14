import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { agentDescriptor, quickModel, type AgentKind, type ChatCatalog, type CostBaseline } from '@kando/protocol'
import type { QuickCommand } from './agents/agent-adapter'
import { adapterOf } from './agents'
import { Rejection } from './rejection'
import type { SmallModelStore } from './small-model-store'

const TIMEOUT_MS = 120_000
// Opening an old conversation with translation on asks for many at once; a few run, the rest wait.
const AT_ONCE = 2

export type QuickTracking = { kind: 'translation' | 'commitMessage'; conversationId: string | null; baseline(): CostBaseline }
type QuickOutput = { stdout: string; error: Rejection | null }

export type QuickDeps = {
  catalog(agent: AgentKind): Promise<ChatCatalog | null>
  // Runs a one-off command to its end: what it printed, or why it failed.
  run?(command: QuickCommand, cwd: string): Promise<string | QuickOutput>
  accounting?: SmallModelStore
}

// Small jobs for an agent, such as translating a reply or writing a commit message: one request with
// no tools and nothing kept, on the model the user picked for it or else its cheapest. It runs here
// rather than in the daemon: like the catalog probe, nothing of it outlives core, and there is no
// session to keep. A few run at once.
export class QuickRequests {
  private running = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly deps: QuickDeps) {}

  ask(agent: AgentKind, prompt: string, picked?: string, tracking?: QuickTracking): Promise<{ text: string; model: string | null }> {
    return this.queued(() => this.request(agent, prompt, picked, tracking))
  }

  private async request(agent: AgentKind, prompt: string, picked: string | undefined, tracking?: QuickTracking): Promise<{ text: string; model: string | null }> {
    const quick = adapterOf(agent).quick
    if (!quick) throw new Rejection('quick-unsupported', `${agent} takes no one-off requests`)
    if (process.platform === 'win32') throw new Rejection('quick-unsupported', 'not on Windows yet')
    const catalog = await this.deps.catalog(agent).catch(() => null)
    // A pick the agent no longer lists has gone: its cheapest stands in. Without a catalog to tell,
    // the pick is tried as it is.
    const gone = picked !== undefined && catalog !== null && !catalog.models.some((each) => each.id === picked)
    const model = picked !== undefined && !gone ? picked : quickModel(agentDescriptor(agent).quickModels, catalog)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'kando-quick-'))
    const accounting = this.deps.accounting
    let job: string | undefined
    try {
      const outputFile = path.join(dir, 'answer.md')
      const command = await quick.command(prompt, model, outputFile)
      if (tracking && accounting) job = accounting.begin({ kind: tracking.kind, agent, model, conversationId: tracking.conversationId, baseline: tracking.baseline() })
      const output = await (this.deps.run ?? runQuick)(command, dir)
      const printed = typeof output === 'string' ? output : output.stdout
      const answer = quick.parse(printed, model)
      const text = (command.output === 'file' ? await readFile(outputFile, 'utf8').catch(() => '') : answer.text).trim()
      const error = typeof output === 'string' ? null : output.error
      const failed = error || answer.failed || !text
      if (job) accounting?.finish(job, failed ? 'failed' : 'completed', answer.metering)
      if (error) throw error
      if (failed) throw new Rejection('quick-failed', answer.failed ? text || 'the agent failed' : 'the agent gave no answer')
      return { text, model }
    } catch (error) {
      if (job) accounting?.finish(job, 'failed')
      throw error
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

function runQuick(command: QuickCommand, cwd: string): Promise<QuickOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ stdout: out, error: new Rejection('quick-timeout', 'the agent took too long') })
    }, TIMEOUT_MS)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err = (err + chunk).slice(-2000) })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Rejection('quick-failed', error.message))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout: out, error: code === 0 ? null : new Rejection('quick-failed', err.trim().split('\n').at(-1) || `exited with ${code}`) })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(command.stdin ?? '')
  })
}
