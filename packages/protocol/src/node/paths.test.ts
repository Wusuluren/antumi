import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { antumiHome, antumiPaths } from './paths'

describe.skipIf(process.platform === 'win32')('daemon socket path', () => {
  it('lives in the home when short enough', () => {
    expect(antumiPaths('/home/me/.antumi').daemonSocket).toBe('/home/me/.antumi/daemon-v3.sock')
  })

  it('falls back to a hashed temp path when the home is too deep for sun_path', () => {
    const deep = `/${'nested/'.repeat(20)}antumi`
    const socket = antumiPaths(deep).daemonSocket
    expect(path.dirname(socket)).toBe(os.tmpdir())
    expect(socket).not.toBe(antumiPaths(`${deep}-other`).daemonSocket)
  })
})

describe('home directory', () => {
  it('prefers ANTUMI_HOME, then KANDO_HOME from before the rename', () => {
    expect(antumiHome({ ANTUMI_HOME: '/a', KANDO_HOME: '/b' }, '/home/me')).toBe(path.resolve('/a'))
    expect(antumiHome({ KANDO_HOME: '/b' }, '/home/me')).toBe(path.resolve('/b'))
  })

  it('defaults to ~/.antumi', () => {
    expect(antumiHome({}, '/home/me')).toBe(path.join('/home/me', '.antumi'))
  })

  it('keeps installed skills under home', () => {
    expect(antumiPaths('/home/me/.antumi').skills).toBe(path.join('/home/me/.antumi', 'skills'))
  })
})
