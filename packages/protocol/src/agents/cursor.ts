import type { AgentDescriptor } from './agent-descriptor'

// Kando's modes carry Cursor's own names: ask is its Agent mode, readOnly its Ask mode.
export const cursor: AgentDescriptor = {
  label: 'Cursor',
  cli: 'agent',
  modes: {
    ask: { label: 'Agent', description: 'Cursor 原生 Agent 模式，审批按 CLI 提供的选项处理' },
    plan: { label: 'Plan', description: '先探索代码并制定计划，确认后执行' },
    readOnly: { label: 'Ask', description: 'Cursor 原生 Ask 模式，用于提问和理解代码' }
  },
  startModes: ['ask', 'plan', 'readOnly'],
  defaultStartMode: 'ask',
  discussionMode: 'readOnly',
  readOnlyMode: 'readOnly',
  capabilities: { unattended: false, bypass: false, autoMode: false, pathMentions: false, optionsWhileBusy: false },
  nativePlanRun: { hint: '使用 Cursor 原生 Agent 模式执行' },
  environment: {
    role: '聊天界面以 Cursor CLI 的 ACP 模式运行它；仅安装 Cursor 编辑器还不能执行任务。',
    install: '按照 cursor.com/docs/cli/installation 安装最新 Cursor CLI',
    signIn: '在终端里运行 agent login',
    outdated: { status: '需要升级以支持 ACP', hint: '，并使用支持 ACP 的版本' }
  },
  usageWhere: '在 Cursor 的用量设置里查看',
  windowsPathDirs: ['cursor-agent'],
  quickModels: [/flash/, /haiku/, /nano/, /mini/]
}
