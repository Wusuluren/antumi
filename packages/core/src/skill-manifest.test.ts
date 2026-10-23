import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileSource, parseSkillFrontmatter, readPluginManifest, rootSkillEntry, scanSkills, skillEntry } from './skill-manifest'

describe('parseSkillFrontmatter', () => {
  it('reads bare, quoted and block scalars, and leaves the rest', () => {
    const text = ['---', 'name: notes', "description: 'Write: notes'", 'version: "1.0"', 'long: >', '  one', '  two', 'kept: |', '  a', '', '  b', 'tags:', '  - x', '---', '# Body'].join('\n')
    expect(parseSkillFrontmatter(text)).toEqual({ name: 'notes', description: 'Write: notes', version: '1.0', long: 'one two', kept: 'a\n\nb', tags: '' })
  })

  it('wants a fence at the top, closed', () => {
    expect(parseSkillFrontmatter('# Just markdown')).toBeNull()
    expect(parseSkillFrontmatter('---\nname: x\n')).toBeNull()
    expect(parseSkillFrontmatter('﻿---\r\nname: x\r\n---\r\n')).toEqual({ name: 'x' })
  })
})

describe('skillEntry', () => {
  const valid = '---\nname: notes\ndescription: Takes notes.\n---\n'
  it('accepts a skill whose name is its folder, and tells what is wrong with another', () => {
    expect(skillEntry('notes', 'skills/notes', valid)).toEqual({ name: 'notes', description: 'Takes notes.', dir: 'skills/notes', problem: null })
    expect(skillEntry('notes', 'skills/notes', null).problem).toBe('缺少 SKILL.md')
    expect(skillEntry('notes', 'skills/notes', '# no frontmatter').problem).toBe('SKILL.md 没有 frontmatter')
    expect(skillEntry('other', 'skills/other', valid).problem).toBe('name 是 notes，与目录名不一致')
    expect(skillEntry('notes', 'skills/notes', '---\nname: notes\n---\n').problem).toBe('缺少 description')
    expect(skillEntry('notes', 'skills/notes', `---\nname: notes\ndescription: ${'x'.repeat(1025)}\n---\n`).problem).toMatch(/超过/)
    expect(skillEntry('My Skill', 'skills/My Skill', valid)).toMatchObject({ name: 'my-skill', problem: '目录名只能用小写字母、数字和连字符' })
  })
})

describe('rootSkillEntry', () => {
  it('names a repository-wide skill by its frontmatter, and tells what is wrong with it', () => {
    expect(rootSkillEntry('---\nname: ip-as-logo\ndescription: Draws.\n---\n')).toEqual({ name: 'ip-as-logo', description: 'Draws.', dir: '.', problem: null })
    expect(rootSkillEntry('# no frontmatter').problem).toBe('SKILL.md 没有 frontmatter')
    expect(rootSkillEntry('---\ndescription: Draws.\n---\n')).toMatchObject({ name: 'skill', problem: '缺少 name' })
    expect(rootSkillEntry('---\nname: IP Logo\ndescription: Draws.\n---\n')).toMatchObject({ name: 'ip-logo', problem: 'name 只能用小写字母、数字和连字符' })
    expect(rootSkillEntry('---\nname: logo\n---\n').problem).toBe('缺少 description')
  })
})

describe('scanSkills', () => {
  let repo: string
  beforeEach(() => { repo = mkdtempSync(path.join(os.tmpdir(), 'antumi-skills-')) })
  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  const skill = (dir: string, name: string, body = `---\nname: ${name}\ndescription: Does ${name}.\n---\n`) => {
    mkdirSync(path.join(repo, dir, name), { recursive: true })
    writeFileSync(path.join(repo, dir, name, 'SKILL.md'), body)
  }

  it('lists skills/*/SKILL.md in name order, with the faulty ones told', async () => {
    skill('skills', 'zeta')
    skill('skills', 'alpha')
    skill('skills', 'broken', 'nothing')
    mkdirSync(path.join(repo, 'skills', 'empty'))
    expect((await scanSkills(fileSource(repo))).map((entry) => [entry.name, entry.dir, entry.problem])).toEqual([
      ['alpha', 'skills/alpha', null], ['broken', 'skills/broken', 'SKILL.md 没有 frontmatter'], ['empty', 'skills/empty', '缺少 SKILL.md'], ['zeta', 'skills/zeta', null]
    ])
  })

  it('falls back to top-level folders holding a SKILL.md, skipping hidden ones and plain folders', async () => {
    skill('.', 'notes')
    mkdirSync(path.join(repo, 'docs'))
    mkdirSync(path.join(repo, '.git'))
    expect(await scanSkills(fileSource(repo))).toEqual([{ name: 'notes', description: 'Does notes.', dir: 'notes', problem: null }])
  })

  it('takes a SKILL.md at the root as the one skill the repository is, its subfolders as its files', async () => {
    writeFileSync(path.join(repo, 'SKILL.md'), '---\nname: ip-as-logo\ndescription: Draws a logo.\n---\n')
    mkdirSync(path.join(repo, 'assets'))
    expect(await scanSkills(fileSource(repo))).toEqual([{ name: 'ip-as-logo', description: 'Draws a logo.', dir: '.', problem: null }])
  })

  it('takes skills/ over a SKILL.md at the root, which then only tells of the repository', async () => {
    writeFileSync(path.join(repo, 'SKILL.md'), '---\nname: overview\ndescription: All of them.\n---\n')
    skill('skills', 'notes')
    expect((await scanSkills(fileSource(repo))).map((entry) => entry.name)).toEqual(['notes'])
  })

  it('reads the plugin manifest where there is one', async () => {
    expect(await readPluginManifest(fileSource(repo))).toBeNull()
    mkdirSync(path.join(repo, '.claude-plugin'))
    writeFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), '{"name":"obsidian","version":"1.2.0"}')
    expect(await readPluginManifest(fileSource(repo))).toEqual({ name: 'obsidian', version: '1.2.0' })
    writeFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), 'not json')
    expect(await readPluginManifest(fileSource(repo))).toBeNull()
  })
})
