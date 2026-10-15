import { DEFAULT_DISCUSSION_REQUIREMENTS } from '@antumi/protocol'

export const DISCUSSION_REQUIREMENT_PRESETS = [
  { id: 'concise', label: '简洁讨论', description: '观点具体、说明理由，每次尽量在 600 字以内', text: DEFAULT_DISCUSSION_REQUIREMENTS },
  { id: 'compare', label: '方案对比', description: '比较收益、成本、风险和适用条件', text: [
    '- 列出主要可选方案，比较各自的收益、成本、风险和适用条件。',
    '- 区分已知事实与假设；不确定的地方明确说明。',
    '- 最后给出推荐方案、理由，以及需要进一步验证的问题。'
  ].join('\n') },
  { id: 'deep', label: '深入分析', description: '充分论证，列出证据、反例与不确定性', text: [
    '- 根据问题需要充分展开，不限制篇幅。',
    '- 给出论据与证据；引用项目代码时注明文件和行号。',
    '- 主动检查反例、边界条件与替代解释，明确不确定性。',
    '- 总结关键结论、分歧和仍需验证的问题。'
  ].join('\n') }
] as const
