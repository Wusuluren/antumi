import { existsSync } from 'node:fs'
import { cp, readdir, stat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import { HOME_MIGRATION_FILE, HomeMigrationRecord, readJsonIfExists, writePrivateJson, type AntumiPaths } from '@antumi/protocol/node'
import { execFileAsync } from './hidden-exec'


// What migrateHome leaves for core, which owns persistence and git: the database still names the
// old home in its paths, git still finds each worktree there, and Claude keeps a conversation's
// session under its folder's path. Each step is repeatable and deletes nothing; the record is marked
// repaired once all have run, so a start that dies halfway does it again.
export async function repairMovedHome(paths: AntumiPaths, claudeDir: string = claudeConfigDir()): Promise<void> {
  const file = path.join(paths.home, HOME_MIGRATION_FILE)
  const record = HomeMigrationRecord.safeParse(await readJsonIfExists(file))
  if (!record.success || record.data.repaired || record.data.to !== paths.home) return
  const { from, to } = record.data
  rewriteDatabase(paths.database, from, to)
  await repairWorktrees(paths.worktrees)
  await copyClaudeProjects(claudeDir, from, to)
  await writePrivateJson(file, { ...record.data, repaired: true } satisfies HomeMigrationRecord)
  console.log(`[antumi-core] finished moving ${from} to ${to}`)
}

// Every text column, not a list of them: paths sit in plain columns, in JSON arrays and objects
// (some as keys), and in messages that point at a handoff file.
export function rewriteDatabase(database: string, from: string, to: string): void {
  const db = new DatabaseSync(database)
  // Only the old home itself or a path under it: ~/.kando-dev is another home.
  const pattern = new RegExp(`${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[/\\\\"']|$)`, 'g')
  try {
    db.exec('BEGIN')
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
    for (const { name: table } of tables) {
      if (typeof table !== 'string') continue
      const columns = db.prepare(`SELECT name, type FROM pragma_table_info(?)`).all(table)
      for (const { name: column, type } of columns) {
        if (typeof column !== 'string' || typeof type !== 'string' || !/TEXT/i.test(type)) continue
        const rows = db.prepare(`SELECT rowid AS id, "${column}" AS value FROM "${table}" WHERE instr("${column}", ?) > 0`).all(from)
        const update = db.prepare(`UPDATE OR IGNORE "${table}" SET "${column}" = ? WHERE rowid = ?`)
        for (const { id, value } of rows) {
          if (typeof value !== 'string' || typeof id !== 'number') continue
          const next = value.replace(pattern, to)
          if (next !== value) update.run(next, id)
        }
      }
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

// The main checkout keeps an absolute path back to each of its worktrees; repair points it at the
// moved one, or git would prune it as missing.
async function repairWorktrees(root: string): Promise<void> {
  for (const dir of await worktreeDirs(root)) {
    await execFileAsync('git', ['-C', dir, 'worktree', 'repair']).catch((error: unknown) => {
      console.error(`[antumi-core] git worktree repair failed in ${dir}:`, error instanceof Error ? error.message : error)
    })
  }
}

// worktrees/<id>/<repo> and worktrees/<id>/.planning/<repo>: each has a .git file, not a folder.
async function worktreeDirs(root: string): Promise<string[]> {
  const found: string[] = []
  const visit = async (dir: string, depth: number) => {
    if (await stat(path.join(dir, '.git')).then((info) => info.isFile(), () => false)) {
      found.push(dir)
      return
    }
    if (depth === 0) return
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), depth - 1)
    }
  }
  await visit(root, 3)
  return found
}

// Claude names a project's folder after its path; a copy under the new name lets every conversation
// resume where it was. The original stays: it is Claude's, not ours.
export async function copyClaudeProjects(claudeDir: string, from: string, to: string): Promise<void> {
  const projects = path.join(claudeDir, 'projects')
  const oldKey = claudeProjectKey(from)
  const newKey = claudeProjectKey(to)
  // Only the folders agents ran in; a bare prefix would also take ~/.kando-dev's.
  const owned = ['worktrees', 'sessions'].map((folder) => `${oldKey}-${folder}-`)
  for (const name of await readdir(projects).catch(() => [])) {
    if (!owned.some((prefix) => name.startsWith(prefix))) continue
    const target = path.join(projects, `${newKey}${name.slice(oldKey.length)}`)
    if (existsSync(target)) continue
    await cp(path.join(projects, name), target, { recursive: true, errorOnExist: false, force: false }).catch((error: unknown) => {
      console.error(`[antumi-core] copying Claude's sessions for ${name} failed:`, error instanceof Error ? error.message : error)
    })
  }
}

function claudeProjectKey(folder: string): string {
  return folder.replace(/[^a-zA-Z0-9]/g, '-')
}

function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')
}
