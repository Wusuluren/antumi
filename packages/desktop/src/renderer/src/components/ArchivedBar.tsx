import { useState } from 'react'
import { AntMotion } from './AntMotion'

// Where an archived chat's input was: it is read-only, and this is the way back. `fresh` when the
// user archived it just now, in this view.
export function ArchivedBar({ what, fresh = false, onRestore }: { what: string; fresh?: boolean; onRestore: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const restore = async () => {
    setBusy(true)
    await onRestore()
    setBusy(false)
  }
  return (
    <div className="chat-archived" role="status">
      <span className="chat-archived-note">{fresh && <AntMotion action="throw" size="inline" />}<span>这个{what}已归档，只能查看。</span></span>
      <button type="button" className="button" disabled={busy} onClick={() => void restore()}>取消归档</button>
    </div>
  )
}
