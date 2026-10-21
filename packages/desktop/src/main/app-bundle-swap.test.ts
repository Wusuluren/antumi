import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bundleOf, leftovers, swapBlocked, swapInto } from './app-bundle-swap'

describe('app bundle swap', () => {
  const dirs: string[] = []
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

  function folder(): string {
    const dir = mkdtempSync(join(tmpdir(), 'antumi-swap-test-'))
    dirs.push(dir)
    return dir
  }

  function app(path: string, version: string): void {
    mkdirSync(join(path, 'Contents'), { recursive: true })
    writeFileSync(join(path, 'Contents', 'version'), version)
  }

  it('finds the bundle the executable runs from', () => {
    expect(bundleOf('/Applications/Antumi.app/Contents/MacOS/Antumi')).toBe('/Applications/Antumi.app')
    expect(bundleOf('/usr/local/bin/electron')).toBeNull()
  })

  it('puts the new version in place and the old one aside, both found as leftovers after', async () => {
    const dir = folder()
    const bundle = join(dir, 'Antumi.app')
    const staged = join(dir, '.Antumi-update.app')
    app(bundle, 'old')
    app(staged, 'new')
    const previous = await swapInto(bundle, staged, 42)
    expect(readFileSync(join(bundle, 'Contents', 'version'), 'utf8')).toBe('new')
    expect(readFileSync(join(previous, 'Contents', 'version'), 'utf8')).toBe('old')
    expect(existsSync(staged)).toBe(false)
    expect(await leftovers(bundle)).toEqual([join(dir, '.Antumi-previous-42.app')])
  })

  it('puts the old version back when the new one cannot move in', async () => {
    const dir = folder()
    const bundle = join(dir, 'Antumi.app')
    app(bundle, 'old')
    await expect(swapInto(bundle, join(dir, '.Antumi-update.app'))).rejects.toThrow()
    expect(readFileSync(join(bundle, 'Contents', 'version'), 'utf8')).toBe('old')
  })

  it('will not replace an app run from the dmg or translocated by Gatekeeper', async () => {
    expect(await swapBlocked('/Volumes/Antumi/Antumi.app')).toBe('read-only')
    expect(await swapBlocked('/private/var/folders/x/AppTranslocation/y/d/Antumi.app')).toBe('read-only')
    expect(await swapBlocked(null)).toBe('not-a-bundle')
    const dir = folder()
    app(join(dir, 'Antumi.app'), 'old')
    expect(await swapBlocked(join(dir, 'Antumi.app'))).toBeNull()
  })
})
