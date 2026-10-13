import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { SkillName, type SkillEntry } from '@kando/protocol'

// Where a repository keeps its skills: the Agent Skills layout, else each top-level folder.
const SKILLS_DIR = 'skills'
const MAX_DESCRIPTION = 1024

// A repository's files as one commit holds them: on disk at the pinned commit, or out of git for
// a commit not checked out.
export type SkillSource = {
  // Names of the folders in a folder (relative to the repository root); [] where it is not one.
  folders(dir: string): Promise<string[]>
  // A file's text, null where there is none.
  read(file: string): Promise<string | null>
}

export function fileSource(repoDir: string): SkillSource {
  return {
    folders: async (dir) => {
      try {
        return (await readdir(path.join(repoDir, dir), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
      } catch {
        return []
      }
    },
    read: (file) => readFile(path.join(repoDir, file), 'utf8').catch(() => null)
  }
}

// The scalars of SKILL.md's frontmatter: `key: value`, quoted or bare, or a `|` / `>` block.
// Enough for name and description; a list or a nested map is left out. No YAML library is needed
// for that, and a stranger file surfaces as a problem rather than a parse error.
export function parseSkillFrontmatter(text: string): Record<string, string> | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return null
  const fields: Record<string, string> = {}
  for (let i = 1; i < end; i++) {
    const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(lines[i] ?? '')
    if (!match) continue
    const key = match[1] ?? ''
    const value = (match[2] ?? '').trim()
    const block = /^([|>])[+-]?$/.exec(value)
    if (block) {
      const kept: string[] = []
      while (i + 1 < end && (/^\s/.test(lines[i + 1] ?? '') || (lines[i + 1] ?? '').trim() === '')) kept.push((lines[++i] ?? '').trim())
      fields[key] = (block[1] === '|' ? kept.join('\n') : kept.join(' ')).trim()
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      fields[key] = value.slice(1, -1)
    } else {
      fields[key] = value
    }
  }
  return fields
}

// What a SKILL.md makes of the folder it is in; a fault is told, not thrown.
export function skillEntry(folder: string, dir: string, text: string | null): SkillEntry {
  const fields = text === null ? null : parseSkillFrontmatter(text)
  const name = fields?.name ?? folder
  const entry = { name: SkillName.safeParse(folder).success ? folder : folder.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'skill', description: fields?.description ?? '', dir }
  if (text === null) return { ...entry, problem: '缺少 SKILL.md' }
  if (!fields) return { ...entry, problem: 'SKILL.md 没有 frontmatter' }
  if (!SkillName.safeParse(folder).success) return { ...entry, problem: '目录名只能用小写字母、数字和连字符' }
  if (name !== folder) return { ...entry, problem: `name 是 ${name}，与目录名不一致` }
  if (!entry.description) return { ...entry, problem: '缺少 description' }
  if (entry.description.length > MAX_DESCRIPTION) return { ...entry, problem: `description 超过 ${MAX_DESCRIPTION} 字符` }
  return { ...entry, problem: null }
}

// Every skill a repository holds, as its SKILL.md files describe them, in name order.
export async function scanSkills(source: SkillSource): Promise<SkillEntry[]> {
  let parent = SKILLS_DIR
  let folders = await source.folders(parent)
  if (folders.length === 0) {
    parent = '.'
    folders = (await source.folders(parent)).filter((folder) => !folder.startsWith('.') && folder !== 'node_modules')
  }
  const entries = await Promise.all(folders.map(async (folder) => {
    const dir = parent === '.' ? folder : `${parent}/${folder}`
    const text = await source.read(`${dir}/SKILL.md`)
    // A folder without a SKILL.md at the root is not a skill, only a folder.
    return parent === '.' && text === null ? null : skillEntry(folder, dir, text)
  }))
  return entries.filter((entry) => entry !== null).sort((a, b) => a.name.localeCompare(b.name))
}

// What a plugin manifest names the repository, where it has one.
export async function readPluginManifest(source: SkillSource): Promise<{ name: string; version: string } | null> {
  const text = await source.read('.claude-plugin/plugin.json')
  if (text === null) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { name, version } = parsed as Record<string, unknown>
    return typeof name === 'string' && name ? { name, version: typeof version === 'string' ? version : '' } : null
  } catch {
    return null
  }
}
