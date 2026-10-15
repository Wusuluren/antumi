import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { antumiPaths, HOME_MIGRATION_FILE } from '@antumi/protocol/node'
import { repairMovedHome } from './home-repair'
import { TaskStore } from './task-store'

describe('repairMovedHome', () => {
  let root: string
  let from: string
  let to: string
  let claude: string
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim()

  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-repair-')))
    from = path.join(root, '.kando')
    to = path.join(root, '.antumi')
    claude = path.join(root, '.claude')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  // A home as the old app left it, then moved as migrateHome moves it.
  const moved = () => {
    renameSync(from, to)
    writeFileSync(path.join(to, HOME_MIGRATION_FILE), JSON.stringify({ from, to, at: 1, repaired: false }))
    return antumiPaths(to)
  }

  it('points every path the database keeps at the moved home, and only those', async () => {
    mkdirSync(from)
    new TaskStore(path.join(from, 'antumi.db')).close()
    const db = new DatabaseSync(path.join(from, 'antumi.db'))
    const worktree = path.join(from, 'worktrees', 'aaaa', 'app')
    db.prepare(`INSERT INTO conversations (id, title, title_locked, agent, workspace_path, managed_workspace, created_at, updated_at, project_paths, project_starts, switched_branches)
      VALUES ('c', 't', 0, 'claude', ?, 1, 0, 0, ?, ?, ?)`).run(
      worktree,
      JSON.stringify([worktree, '/code/web', `${from}-dev/worktrees/x`]),
      JSON.stringify({ [worktree]: 'abc' }),
      JSON.stringify({ [worktree]: 'main' })
    )
    db.prepare('INSERT INTO known_repos (path, used_at) VALUES (?, 0)').run(worktree)
    db.close()
    const paths = moved()
    await repairMovedHome(paths, claude)
    const after = new DatabaseSync(paths.database)
    const row = after.prepare('SELECT workspace_path, project_paths, project_starts, switched_branches FROM conversations').get()
    const known = after.prepare('SELECT path FROM known_repos').all()
    after.close()
    const next = path.join(to, 'worktrees', 'aaaa', 'app')
    expect(row).toEqual({
      workspace_path: next,
      project_paths: JSON.stringify([next, '/code/web', `${from}-dev/worktrees/x`]),
      project_starts: JSON.stringify({ [next]: 'abc' }),
      switched_branches: JSON.stringify({ [next]: 'main' })
    })
    expect(known).toEqual([{ path: next }])
    expect(JSON.parse(readFileSync(path.join(to, HOME_MIGRATION_FILE), 'utf8'))).toMatchObject({ repaired: true })
  })

  it('tells git where each worktree went, so the main checkout keeps it', async () => {
    const app = path.join(root, 'app')
    mkdirSync(app)
    git(app, 'init', '-q', '-b', 'main')
    git(app, 'commit', '-q', '--allow-empty', '-m', 'first')
    mkdirSync(from)
    new TaskStore(path.join(from, 'antumi.db')).close()
    git(app, 'worktree', 'add', '-q', '-b', 'antumi/aaaa', path.join(from, 'worktrees', 'aaaa', 'app'))
    git(app, 'worktree', 'add', '-q', '--detach', path.join(from, 'worktrees', 'bbbb', '.planning', 'app'))
    const paths = moved()
    await repairMovedHome(paths, claude)
    const listed = git(app, 'worktree', 'list', '--porcelain')
    expect(listed).toContain(`worktree ${path.join(to, 'worktrees', 'aaaa', 'app')}`)
    expect(listed).toContain(`worktree ${path.join(to, 'worktrees', 'bbbb', '.planning', 'app')}`)
    expect(listed).not.toContain('prunable')
  })

  it("copies Claude's sessions for the folders agents ran in, keeping the originals", async () => {
    mkdirSync(from)
    new TaskStore(path.join(from, 'antumi.db')).close()
    const key = (folder: string) => folder.replace(/[^a-zA-Z0-9]/g, '-')
    const session = path.join(claude, 'projects', key(path.join(from, 'worktrees', 'aaaa', 'app')))
    const elsewhere = path.join(claude, 'projects', key(path.join(`${from}-dev`, 'worktrees', 'x')))
    mkdirSync(session, { recursive: true })
    mkdirSync(elsewhere, { recursive: true })
    writeFileSync(path.join(session, 's.jsonl'), 'session')
    await repairMovedHome(moved(), claude)
    expect(readFileSync(path.join(claude, 'projects', key(path.join(to, 'worktrees', 'aaaa', 'app')), 's.jsonl'), 'utf8')).toBe('session')
    expect(existsSync(path.join(session, 's.jsonl'))).toBe(true)
    expect(existsSync(path.join(claude, 'projects', key(path.join(`${to}-dev`, 'worktrees', 'x'))))).toBe(false)
  })

  it('does nothing for a home that was not moved, or was repaired already', async () => {
    mkdirSync(to)
    new TaskStore(path.join(to, 'antumi.db')).close()
    await repairMovedHome(antumiPaths(to), claude)
    writeFileSync(path.join(to, HOME_MIGRATION_FILE), JSON.stringify({ from, to, at: 1, repaired: true }))
    await repairMovedHome(antumiPaths(to), claude)
    expect(existsSync(path.join(claude, 'projects'))).toBe(false)
  })
})
