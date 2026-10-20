import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectOpenCode, opencodeCompatible, parseOpenCodeModels } from './opencode-cli'

let root: string
const executable = (body: string) => writeFileSync(path.join(root, 'opencode'), `#!${process.execPath}\n${body}`, { mode: 0o755 })

beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'antumi-opencode-cli-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('OpenCode CLI', () => {
  it('takes version 2 and later, whose config and ACP Antumi speaks', () => {
    expect(opencodeCompatible('2.1.1')).toBe(true)
    expect(opencodeCompatible('10.0.0')).toBe(true)
    expect(opencodeCompatible('1.18.31')).toBe(false)
    expect(opencodeCompatible(null)).toBe(false)
  })

  it.skipIf(process.platform === 'win32')('finds it on the path and tells an old release from a ready one', async () => {
    expect(await detectOpenCode(root, process.platform)).toEqual({ status: 'missing', version: null, path: null, signedIn: null })
    executable("console.log('1.18.31')")
    expect(await detectOpenCode(root, process.platform)).toMatchObject({ status: 'unknown', version: '1.18.31', path: path.join(root, 'opencode') })
    executable("console.log('2.1.1')")
    expect(await detectOpenCode(root, process.platform)).toMatchObject({ status: 'ok', version: '2.1.1' })
  })

  it('reads the models it lists as provider/model, one a line', () => {
    expect(parseOpenCodeModels('anthropic/claude-sonnet-5-5\nopenrouter/meta/llama-5\n\nWarning: something\n')).toEqual({ models: [
      { id: 'anthropic/claude-sonnet-5-5', label: 'anthropic/claude-sonnet-5-5', description: null, efforts: [], isDefault: false },
      { id: 'openrouter/meta/llama-5', label: 'openrouter/meta/llama-5', description: null, efforts: [], isDefault: false }
    ] })
    expect(parseOpenCodeModels('')).toBeNull()
  })
})
