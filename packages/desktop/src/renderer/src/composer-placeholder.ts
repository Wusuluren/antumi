import { PRIMARY_KEY_LABEL } from './shortcut-keys'

// What the input says while the agent works: what Enter does then, and, where the agent takes a
// message into the running turn, the key that puts it there (⌘ on a Mac, Ctrl+ elsewhere).
export function workingPlaceholder({ awaiting, queueable, steerable }: { awaiting: boolean; queueable: boolean; steerable: boolean }, primaryKey = PRIMARY_KEY_LABEL): string {
  if (!queueable) return awaiting ? '先回答上面的请求' : 'Agent 正在处理，可以先写下一条；Esc 中断'
  return `${awaiting ? '先回答上面的请求，' : ''}也可以写下一条，Enter 排到回合结束后发送${steerable ? `，${primaryKey}Enter 立刻插入` : ''}；Esc 中断`
}
