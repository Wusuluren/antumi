import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as privateFiles from '@antumi/protocol/node'
import { AttachmentStore } from './attachment-store'
import { CredentialStore } from './credential-store'
import { LoginFlows } from './source-login-flow'
import { SourceConfigStore } from './source-config'
import { SourceService } from './source-service'
import { PluginService } from './plugin-service'
import { pluginFixture, pluginZip } from './plugin-fixtures'

describe('plugin installation and activation', () => {
  let root: string
  let config: SourceConfigStore
  let sources: SourceService
  let plugins: PluginService
  const createService = (version = '0.15.11') => new PluginService(path.join(root, 'plugins'), version, sources, config, [])

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'antumi-plugin-service-'))
    config = new SourceConfigStore(path.join(root, 'sources.json'))
    await config.load()
    const credentials = new CredentialStore(path.join(root, 'credentials.json'))
    await credentials.load()
    sources = new SourceService([], config, credentials, new LoginFlows(), {
      importedKeys: () => new Set(), importTask: () => { throw new Error('unused') }, get: () => { throw new Error('unused') }, setSnapshot: () => { throw new Error('unused') }
    }, { dismissedIssues: () => new Set(), dismissIssue: () => {}, restoreIssue: () => {} }, new AttachmentStore(root), { inboxChanged: () => {}, listChanged: () => {} })
    plugins = createService()
    await plugins.load()
  })
  afterEach(async () => { vi.restoreAllMocks(); sources.stop(); await plugins.close(); await rm(root, { recursive: true, force: true }) })

  const install = async (version: string, behavior: Record<string, unknown> = {}) => {
    const from = path.join(root, `input-${version}`)
    await pluginFixture(from, { version, behavior })
    return plugins.install({ kind: 'local', path: from })
  }

  it('loads an installed plugin after upgrading from a stable host to a beta, preserving settings', async () => {
    await install('1.0.0')
    await config.save({ provider: 'demo', instance: 'default', enabled: true, settings: { query: 'mine' } })
    await plugins.close()
    plugins = createService('0.19.6-beta.2')
    await plugins.load()
    expect(plugins.list()[0]).toMatchObject({ id: 'demo.source', enabled: true, problem: null })
    expect(sources.list()[0]?.instances[0]?.settings.query).toBe('mine')
    await plugins.setEnabled('demo.source', true)
    expect(plugins.list()[0]?.problem).toBeNull()
  })

  it('installs the bundled GitHub plugin on first launch of a beta', async () => {
    const bundled = path.join(root, 'bundled-github')
    await pluginFixture(bundled, { id: 'antumi.github', source: 'github' })
    await plugins.close()
    plugins = createService('0.19.6-beta.2')
    await plugins.load(bundled)
    expect(plugins.list()[0]).toMatchObject({ id: 'antumi.github', enabled: true, problem: null, origin: { kind: 'bundled' } })
    expect(sources.list()[0]?.provider).toBe('github')
  })

  it('copies local artifacts, switches versions, rolls back and persists disabled state', async () => {
    const first = await install('1.0.0')
    expect(first.enabled).toBe(true)
    expect(sources.list().map((source) => source.provider)).toEqual(['demo'])
    await writeFile(path.join(root, 'input-1.0.0/main.mjs'), 'throw new Error("edited development directory")')
    await plugins.setEnabled('demo.source', true)
    await install('1.1.0')
    expect(plugins.list()[0]?.versions).toEqual(['1.1.0', '1.0.0'])
    await plugins.rollback('demo.source', '1.0.0')
    expect(plugins.list()[0]?.version).toBe('1.0.0')
    await plugins.setEnabled('demo.source', false)
    expect(sources.list()).toEqual([])
    await plugins.close()
    plugins = createService()
    await plugins.load()
    expect(plugins.list()[0]?.enabled).toBe(false)
    expect(sources.list()).toEqual([])
  })

  it('keeps the previous active pointer on failed handshake or incompatible settings', async () => {
    await install('1.0.0')
    await config.save({ provider: 'demo', instance: 'default', enabled: true, settings: { query: 'mine' } })
    const pointer = await readFile(path.join(root, 'plugins/active.json'), 'utf8')
    await expect(install('1.1.0', { badHandshake: true })).rejects.toThrow('协议')
    await expect(install('1.2.0', { changeSettings: true })).rejects.toThrow('已有设置')
    expect(await readFile(path.join(root, 'plugins/active.json'), 'utf8')).toBe(pointer)
    expect(plugins.list()[0]?.version).toBe('1.0.0')
    expect(sources.list()[0]?.instances[0]?.settings.query).toBe('mine')
  })

  it('preserves source settings on uninstall and retains ownership against another package', async () => {
    await install('1.0.0')
    await config.save({ provider: 'demo', instance: 'default', enabled: true, settings: { query: 'mine' } })
    await plugins.uninstall('demo.source')
    expect(plugins.list()).toEqual([])
    expect(config.get('demo', 'default')?.settings.query).toBe('mine')
    const from = path.join(root, 'other')
    await pluginFixture(from, { id: 'other.source' })
    await expect(plugins.install({ kind: 'local', path: from })).rejects.toThrow('已被占用')
    await plugins.close()
    plugins = createService()
    await plugins.load(path.join(root, 'input-1.0.0'))
    expect(plugins.list()).toEqual([])
  })

  it('reserves the GitHub source for its designated package', async () => {
    const from = path.join(root, 'github')
    await pluginFixture(from, { source: 'github' })
    await expect(plugins.install({ kind: 'local', path: from })).rejects.toThrow('已被占用')
  })

  it('resumes the old provider when writing the active pointer fails, and permits retry', async () => {
    await install('1.0.0')
    const pointer = await readFile(path.join(root, 'plugins/active.json'), 'utf8')
    const write = vi.spyOn(privateFiles, 'writePrivateJson').mockRejectedValueOnce(new Error('disk full'))
    await expect(install('1.1.0')).rejects.toThrow('disk full')
    write.mockRestore()
    expect(await readFile(path.join(root, 'plugins/active.json'), 'utf8')).toBe(pointer)
    expect(plugins.list()[0]?.version).toBe('1.0.0')
    expect(sources.list()[0]?.provider).toBe('demo')
    await install('1.1.0')
    expect(plugins.list()[0]?.version).toBe('1.1.0')
  })

  it('recovers an unreferenced version directory left before pointer commit', async () => {
    await install('1.0.0')
    await pluginFixture(path.join(root, 'plugins/demo.source/1.1.0'), { version: '1.1.0', behavior: { badHandshake: true } })
    await install('1.1.0')
    expect(plugins.list()[0]?.version).toBe('1.1.0')
  })

  it('installs a ZIP without an npm install step', async () => {
    const from = path.join(root, 'zip-input')
    await pluginFixture(from)
    const files: Record<string, string> = {}
    for (const name of ['main.mjs', 'manifest.json', 'behavior.json']) files[name] = await readFile(path.join(from, name), 'utf8')
    const zip = path.join(root, 'plugin.zip')
    await writeFile(zip, pluginZip(files))
    await plugins.install({ kind: 'local', path: zip })
    expect(sources.list()[0]?.provider).toBe('demo')
  })
})
