import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HOME_MIGRATION_FILE, migrateHome } from './home-migration'
import { antumiHome, antumiPaths } from './paths'

let root: string
let legacy: string
let next: string

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'antumi-home-'))
  legacy = path.join(root, '.kando')
  next = path.join(root, '.antumi')
  mkdirSync(path.join(legacy, 'worktrees', 'aaaa'), { recursive: true })
  writeFileSync(path.join(legacy, 'kando.db'), 'db')
  writeFileSync(path.join(legacy, 'kando.db-wal'), 'wal')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('migrateHome', () => {
  it('keeps using the old home until it moves', () => {
    expect(antumiHome({}, root)).toBe(legacy)
    expect(antumiPaths(legacy).database).toBe(path.join(legacy, 'kando.db'))
  })

  it('moves the home and its database, once, and leaves a record for core', async () => {
    expect(await migrateHome({}, root)).toBe('moved')
    expect(existsSync(legacy)).toBe(false)
    expect(readFileSync(path.join(next, 'antumi.db'), 'utf8')).toBe('db')
    expect(readFileSync(path.join(next, 'antumi.db-wal'), 'utf8')).toBe('wal')
    expect(existsSync(path.join(next, 'worktrees', 'aaaa'))).toBe(true)
    expect(JSON.parse(readFileSync(path.join(next, HOME_MIGRATION_FILE), 'utf8'))).toMatchObject({ from: legacy, to: next, repaired: false })
    expect(antumiHome({}, root)).toBe(next)
    expect(antumiPaths(next).database).toBe(path.join(next, 'antumi.db'))
    expect(await migrateHome({}, root)).toBe('nothing')
  })

  it('leaves a home alone when one was chosen, or the new one is already there', async () => {
    expect(await migrateHome({ KANDO_HOME: legacy }, root)).toBe('nothing')
    expect(await migrateHome({ ANTUMI_HOME: next }, root)).toBe('nothing')
    mkdirSync(next)
    expect(await migrateHome({}, root)).toBe('nothing')
    expect(existsSync(path.join(legacy, 'kando.db'))).toBe(true)
  })

  it('waits while a daemon still answers from the old home', async () => {
    const server = net.createServer()
    await new Promise<void>((resolve) => server.listen(path.join(legacy, 'daemon-v3.sock'), resolve))
    try {
      expect(await migrateHome({}, root)).toBe('deferred')
      expect(existsSync(path.join(legacy, 'kando.db'))).toBe(true)
      expect(existsSync(next)).toBe(false)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('waits while the old core is alive, and not for one that has gone', async () => {
    writeFileSync(path.join(legacy, 'core.json'), JSON.stringify({ port: 1, token: 't', pid: process.pid }))
    expect(await migrateHome({}, root)).toBe('deferred')
    writeFileSync(path.join(legacy, 'core.json'), JSON.stringify({ port: 1, token: 't', pid: 2 ** 22 + 7 }))
    expect(await migrateHome({}, root)).toBe('moved')
  })
})
