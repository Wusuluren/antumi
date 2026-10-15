import { z } from 'zod'

// Agent Skills: folders of SKILL.md that Antumi installs once, from git repositories pinned to a
// commit, and hands to whichever agent it starts. Names follow the Agent Skills spec: lowercase,
// digits and hyphens, the same as the skill's folder.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
export const SkillRepoId = z.string().regex(SLUG)
export const SkillName = z.string().regex(SLUG)
export const CommitSha = z.string().regex(/^[0-9a-f]{40}$/)

// One skill as a repository's pinned commit holds it; problem: why it cannot be used (bad
// frontmatter), for the user to see rather than a refusal of the whole repository.
export const SkillEntry = z.object({ name: SkillName, description: z.string(), dir: z.string(), problem: z.string().nullable() })
export type SkillEntry = z.infer<typeof SkillEntry>

// previousCommit: where an update came from, for one rollback; null until an update.
export const SkillRepo = z.object({
  id: SkillRepoId,
  url: z.string(),
  commit: CommitSha,
  previousCommit: CommitSha.nullable(),
  installedAt: z.number(),
  updatedAt: z.number(),
  plugin: z.object({ name: z.string(), version: z.string() }).nullable(),
  skills: z.array(SkillEntry)
})
export type SkillRepo = z.infer<typeof SkillRepo>

// A skill named by its repository: what a feature asks for in an agent's bundle.
export const SkillRef = z.object({ repo: SkillRepoId, skill: SkillName })
export type SkillRef = z.infer<typeof SkillRef>

// What an update would bring: the commit it would move to, how far behind, and the skills there.
export const SkillUpdateCheck = z.object({ id: SkillRepoId, current: CommitSha, latest: CommitSha, behind: z.number().int().nonnegative(), skills: z.array(SkillEntry) })
export type SkillUpdateCheck = z.infer<typeof SkillUpdateCheck>

// A repository Antumi suggests, with what the user should know before installing third-party code.
export const RecommendedSkillRepo = z.object({ url: z.string(), name: z.string(), description: z.string(), license: z.string(), homepage: z.string(), skills: z.array(SkillName) })
export type RecommendedSkillRepo = z.infer<typeof RecommendedSkillRepo>
