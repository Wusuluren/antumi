import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { compareVersions, isVersion, type UpdateState } from '../shared/app-update'

// Releases as GitHub's REST API lists them; only what picking one needs.
const Asset = z.object({ name: z.string(), browser_download_url: z.string().url(), size: z.number(), digest: z.string().nullish() })
const Release = z.object({
  tag_name: z.string(),
  body: z.string().nullish(),
  html_url: z.string().url(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(Asset)
})
export type Release = z.infer<typeof Release>
export type ReleaseAsset = z.infer<typeof Asset>

export const RELEASES_REPO = 'flyhero/antumi'
const NOTES_LIMIT = 20_000
const CHECK_EVERY = 6 * 60 * 60 * 1000
const FIRST_CHECK = 10_000
const FEED_TAG = /<link\b[^>]*\bhref="[^"]*\/releases\/tag\/([^"]+)"/g
const CHECKSUM_LINE = /^([0-9a-f]{64})\s+\*?(\S+)$/

// The newest published release above the running version, a pre-release only when the user takes
// them. A skipped version is still found, so the settings page can say it is there.
export function newestRelease(releases: readonly Release[], current: string, prerelease: boolean): Release | null {
  let best: Release | null = null
  for (const release of releases) {
    if (release.draft || (release.prerelease && !prerelease) || !isVersion(release.tag_name)) continue
    if (compareVersions(release.tag_name, current) <= 0) continue
    if (!best || compareVersions(release.tag_name, best.tag_name) > 0) best = release
  }
  return best
}

// The installer built for this machine: the dmg for this Mac's architecture, the Windows setup.
export function installerFor(release: Release, platform: NodeJS.Platform, arch: string): ReleaseAsset | null {
  const suffix = platform === 'darwin' ? `-${arch}.dmg` : platform === 'win32' ? `-${arch}.exe` : null
  return suffix ? (release.assets.find((asset) => asset.name.endsWith(suffix)) ?? null) : null
}

export function versionOf(release: Release): string {
  return release.tag_name.replace(/^v/, '')
}

const Preferences = z.object({ prerelease: z.boolean().catch(false), skipped: z.string().nullable().catch(null) })
type Preferences = z.infer<typeof Preferences>

export type UpdaterOptions = {
  current: string
  platform: NodeJS.Platform
  arch: string
  // GitHub's API, or a stand-in serving the same shape (ANTUMI_UPDATE_API, for trying an update).
  api: string
  // GitHub's site, read when the API refuses; github.com unless a test stands in for it.
  site?: string
  preferencesFile: string
  downloads: string
  fetch: (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>
  // Why the app cannot replace itself here, or null when it can; absent off macOS.
  installBlocked: () => Promise<string | null>
  // Puts the app from the downloaded installer in place of this one and restarts into it.
  install: (installer: string, version: string) => Promise<void>
  publish: (state: UpdateState) => void
}

// Asks GitHub for a newer Antumi now and then, and on macOS downloads and installs it on request.
export class AppUpdater {
  private state: UpdateState
  private release: Release | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private checking: Promise<void> | null = null
  private downloaded: string | null = null

  constructor(private readonly options: UpdaterOptions) {
    this.state = { current: options.current, status: 'idle', latest: null, canInstall: false, progress: null, error: null, checkedAt: null, prerelease: false, skipped: null }
  }

  async start(): Promise<void> {
    const preferences = await this.preferences()
    this.set({ prerelease: preferences.prerelease, skipped: preferences.skipped })
    setTimeout(() => void this.check(), FIRST_CHECK).unref?.()
    this.timer = setInterval(() => void this.check(), CHECK_EVERY)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  current(): UpdateState {
    return this.state
  }

  check(): Promise<void> {
    if (this.busy()) return Promise.resolve()
    this.checking ??= this.fetchNewest().finally(() => { this.checking = null })
    return this.checking
  }

  async setPrerelease(prerelease: boolean): Promise<void> {
    await this.savePreferences({ prerelease })
    this.set({ prerelease })
    await this.check()
  }

  async skip(version: string | null): Promise<void> {
    await this.savePreferences({ skipped: version })
    this.set({ skipped: version })
  }

  // Downloads the installer, checks it against what GitHub says of it, and installs it.
  async install(): Promise<void> {
    const release = this.release
    const asset = release && installerFor(release, this.options.platform, this.options.arch)
    if (!release || !asset || this.busy() || !this.state.canInstall) return
    const version = versionOf(release)
    this.set({ status: 'downloading', progress: 0, error: null })
    try {
      const file = join(this.options.downloads, asset.name)
      // A retry after the install itself failed (agents still running on Windows) reuses it.
      if (this.downloaded !== file) await this.download(asset, file)
      this.downloaded = file
      this.set({ status: 'installing', progress: null })
      await this.options.install(file, version)
    } catch (error) {
      this.set({ status: 'error', progress: null, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private busy(): boolean {
    return this.state.status === 'downloading' || this.state.status === 'installing'
  }

  private async fetchNewest(): Promise<void> {
    this.set({ status: 'checking', error: null })
    try {
      const { releases, feed } = await this.releases()
      const newest = newestRelease(releases, this.options.current, this.state.prerelease)
      const release = newest && feed ? await this.withChecksums(newest) : newest
      this.release = release
      const blocked = release && installerFor(release, this.options.platform, this.options.arch) ? await this.options.installBlocked() : 'no installer'
      this.set({
        status: release ? 'available' : 'none',
        checkedAt: Date.now(),
        canInstall: blocked === null,
        latest: release && {
          version: versionOf(release),
          notes: (release.body ?? '').slice(0, NOTES_LIMIT),
          page: release.html_url,
          download: installerFor(release, this.options.platform, this.options.arch)?.browser_download_url ?? null
        }
      })
    } catch (error) {
      // A release already found stays on offer: a check that failed says nothing against it.
      this.set({ status: this.release ? 'available' : 'error', checkedAt: Date.now(), error: error instanceof Error ? error.message : String(error) })
    }
  }

  private get site(): string {
    return this.options.site ?? 'https://github.com'
  }

  // The API answers 403 or 429 once an address has spent its hourly allowance, as a VPN shared by
  // many soon does; the site's Atom feed is not counted against it, so the check goes on there.
  private async releases(): Promise<{ releases: Release[]; feed: boolean }> {
    const headers = { 'user-agent': `Antumi/${this.options.current}` }
    const response = await this.options.fetch(`${this.options.api}/repos/${RELEASES_REPO}/releases?per_page=20`, { headers: { ...headers, accept: 'application/vnd.github+json' } })
    if (response.ok) {
      const releases = z.array(z.unknown()).parse(await response.json()).flatMap((entry) => {
        const parsed = Release.safeParse(entry)
        return parsed.success ? [parsed.data] : []
      })
      return { releases, feed: false }
    }
    const refused = `GitHub ${response.status}`
    if (response.status !== 403 && response.status !== 429) throw new Error(refused)
    const feed = await this.options.fetch(`${this.site}/${RELEASES_REPO}/releases.atom`, { headers })
    if (!feed.ok) throw new Error(refused)
    // The feed has neither assets nor a pre-release flag; the release workflow marks a version
    // with a pre-release part as one, and assets come from its checksums once one is picked.
    const tags = [...(await feed.text()).matchAll(FEED_TAG)].map((match) => decodeURIComponent(match[1] ?? ''))
    return {
      feed: true,
      releases: tags.map((tag) => ({ tag_name: tag, body: '', html_url: `${this.site}/${RELEASES_REPO}/releases/tag/${tag}`, draft: false, prerelease: tag.includes('-'), assets: [] }))
    }
  }

  // A release read from the feed gets the installers its SHA256SUMS lists, each with that digest,
  // so they are verified as the API's would be. Without the file (releases before it, or no way to
  // reach it) it has none: the user is sent to the release page rather than run an unchecked one.
  private async withChecksums(release: Release): Promise<Release> {
    const base = `${this.site}/${RELEASES_REPO}/releases/download/${encodeURIComponent(release.tag_name)}`
    try {
      const response = await this.options.fetch(`${base}/SHA256SUMS`, { headers: { 'user-agent': `Antumi/${this.options.current}` } })
      if (!response.ok) return release
      const assets = (await response.text()).split(/\r?\n/).flatMap((line) => {
        const match = CHECKSUM_LINE.exec(line.trim())
        return match?.[1] && match[2] ? [{ name: match[2], browser_download_url: `${base}/${encodeURIComponent(match[2])}`, size: 0, digest: `sha256:${match[1]}` }] : []
      })
      return { ...release, assets }
    } catch {
      return release
    }
  }

  private async download(asset: ReleaseAsset, file: string): Promise<void> {
    this.downloaded = null
    await mkdir(dirname(file), { recursive: true })
    await rm(file, { force: true })
    const response = await this.options.fetch(asset.browser_download_url, { headers: { 'user-agent': `Antumi/${this.options.current}` } })
    if (!response.ok || !response.body) throw new Error('download-failed')
    const hash = createHash('sha256')
    const out = createWriteStream(file)
    let received = 0
    let shown = 0
    try {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        received += value.byteLength
        if (!out.write(value)) await new Promise((resolve) => out.once('drain', resolve))
        const progress = asset.size > 0 ? Math.min(1, received / asset.size) : 0
        if (progress - shown >= 0.01) {
          shown = progress
          this.set({ progress })
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())))
    }
    if (asset.size > 0 && received !== asset.size) throw new Error('incomplete')
    const expected = asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : null
    if (expected && hash.digest('hex') !== expected) throw new Error('digest-mismatch')
  }

  private set(change: Partial<UpdateState>): void {
    this.state = { ...this.state, ...change }
    this.options.publish(this.state)
  }

  private async preferences(): Promise<Preferences> {
    const text = await readFile(this.options.preferencesFile, 'utf8').catch(() => '{}')
    try {
      return Preferences.parse(JSON.parse(text))
    } catch {
      return { prerelease: false, skipped: null }
    }
  }

  private async savePreferences(change: Partial<Preferences>): Promise<void> {
    const next = { ...(await this.preferences()), ...change }
    await mkdir(dirname(this.options.preferencesFile), { recursive: true })
    await writeFile(this.options.preferencesFile, JSON.stringify(next, null, 2))
  }
}
