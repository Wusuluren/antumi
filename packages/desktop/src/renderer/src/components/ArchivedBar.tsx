import { useState } from 'react'

// Where an archived chat's input was: it is read-only, and this is the way back.
export function ArchivedBar({ what, onRestore }: { what: string; onRestore: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const restore = async () => {
    setBusy(true)
    await onRestore()
    setBusy(false)
  }
  return (
    <div className="chat-archived" role="status">
      <span className="chat-archived-note">这个{what}已归档，只能查看。</span>
      <button type="button" className="button" disabled={busy} onClick={() => void restore()}>取消归档</button>
    </div>
  )
}
