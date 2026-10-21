import { execFile } from 'node:child_process'
import { access, constants, mkdtemp, readdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const BUNDLE_ID = 'dev.antumi.desktop'

// The .app this process runs from: <bundle>.app/Contents/MacOS/<binary>.
export function bundleOf(executable: string): string | null {
  const bundle = dirname(dirname(dirname(executable)))
  return bundle.endsWith('.app') ? bundle : null
}

// Where a new version waits, and where the one it replaced is put aside, beside the bundle: a
// rename within one folder is atomic and never crosses volumes. Hidden, so the Finder shows one app.
export function stagedPath(bundle: string): string {
  return join(dirname(bundle), `.${basename(bundle, '.app')}-update.app`)
}

export function previousPath(bundle: string, at: number): string {
  return join(dirname(bundle), `.${basename(bundle, '.app')}-previous-${at}.app`)
}

// Why the app cannot replace itself where it runs, or null when it can. One opened from the dmg or
// translocated by Gatekeeper runs from a read-only copy; one in a folder the user may not write
// needs an administrator.
export async function swapBlocked(bundle: string | null): Promise<string | null> {
  if (!bundle) return 'not-a-bundle'
  if (bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return 'read-only'
  try {
    await access(dirname(bundle), constants.W_OK)
    await access(bundle, constants.W_OK)
    return null
  } catch {
    return 'not-writable'
  }
}

async function plistValue(plist: string, key: string): Promise<string> {
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])
  return stdout.trim()
}

// Copies the app out of the downloaded dmg to the staging path, after checking it is Antumi at the
// version expected and its signature holds. The copy is written by this process, so it carries no
// quarantine and opens without Gatekeeper's prompt, as the running one did.
export async function stageFromDmg(dmg: string, bundle: string, version: string): Promise<string> {
  const mount = await mkdtemp(join(tmpdir(), 'antumi-update-'))
  await run('/usr/bin/hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount])
  try {
    const app = (await readdir(mount)).find((name) => name.endsWith('.app'))
    if (!app) throw new Error('no-app-in-dmg')
    const source = join(mount, app)
    const plist = join(source, 'Contents', 'Info.plist')
    if ((await plistValue(plist, 'CFBundleIdentifier')) !== BUNDLE_ID) throw new Error('wrong-app')
    if ((await plistValue(plist, 'CFBundleShortVersionString')) !== version) throw new Error('wrong-version')
    const staged = stagedPath(bundle)
    // Only ever this process's own leftover from an update that did not finish.
    await rm(staged, { recursive: true, force: true })
    await run('/usr/bin/ditto', [source, staged])
    await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', staged]).catch(() => {})
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged])
    return staged
  } finally {
    await run('/usr/bin/hdiutil', ['detach', mount]).catch(() => run('/usr/bin/hdiutil', ['detach', mount, '-force'])).catch(() => {})
    await rm(mount, { recursive: true, force: true }).catch(() => {})
  }
}

// Puts the staged app where the running one is, keeping the old one aside until the new one has
// started (removeLeftovers). A failure puts the old one back.
export async function swapInto(bundle: string, staged: string, at = Date.now()): Promise<string> {
  const previous = previousPath(bundle, at)
  await rename(bundle, previous)
  try {
    await rename(staged, bundle)
  } catch (error) {
    await rename(previous, bundle)
    throw error
  }
  return previous
}

// The versions an update replaced, and a staging copy one left behind, gone once the new one runs.
export async function leftovers(bundle: string): Promise<string[]> {
  const name = basename(bundle, '.app')
  const folder = dirname(bundle)
  const entries = await readdir(folder).catch(() => [])
  return entries
    .filter((entry) => entry === `.${name}-update.app` || (entry.startsWith(`.${name}-previous-`) && entry.endsWith('.app')))
    .map((entry) => join(folder, entry))
}
