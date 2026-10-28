import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DSH_VERSION, prepareDshProfile } from './dsh-cli'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixture({ failFirst = false, ignoreBase = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'antumi-dsh-install-'))
  roots.push(root)
  const command = path.join(root, 'dsh')
  const home = path.join(root, 'home')
  const bundle = path.join(root, 'runtime.tgz')
  await writeFile(bundle, 'test-bundle')
  await writeFile(command, `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const profile = path.join(process.env.DSH_HOME, 'profiles', 'antumi')
fs.mkdirSync(profile, {recursive:true})
const log = path.join(profile, 'calls')
const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\\n').filter(Boolean) : []
calls.push(args.join(' '))
fs.writeFileSync(log, calls.join('\\n'))
const target = args[0] === 'plugin' ? args[4] : null
const installs = { [${JSON.stringify(bundle)}]: ['@antumi', 'dsh-runtime', {name:'@antumi/dsh-runtime'}], '${'@deepseek-ai/dsh-base@' + DSH_VERSION}': ['@deepseek-ai', 'dsh-base', {name:'@deepseek-ai/dsh-base', version:'${DSH_VERSION}'}] }
const install = installs[target]
if (install === undefined) process.exit(2)
if (${failFirst} && calls.length === 1) process.exit(1)
if (${ignoreBase} && install[1] === 'dsh-base') process.exit(0)
const dir = path.join(profile, 'node_modules', install[0], install[1])
fs.mkdirSync(dir, {recursive:true})
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(install[2]))
`, { mode: 0o700 })
  return { root, home, command, bundle, profile: path.join(home, 'profiles', 'antumi') }
}

const callsOf = (profile: string) => readFile(path.join(profile, 'calls'), 'utf8')
const base = (profile: string) => path.join(profile, 'node_modules', '@deepseek-ai', 'dsh-base')

describe.skipIf(process.platform === 'win32')('DSH managed profile', () => {
  it('coalesces concurrent preparation, skips the installed digest, and reinstalls a changed bundle', async () => {
    const f = await fixture()
    await Promise.all([prepareDshProfile(f.command, f.bundle, f.home), prepareDshProfile(f.command, f.bundle, f.home)])
    expect(await callsOf(f.profile)).toBe(`plugin --profile antumi add ${f.bundle}\nplugin --profile antumi add @deepseek-ai/dsh-base@${DSH_VERSION}`)
    await prepareDshProfile(f.command, f.bundle, f.home)
    expect(await callsOf(f.profile)).toBe(`plugin --profile antumi add ${f.bundle}\nplugin --profile antumi add @deepseek-ai/dsh-base@${DSH_VERSION}`)
    await writeFile(f.bundle, 'updated-bundle')
    await prepareDshProfile(f.command, f.bundle, f.home)
    expect((await callsOf(f.profile)).split('\n')).toHaveLength(3)
  })

  it('pins the profile its own dsh-base when an older install already answers for it', async () => {
    const f = await fixture()
    await prepareDshProfile(f.command, f.bundle, f.home)
    await rm(base(f.profile), { recursive: true, force: true })
    await prepareDshProfile(f.command, f.bundle, f.home)
    expect(await readFile(path.join(base(f.profile), 'package.json'), 'utf8')).toContain(DSH_VERSION)
  })

  it('reports a base package that the installer claimed to add but did not', async () => {
    const f = await fixture({ ignoreBase: true })
    await expect(prepareDshProfile(f.command, f.bundle, f.home)).rejects.toMatchObject({ reason: 'dsh-runtime-install-failed' })
    await expect(readFile(path.join(f.profile, '.antumi-runtime'), 'utf8')).rejects.toThrow()
  })

  it('can retry an installation failure and preserves files already in the profile', async () => {
    const f = await fixture({ failFirst: true })
    await mkdir(f.profile, { recursive: true })
    const existing = path.join(f.profile, 'cordis.patch.yml')
    await writeFile(existing, 'user-config')
    await expect(prepareDshProfile(f.command, f.bundle, f.home)).rejects.toMatchObject({ reason: 'dsh-runtime-install-failed' })
    await prepareDshProfile(f.command, f.bundle, f.home)
    expect(await readFile(existing, 'utf8')).toBe('user-config')
  })
})
