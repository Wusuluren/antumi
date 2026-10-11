import { AGENT_KINDS, agentDescriptor, isAgentKind, type EnvironmentCheck, type EnvironmentProblem, type EnvironmentTool } from '@kando/protocol'
import { agentLabel } from './labels'

export function toolLabel(tool: EnvironmentTool): string {
  return isAgentKind(tool) ? agentLabel(tool) : 'Git'
}

// The platform picks the package manager.
export const GIT_INSTALL_HINT = window.kando?.platform === 'darwin' ? 'xcode-select --install' : '用系统的包管理器安装 git'

// Every agent Kando runs, as a sentence names them: "A、B 或 C".
export function agentNames(): string {
  const labels = AGENT_KINDS.map(agentLabel)
  return labels.length > 1 ? `${labels.slice(0, -1).join('、')} 或 ${labels.at(-1)}` : labels.join('')
}

export function checkStatusText(check: EnvironmentCheck): string {
  if (check.status === 'missing') return '未安装'
  const outdated = isAgentKind(check.tool) ? agentDescriptor(check.tool).environment.outdated : undefined
  if (check.status === 'unknown') return outdated && check.version ? `${outdated.status}（${check.version}）` : '已找到，版本未知'
  return check.version ? `已安装 ${check.version}` : '已安装'
}

export function signedInText(check: EnvironmentCheck): string | null {
  if (check.signedIn === null) return null
  return check.signedIn ? '已登录' : '未登录'
}

// One line for the sidebar: the first thing to fix.
export function problemText(problem: EnvironmentProblem): string {
  switch (problem.code) {
    case 'git-missing':
      return '没有找到 Git，任务建不了 worktree'
    case 'no-agent':
      return `没有找到 ${agentNames()}`
    case 'no-signed-in-agent':
      return '装了 Agent，但都还没登录'
    case 'signed-out':
      return `${toolLabel(problem.tool)} 还没登录`
  }
}
