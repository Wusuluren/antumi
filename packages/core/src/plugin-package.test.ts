import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyPlugin, extractPlugin, packagePath, readManifest, stagePlugin } from './plugin-package'
import { pluginFixture, pluginZip } from './plugin-fixtures'

describe('plugin packages', () => {
  let root: string
  beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'antumi-plugin-package-')) })
  afterEach(async () => { vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }) })

  it.each(['../outside.js', '/outside.js', 'C:/outside.js', 'dir/../../outside.js', 'dir\\outside.js', 'dir./outside.js'])('rejects unsafe path %s', (name) => {
    expect(() => packagePath(root, name)).toThrow()
  })

  it('extracts a ZIP and rejects traversal and case-insensitive duplicate names', async () => {
    await extractPlugin(pluginZip({ 'manifest.json': '{}', 'lib/main.mjs': 'export {}' }), root)
    expect(await readFile(path.join(root, 'lib/main.mjs'), 'utf8')).toBe('export {}')
    await expect(extractPlugin(pluginZip({ '../outside.mjs': '' }), root)).rejects.toThrow()
    await expect(extractPlugin(pluginZip({ 'a.js': '', 'A.js': '' }), root)).rejects.toThrow('重名')
  })

  it('rejects symlink and native-code packages', async () => {
    const from = path.join(root, 'from')
    const to = path.join(root, 'to')
    await mkdir(from); await mkdir(to)
    await symlink('../outside', path.join(from, 'main.mjs'))
    await expect(copyPlugin(from, to)).rejects.toThrow('符号链接')
    await expect(extractPlugin(pluginZip({ 'addon.node': 'binary' }), to)).rejects.toThrow('纯 JS')
  })

  it('checks compatibility and entry traversal before executing anything', async () => {
    const manifest = await pluginFixture(root)
    await expect(readManifest(root, '2.0.0')).rejects.toThrow('不兼容')
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ ...manifest, entry: { runtime: 'node', main: '../outside.mjs' } }))
    await expect(readManifest(root, '0.15.11')).rejects.toThrow('路径')
  })

  it.each(['0.19.6', '0.19.6-beta.1', '0.19.6-beta.2', '0.20.0-rc.1'])('accepts compatible stable and prerelease hosts: %s', async (version) => {
    const manifest = await pluginFixture(root)
    await expect(readManifest(root, version)).resolves.toEqual(manifest)
  })

  it.each(['0.14.99', '0.14.99-beta.2', '1.0.0', '1.1.0-beta.1', '2.0.0', 'invalid'])('rejects hosts outside the declared range or invalid: %s', async (version) => {
    await pluginFixture(root)
    await expect(readManifest(root, version)).rejects.toThrow('不兼容')
  })

  it('downloads only the selected release asset and requires an unambiguous ZIP', async () => {
    const archive = pluginZip({ 'main.mjs': 'export {}' })
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      return url.startsWith('https://api.github.com/')
        ? new Response(JSON.stringify({ tag_name: 'v1', assets: [{ name: 'plugin.zip', browser_download_url: 'https://github.com/demo/plugin/releases/download/v1/plugin.zip' }] }))
        : new Response(new Uint8Array(archive))
    })
    await stagePlugin({ kind: 'github', repository: 'demo/plugin', tag: 'v1' }, root)
    expect(calls).toEqual(['https://api.github.com/repos/demo/plugin/releases/tags/v1', 'https://github.com/demo/plugin/releases/download/v1/plugin.zip'])
    expect(await readFile(path.join(root, 'main.mjs'), 'utf8')).toBe('export {}')
  })
})
