import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compareVersions, type UpdateState } from '../shared/app-update'
import { AppUpdater, installerFor, newestRelease, type Release } from './app-update'

const release = (tag: string, change: Partial<Release> = {}): Release => ({
  tag_name: tag,
  body: `notes for ${tag}`,
  html_url: `https://github.com/flyhero/antumi/releases/tag/${tag}`,
  draft: false,
  prerelease: tag.includes('-'),
  assets: [
    { name: `Antumi-${tag.slice(1)}-arm64.dmg`, browser_download_url: `https://example.com/${tag}.dmg`, size: 4, digest: null },
    { name: `Antumi-Setup-${tag.slice(1)}-x64.exe`, browser_download_url: `https://example.com/${tag}.exe`, size: 4, digest: null }
  ],
  ...change
})

describe('compareVersions', () => {
  it('orders releases, pre-releases before their release, and numeric parts by value', () => {
    const sorted = ['0.19.10', '0.19.2', '0.19.2-beta.10', '0.19.2-beta.2', '0.20.0', '0.19.2-alpha', 'v0.19.1']
      .sort(compareVersions)
    expect(sorted).toEqual(['v0.19.1', '0.19.2-alpha', '0.19.2-beta.2', '0.19.2-beta.10', '0.19.2', '0.19.10', '0.20.0'])
  })
})

describe('newestRelease', () => {
  const releases = [release('v0.19.3'), release('v0.19.6-beta.1'), release('v0.19.5'), release('v0.19.7', { draft: true }), release('nightly')]

  it('offers the newest published release above the running one', () => {
    expect(newestRelease(releases, '0.19.4', false)?.tag_name).toBe('v0.19.5')
    expect(newestRelease(releases, '0.19.5', false)).toBeNull()
  })

  it('counts pre-releases only for a user who takes them', () => {
    expect(newestRelease(releases, '0.19.4', true)?.tag_name).toBe('v0.19.6-beta.1')
  })
})

describe('installerFor', () => {
  it('picks the dmg for this Mac and the setup for Windows, none elsewhere', () => {
    expect(installerFor(release('v1.0.0'), 'darwin', 'arm64')?.name).toBe('Antumi-1.0.0-arm64.dmg')
    expect(installerFor(release('v1.0.0'), 'darwin', 'x64')).toBeNull()
    expect(installerFor(release('v1.0.0'), 'win32', 'x64')?.name).toBe('Antumi-Setup-1.0.0-x64.exe')
    expect(installerFor(release('v1.0.0'), 'linux', 'x64')).toBeNull()
  })
})

describe('AppUpdater', () => {
  const dirs: string[] = []
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

  function updater(releases: Release[], installer: Uint8Array, change: { blocked?: string | null; refuse?: number } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'antumi-update-test-'))
    dirs.push(dir)
    const states: UpdateState[] = []
    const installed: { file: string; version: string }[] = []
    let downloads = 0
    let refusals = change.refuse ?? 0
    const instance = new AppUpdater({
      current: '0.19.4',
      platform: 'darwin',
      arch: 'arm64',
      api: 'https://api.example.com',
      preferencesFile: join(dir, 'update.json'),
      downloads: join(dir, 'downloads'),
      fetch: async (url) => {
        if (url.startsWith('https://api.example.com/')) return Response.json(releases)
        downloads++
        return new Response(installer)
      },
      installBlocked: async () => change.blocked ?? null,
      install: async (file, version) => {
        if (refusals-- > 0) throw new Error('agents-running')
        installed.push({ file, version })
      },
      publish: (state) => states.push(state)
    })
    return { instance, states, installed, downloads: () => downloads }
  }

  it('says a newer version is there, and that it can install it in place', async () => {
    const { instance } = updater([release('v0.19.5')], new Uint8Array(4))
    await instance.check()
    expect(instance.current()).toMatchObject({
      status: 'available',
      canInstall: true,
      latest: { version: '0.19.5', notes: 'notes for v0.19.5', download: 'https://example.com/v0.19.5.dmg' }
    })
  })

  it('installs a download that matches its digest, with progress on the way', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const { instance, states, installed } = updater([release('v0.19.5', { assets: [{ name: 'Antumi-0.19.5-arm64.dmg', browser_download_url: 'https://example.com/a.dmg', size: 4, digest }] })], bytes)
    await instance.check()
    await instance.install()
    expect(installed).toHaveLength(1)
    expect(installed[0]?.version).toBe('0.19.5')
    expect([...readFileSync(installed[0]?.file ?? '')]).toEqual([1, 2, 3, 4])
    expect(states.map((state) => state.status)).toContain('downloading')
    expect(instance.current().status).toBe('installing')
  })

  it('refuses a download that does not match what GitHub says of it', async () => {
    const digest = `sha256:${'0'.repeat(64)}`
    const { instance, installed } = updater([release('v0.19.5', { assets: [{ name: 'Antumi-0.19.5-arm64.dmg', browser_download_url: 'https://example.com/a.dmg', size: 4, digest }] })], new Uint8Array(4))
    await instance.check()
    await instance.install()
    expect(installed).toEqual([])
    expect(instance.current()).toMatchObject({ status: 'error', error: 'digest-mismatch' })
  })

  it('leaves installing to the user where the app cannot replace itself', async () => {
    const { instance, installed } = updater([release('v0.19.5')], new Uint8Array(4), { blocked: 'read-only' })
    await instance.check()
    await instance.install()
    expect(instance.current().canInstall).toBe(false)
    expect(installed).toEqual([])
  })

  it('remembers a skipped version and the pre-release choice', async () => {
    const { instance } = updater([release('v0.19.5'), release('v0.19.6-beta.1')], new Uint8Array(4))
    await instance.skip('0.19.5')
    await instance.setPrerelease(true)
    expect(instance.current()).toMatchObject({ skipped: '0.19.5', prerelease: true, latest: { version: '0.19.6-beta.1' } })
  })

  it('retries an install that was refused without downloading again', async () => {
    const { instance, installed, downloads } = updater([release('v0.19.5')], new Uint8Array(4), { refuse: 1 })
    await instance.check()
    await instance.install()
    expect(instance.current()).toMatchObject({ status: 'error', error: 'agents-running' })
    await instance.install()
    expect(installed).toHaveLength(1)
    expect(downloads()).toBe(1)
  })
})
