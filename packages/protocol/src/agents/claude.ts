import type { AgentDescriptor } from './agent-descriptor'

export const claude: AgentDescriptor = {
  label: 'Claude Code',
  cli: 'claude',
  modes: {
    ask: { label: '逐项确认', description: '改文件、运行命令前都先问你' },
    acceptEdits: { label: '自动接受编辑', description: '改文件不再问，运行命令仍会问' },
    plan: { label: '规划', description: '只读代码、给出计划，你确认后才动手' },
    auto: { label: '自动判断', description: '由模型判断哪些操作要先问你' },
    bypass: { label: '全部放行', description: '什么都不问，也不受限制' }
  },
  startModes: ['ask', 'acceptEdits', 'plan'],
  defaultStartMode: 'auto',
  discussionMode: 'plan',
  readOnlyMode: 'ask',
  capabilities: { unattended: true, bypass: true, autoMode: true, pathMentions: true, optionsWhileBusy: true },
  environment: {
    role: '聊天界面以 `claude -p` 运行它；没装也可以只用 Codex。',
    install: 'npm install -g @anthropic-ai/claude-code',
    signIn: '在终端里运行 claude，按提示登录'
  },
  usageWhere: '在 claude.ai 网页版或 Claude Desktop 的 设置 → Usage 里使用',
  quickModels: [/^haiku$/]
}
