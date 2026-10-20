import type { AgentDescriptor } from './agent-descriptor'

// Antumi's modes are OpenCode's primary agents: ask is its Build agent, which allows every tool
// unless the user's config says otherwise, plan its Plan agent, and readOnly one Antumi adds at
// launch, since its Plan agent still runs shell commands.
export const opencode: AgentDescriptor = {
  translations: { en: {
    modes: {
      ask: { label: 'Build', description: "OpenCode's Build agent, under your OpenCode permission rules (by default it asks nothing)" },
      plan: { label: 'Plan', description: 'Explore code and plan without editing files' },
      readOnly: { label: 'Read only', description: 'Read files without modifying them; asks before running commands' }
    },
    environment: { role: 'Runs with `opencode acp` in chat. Other Agents can be used without it.', install: 'npm install -g @opencode/cli', signIn: 'Run opencode auth login in a terminal to add a model provider', outdated: { status: 'Requires OpenCode 2', hint: ', version 2 or later' } },
    usageWhere: "Check with your model provider"
  } },
  label: 'OpenCode',
  cli: 'opencode',
  modes: {
    ask: { label: 'Build', description: 'OpenCode 的 Build agent，按你的 OpenCode 权限配置执行（默认什么都不问）' },
    plan: { label: 'Plan', description: '探索代码、制定计划，不修改文件' },
    readOnly: { label: '只读', description: '只能读，不能修改文件；运行命令前先问你' }
  },
  startModes: ['ask', 'plan', 'readOnly'],
  defaultStartMode: 'ask',
  discussionMode: 'readOnly',
  readOnlyMode: 'readOnly',
  capabilities: { unattended: false, bypass: false, autoMode: false, pathMentions: false, optionsWhileBusy: false, skills: true, userMcp: true },
  environment: {
    role: '聊天界面以 `opencode acp` 运行它；没装也可以使用其他 Agent。',
    install: 'npm install -g @opencode/cli',
    signIn: '在终端里运行 opencode auth login 添加模型服务商',
    outdated: { status: '需要 OpenCode 2', hint: '，并使用 2.0 以上版本' }
  },
  usageWhere: '在所用模型服务商处查看'
}
