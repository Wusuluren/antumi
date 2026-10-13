import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SkillRepo } from '@kando/protocol'
import { SkillsLibrary, skillRepoId } from './skills-library'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

describe('skillRepoId', () => {
  it('names a repository by its owner and name', () => {
    expect(skillRepoId('https://github.com/kepano/obsidian-skills')).toBe('kepano-obsidian-skills')
    expect(skillRepoId('https://github.com/Kepano/Obsidian_Skills.git')).toBe('kepano-obsidian-skills')
    expect(skillRepoId('https://example.com/')).toBe('skills')
  })
})

describe('SkillsLibrary', () => {
  let root: string
  let upstream: string
  let changes: Array<readonly SkillRepo[]>
  let library: SkillsLibrary

  const skill = (name: string, description = `Does ${name}.`) => {
    mkdirSync(path.join(upstream, 'skills', name), { recursive: true })
    writeFileSync(path.join(upstream, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`)
  }
  const commit = (message: string) => { git(upstream, 'add', '-A'); git(upstream, 'commit', '-q', '-m', message); return git(upstream, 'rev-parse', 'HEAD') }
  const url = () => pathToFileURL(upstream).href

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'kando-skills-lib-'))
    // Named by its last two path segments, as a GitHub URL is by its owner and name.
    upstream = path.join(root, 'root', 'upstream')
    execFileSync('git', ['init', '-q', '-b', 'main', upstream])
    git(upstream, 'config', 'user.name', 'Kando Test')
    git(upstream, 'config', 'user.email', 'kando@example.com')
    writeFileSync(path.join(upstream, 'README.md'), '# Skills\n')
    mkdirSync(path.join(upstream, '.claude-plugin'))
    writeFileSync(path.join(upstream, '.claude-plugin', 'plugin.json'), '{"name":"test-skills","version":"0.1.0"}')
    skill('notes')
    commit('first')
    changes = []
    library = new SkillsLibrary(path.join(root, 'home', 'skills'), (repos) => changes.push(repos), { allowFileUrls: true })
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('installs a repository pinned at its head, reads its skills, and keeps that across a reload', async () => {
    const first = git(upstream, 'rev-parse', 'HEAD')
    const repo = await library.install(url())
    expect(repo).toMatchObject({ id: 'root-upstream', url: url(), commit: first, previousCommit: null, plugin: { name: 'test-skills', version: '0.1.0' }, skills: [{ name: 'notes', description: 'Does notes.', dir: 'skills/notes', problem: null }] })
    expect(git(path.join(root, 'home', 'skills', 'repos', 'root-upstream'), 'rev-parse', 'HEAD')).toBe(first)
    expect(git(path.join(root, 'home', 'skills', 'repos', 'root-upstream'), 'branch', '--show-current')).toBe('')
    expect(changes).toEqual([[repo]])
    expect(await library.readme('root-upstream')).toBe('# Skills\n')
    const reopened = new SkillsLibrary(path.join(root, 'home', 'skills'), () => {})
    await reopened.load()
    expect(reopened.list()).toEqual([repo])
    await expect(library.install(url())).rejects.toMatchObject({ reason: 'skills-already-installed' })
  })

  it('refuses what is not an https repository, or holds no skill', async () => {
    const plain = new SkillsLibrary(path.join(root, 'home', 'skills'), () => {})
    await expect(plain.install(url())).rejects.toMatchObject({ reason: 'skills-invalid-url' })
    await expect(plain.install('http://example.com/a/b')).rejects.toMatchObject({ reason: 'skills-invalid-url' })
    await expect(plain.install('-oProxyCommand=x')).rejects.toMatchObject({ reason: 'skills-invalid-url' })
    const bare = path.join(root, 'bare')
    execFileSync('git', ['init', '-q', '-b', 'main', bare])
    git(bare, 'config', 'user.name', 'T'); git(bare, 'config', 'user.email', 't@example.com')
    writeFileSync(path.join(bare, 'README.md'), '')
    git(bare, 'add', '-A'); git(bare, 'commit', '-q', '-m', 'empty')
    await expect(library.install(pathToFileURL(bare).href)).rejects.toMatchObject({ reason: 'skills-none-found' })
    expect(existsSync(path.join(root, 'home', 'skills', 'repos'))).toBe(true)
    expect(library.list()).toEqual([])
  })

  it('tells what an update brings before moving the pin, moves it, and rolls back', async () => {
    const first = (await library.install(url())).commit
    skill('canvas')
    const second = commit('add canvas')
    const check = await library.checkUpdate('root-upstream')
    expect(check).toMatchObject({ id: 'root-upstream', current: first, latest: second, behind: 1 })
    expect(check.skills.map((entry) => entry.name)).toEqual(['canvas', 'notes'])
    expect(library.list()[0]?.commit).toBe(first)

    const updated = await library.update('root-upstream', second)
    expect(updated).toMatchObject({ commit: second, previousCommit: first })
    expect(updated.skills.map((entry) => entry.name)).toEqual(['canvas', 'notes'])
    expect(git(path.join(root, 'home', 'skills', 'repos', 'root-upstream'), 'rev-parse', 'HEAD')).toBe(second)
    await expect(library.update('root-upstream', 'f'.repeat(40))).rejects.toMatchObject({ reason: 'skills-bad-commit' })

    const back = await library.rollback('root-upstream')
    expect(back).toMatchObject({ commit: first, previousCommit: second })
    expect(back.skills.map((entry) => entry.name)).toEqual(['notes'])
    await expect(new SkillsLibrary(root, () => {}).rollback('nope')).rejects.toMatchObject({ reason: 'skills-unknown' })
  })

  it('bundles the installed skills asked for, and removes a repository with its bundles', async () => {
    await library.install(url())
    expect(await library.bundleFor([{ repo: 'root-upstream', skill: 'canvas' }])).toBeNull()
    const bundle = await library.bundleFor([{ repo: 'root-upstream', skill: 'notes' }, { repo: 'root-upstream', skill: 'canvas' }])
    expect(bundle).toMatchObject({ skills: [{ repo: 'root-upstream', skill: 'notes' }], missing: [{ repo: 'root-upstream', skill: 'canvas' }] })
    expect(readFileSync(path.join(bundle!.dir, 'skills', 'notes', 'SKILL.md'), 'utf8')).toContain('name: notes')
    await library.remove('root-upstream')
    expect(library.list()).toEqual([])
    expect(existsSync(bundle!.dir)).toBe(false)
    expect(existsSync(path.join(root, 'home', 'skills', 'repos', 'root-upstream'))).toBe(false)
    expect(JSON.parse(readFileSync(path.join(root, 'home', 'skills', 'skills.json'), 'utf8'))).toEqual({ version: 1, repos: [] })
  })
})
