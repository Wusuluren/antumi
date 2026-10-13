import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { expect, it } from 'vitest'
import { PluginManifest } from '@kando/protocol'
import manifestJson from '../../plugin-github/manifest.json' with { type: 'json' }
import { PluginProcess } from './plugin-process'

it('runs the shipped GitHub source in plain Node without workspace dependencies', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kando-bundled-plugin-'))
  try {
    const artifact = await build({
      entryPoints: [fileURLToPath(new URL('../../plugin-github/src/main.ts', import.meta.url))],
      bundle: true, platform: 'node', format: 'esm', target: 'node22', write: false
    })
    const output = artifact.outputFiles[0]
    if (!output) throw new Error('Plugin build did not produce output')
    const main = path.join(directory, 'main.mjs')
    await writeFile(main, output.contents)
    const process = new PluginProcess(PluginManifest.parse(manifestJson), main, { KANDO_GITHUB_TOKEN: 'test-env-token' })
    const providers = await process.providers()
    const github = providers[0]
    if (!github) throw new Error('Missing GitHub source')
    expect(github.id).toBe('github')
    expect(github.envCredential?.({})).toEqual({ kind: 'token', payload: { token: 'test-env-token' } })
    expect(await github.normalizeSettings({ query: '  assignee:@me   is:open  ' })).toEqual({ query: 'assignee:@me is:open' })
    expect(await github.normalizeKey?.(' acme/repo#1 ')).toBe('acme/repo#1')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
