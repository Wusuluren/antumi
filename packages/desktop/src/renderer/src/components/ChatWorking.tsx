import { useEffect, useState } from 'react'
import { formatTokens, workedFor } from '../chat-tools'
import { useTick } from '../chat-motion'

// What kind of thing the agent is at, when nothing more specific is known.
export type WorkingPhase = 'tools' | 'thinking' | 'replying' | 'waiting' | 'asking' | 'working'
const PHASE: Record<WorkingPhase, string> = { tools: '运行工具', thinking: '思考', replying: '写回复', waiting: '等待', asking: '等你回答', working: '处理' }

// What the agent is at, at a glance: thinking, running a tool, writing the reply, waiting on work it
// left in the background, or on the user. Keyed by phase, so each starts its motion afresh. The
// brain is Lucide's (ISC licence).
function PhaseIcon({ phase }: { phase: WorkingPhase }) {
  const icon = (() => {
    switch (phase) {
      case 'tools':
        return (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle className="chat-working-gear-teeth" cx="8" cy="8" r="5.6" strokeWidth="2.2" />
            <circle cx="8" cy="8" r="4.1" strokeWidth="1.3" />
            <circle cx="8" cy="8" r="1.4" strokeWidth="1.2" />
          </svg>
        )
      case 'replying':
        return (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path className="chat-working-line" d="M2.5 4h11" />
            <path className="chat-working-line" d="M2.5 8h11" />
            <path className="chat-working-line" data-short="" d="M2.5 12h7" />
          </svg>
        )
      case 'waiting':
        return (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
            <path d="M4 2h8M4 14h8M5 2c0 3 3 4 3 6s-3 3-3 6M11 2c0 3-3 4-3 6s3 3 3 6" />
            <path d="M6.2 12.8 8 11l1.8 1.8Z" fill="currentColor" stroke="none" />
          </svg>
        )
      case 'asking':
        return <span className="chat-working-ask" />
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375M6.003 5.125A3 3 0 0 0 6.401 6.5M3.477 10.896a4 4 0 0 1 .585-.396M19.938 10.5a4 4 0 0 1 .585.396M6 18a4 4 0 0 1-1.967-.516M19.967 17.484A4 4 0 0 1 18 18" />
            <path className="chat-working-signal" d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
            <circle className="chat-working-spark" cx="7" cy="9" r="1.3" stroke="none" />
            <circle className="chat-working-spark" cx="17" cy="9.5" r="1.3" stroke="none" />
            <circle className="chat-working-spark" cx="12" cy="15.5" r="1.3" stroke="none" />
          </svg>
        )
    }
  })()
  return <span key={phase} className="chat-working-icon" data-phase={phase} aria-hidden="true">{icon}</span>
}

// While a turn runs, at the end of the conversation: the numbers that say how it goes, as Claude
// Code's own status reads: how long, how many tokens written, how many subagents out, and what
// kind of step this is. What the agent is at shows in the conversation itself, just above. The
// clock ticks for the eye only; a screen reader hears the phase, not every second.
export function ChatWorking({ phase, tokens, background, since }: {
  phase: WorkingPhase
  // Output tokens the turn has written so far, where the agent reports them as it goes.
  tokens: number | null
  // What works in the background: subagents, and commands run there.
  background: { subagents: number; commands: number }
  since: number | null
}) {
  const [started] = useState(() => since ?? Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  // With the turn over and only background work out, it is the step: "后台运行中：2 个子 Agent、1 个命令".
  // While the turn itself runs, it is a count beside its step.
  const out = [
    background.subagents > 0 ? `${background.subagents} 个子 Agent` : null,
    background.commands > 0 ? `${background.commands} 个命令` : null
  ].filter((part): part is string => part !== null).join('、')
  const waiting = phase === 'waiting' && out !== ''
  // The count of tokens ticks up as the agent writes: each change lands with a small motion.
  const tick = useTick(tokens)
  const parts = [
    workedFor(Math.max(0, now - (since ?? started))),
    ...(tokens !== null && tokens > 0 ? [<>↓ <span key={tick ?? 0} className="chat-working-tick">{formatTokens(tokens)}</span></>] : []),
    ...(out && !waiting ? [`后台：${out}`] : [])
  ]
  const step = waiting ? `后台运行中：${out}` : `${PHASE[phase]}${phase === 'asking' ? '' : '中…'}`
  return (
    <div className="chat-working" role="status">
      <PhaseIcon phase={phase} />
      {parts.map((part, index) => (
        <span key={index} className="chat-working-part" aria-hidden="true">
          {index > 0 && <span className="chat-working-dot">·</span>}
          {part}
        </span>
      ))}
      <span className="chat-working-part"><span className="chat-working-dot" aria-hidden="true">·</span><span className={phase === 'asking' ? undefined : 'chat-sheen chat-working-sheen'}>{step}</span></span>
    </div>
  )
}
