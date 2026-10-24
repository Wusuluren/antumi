import { knowledgeBaseKind, type KnowledgeBase, type RecommendedSkillRepo, type SkillRef } from '@antumi/protocol'

// A short list, not a marketplace: what Antumi's own features build on, and what it stands behind.
export const RECOMMENDED_SKILL_REPOS: readonly RecommendedSkillRepo[] = [
  {
    url: 'https://github.com/kepano/obsidian-skills',
    name: 'Obsidian',
    description: 'Obsidian 官方维护：Obsidian 风格的 Markdown（双链、嵌入、callout、属性）、Bases、Canvas 和命令行。Obsidian 知识库允许写入时，Agent 带上其中的 obsidian-markdown。',
    license: 'MIT',
    homepage: 'https://github.com/kepano/obsidian-skills',
    skills: ['obsidian-markdown', 'obsidian-bases', 'json-canvas', 'obsidian-cli', 'defuddle', 'knap']
  },
  {
    url: 'https://github.com/cathrynlavery/diagram-design',
    name: 'Diagram Design',
    description: '生成架构图、流程图、时序图和数据模型图，输出可独立打开的 HTML + SVG，支持按品牌配色与字体定制。',
    license: 'MIT',
    homepage: 'https://github.com/cathrynlavery/diagram-design',
    skills: ['diagram-design']
  }
]

const OBSIDIAN_SKILLS = [{ repo: 'kepano-obsidian-skills', skill: 'obsidian-markdown' }] as const

export function knowledgeBaseSkills(base: KnowledgeBase | null): readonly SkillRef[] {
  return base?.write && knowledgeBaseKind(base) === 'obsidian' ? OBSIDIAN_SKILLS : []
}
