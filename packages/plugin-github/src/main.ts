import { createInterface } from 'node:readline'
import { z } from 'zod'
import { PLUGIN_PROTOCOL_VERSION, pluginSchemas } from '@antumi/protocol'
import manifest from '../manifest.json' with { type: 'json' }
import { githubProvider } from './github-provider'
import { sourceProblem } from './source-error'

const provider = githubProvider()
const Request = z.object({ type: z.literal('call'), id: z.string(), method: z.enum(['handshake', 'normalizeSettings', 'normalizeKey', 'envCredential', 'login', 'list', 'fetch']), params: z.unknown() })
const Answer = z.object({ type: z.literal('answer'), id: z.string(), value: z.string() })
let pending: { id: string; resolve: (value: string) => void } | undefined
let counter = 0
let busy = false
let handshaken = false
const send = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`)
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
lines.on('line', (line) => {
  let raw: unknown
  try { raw = JSON.parse(line) } catch { process.exitCode = 1; lines.close(); return }
  const answer = Answer.safeParse(raw)
  if (answer.success && pending?.id === answer.data.id) {
    const prompt = pending
    pending = undefined
    prompt.resolve(answer.data.value)
    return
  }
  const parsed = Request.safeParse(raw)
  if (!parsed.success || busy) { process.exitCode = 1; lines.close(); return }
  const request = parsed.data
  busy = true
  void (async () => {
    if (request.method === 'handshake') {
      const params = pluginSchemas.handshake.params.parse(request.params)
      if (handshaken || params.protocolVersion !== PLUGIN_PROTOCOL_VERSION) throw new Error('Unsupported plugin protocol')
      handshaken = true
      return { protocolVersion: PLUGIN_PROTOCOL_VERSION, id: manifest.id, version: manifest.version, sources: [provider.id] }
    }
    if (!handshaken) throw new Error('Handshake required')
    const source = z.object({ source: z.literal('github') }).parse(request.params)
    const signal = AbortSignal.timeout(15 * 60_000)
    switch (request.method) {
      case 'normalizeSettings': return provider.normalizeSettings(pluginSchemas.normalizeSettings.params.parse(request.params).settings)
      case 'normalizeKey': {
        const { key } = pluginSchemas.normalizeKey.params.parse(request.params)
        return provider.normalizeKey?.(key) ?? key
      }
      case 'envCredential': return provider.envCredential?.(process.env) ?? null
      case 'login': {
        const { settings } = pluginSchemas.login.params.parse(request.params)
        return provider.login({
          prompt: (prompt) => new Promise<string>((resolve) => {
            const id = `prompt-${++counter}`
            pending = { id, resolve }
            send({ type: 'prompt', id, prompt })
          }),
          notify: (notice) => { send({ type: 'notify', notice }) }
        }, settings, signal)
      }
      case 'list': {
        const { settings, credential } = pluginSchemas.list.params.parse(request.params)
        return provider.list(settings, credential, signal)
      }
      case 'fetch': {
        const { settings, credential, key } = pluginSchemas.fetch.params.parse(request.params)
        return provider.fetch(settings, credential, key, signal)
      }
      default: throw new Error(`Unknown source ${source.source}`)
    }
  })().then((result) => send({ type: 'result', id: request.id, result }), (error: unknown) => send({ type: 'error', id: request.id, error: sourceProblem(error) })).finally(() => { busy = false })
})
lines.on('close', () => process.exit())
