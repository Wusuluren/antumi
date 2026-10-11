import type { AgentDescriptor } from './agent-descriptor'

// Its default mode reads "auto" to Codex users.
export const codex: AgentDescriptor = {
  label: 'Codex',
  cli: 'codex',
  modes: {
    ask: { label: '逐项确认', description: '每一步都先问你' },
    acceptEdits: { label: '自动', description: '在项目里自由修改，越界时才问' },
    plan: { label: '规划', description: '只读代码、给出计划，你确认后才动手' },
    readOnly: { label: '只读', description: '只能读，不能修改文件' },
    bypass: { label: '全部放行', description: '什么都不问，也不受沙箱限制' }
  },
  startModes: ['acceptEdits', 'ask', 'plan', 'readOnly'],
  defaultStartMode: 'acceptEdits',
  capabilities: { unattended: true, bypass: true, autoMode: false, pathMentions: false, optionsWhileBusy: true },
  environment: {
    role: '聊天界面以 `codex app-server` 运行它；没装也可以使用其他 Agent。',
    install: 'npm install -g @openai/codex',
    signIn: '在终端里运行 codex login'
  },
  usageWhere: '在 Codex 的用量设置里使用'
}
