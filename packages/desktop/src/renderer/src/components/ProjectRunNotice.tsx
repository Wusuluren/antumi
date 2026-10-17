import { showTerminal, useCore } from '../core-store'

// A project's setup or check that Antumi is running for this conversation: the agent waits on
// setup, and a task is not handed in until its check ends.
export function ProjectRunNotice({ conversationId }: { conversationId: string }) {
  const running = useCore((state) => state.terminals.find((terminal) => terminal.conversationId === conversationId && terminal.purpose && !terminal.exited))
  if (!running) return null
  const what = running.purpose === 'setup' ? '正在运行项目的 setup，完成后 Agent 才开始' : '正在运行项目的检查，通过后提交验收'
  return (
    <div className="chat-notice chat-notice-actionable project-run-notice" role="status">
      <span>{what}</span>
      <button type="button" className="button chat-notice-action" onClick={() => showTerminal(running.id)}>在终端面板里看</button>
    </div>
  )
}

export function useProjectCheckRunning(conversationId: string | null): boolean {
  return useCore((state) => conversationId !== null && state.terminals.some((terminal) => terminal.conversationId === conversationId && terminal.purpose === 'check' && !terminal.exited))
}
