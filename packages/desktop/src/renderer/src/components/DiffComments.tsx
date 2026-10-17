import { createContext, Fragment, useEffect, useMemo, useState } from 'react'
import { addQuote, removeQuote, useQuotes, type ChatQuote } from '../chat-quotes'
import { diffQuoteText, diffRowId, diffRows } from '../unified-diff'
import { CloseIcon } from './icons'

// The chat a diff's comments go to, from the inspector that shows it; null where there is none
// (a terminal task), and the diff stays read-only.
export const DiffCommentConversation = createContext<string | null>(null)

// The rows picked to comment on: where the pick began and where it reaches, in one hunk.
type LinePick = { hunk: number; origin: number; reach: number }

// A diff whose lines take comments: a line's number picks it, Shift picks on to another in its hunk,
// and what the user says joins the chat's quotes, to go with their next message. diffKey names the
// diff across reloads, so the lines a waiting comment is on stay marked.
export function CommentableDiff({ patch, path, conversationId, diffKey }: {
  patch: string
  path: string
  conversationId: string
  diffKey: string
}) {
  const rows = useMemo(() => diffRows(patch), [patch])
  const ids = useMemo(() => rows.map(diffRowId), [rows])
  const quotes = useQuotes(conversationId)
  const comments = quotes.filter((quote) => quote.anchor?.diff === diffKey)
  const [pick, setPick] = useState<LinePick | null>(null)
  const [note, setNote] = useState('')
  useEffect(() => setPick(null), [patch])

  const commented = new Set(comments.flatMap((quote) => quote.anchor?.rows ?? []))
  // Each comment shows under the last line it is on, while that line is still in the diff.
  const below = new Map<number, ChatQuote[]>()
  for (const quote of comments) {
    const last = quote.anchor?.rows.at(-1)
    const at = last === undefined ? -1 : ids.indexOf(last)
    if (at >= 0) below.set(at, [...below.get(at) ?? [], quote])
  }
  const from = pick ? Math.min(pick.origin, pick.reach) : -1
  const to = pick ? Math.max(pick.origin, pick.reach) : -1

  const choose = (index: number, extend: boolean) => {
    const hunk = rows[index]?.hunk
    if (hunk === null || hunk === undefined) return
    if (extend && pick && pick.hunk === hunk) {
      setPick({ ...pick, reach: index })
      return
    }
    setPick({ hunk, origin: index, reach: index })
    setNote('')
  }
  const submit = () => {
    const chosen = rows.slice(from, to + 1).filter((row) => row.hunk !== null)
    if (chosen.length === 0) return
    const anchored = chosen.flatMap((row) => diffRowId(row) ?? [])
    addQuote(conversationId, null, diffQuoteText(path, chosen), note, { diff: diffKey, rows: anchored })
    setPick(null)
  }

  return (
    <>
      <pre className="diff-view diff-view-commentable">
        {rows.map((row, index) => {
          const id = ids[index] ?? null
          const line = row.newLine ?? row.oldLine
          return (
            <Fragment key={index}>
              <div className={row.kind} data-picked={(index >= from && index <= to) || undefined} data-commented={(id !== null && commented.has(id)) || undefined}>
                <span className="diff-gutter">
                  {id !== null && (
                    <button
                      type="button"
                      className="diff-line-number"
                      data-old={row.newLine === null || undefined}
                      aria-label={`评论第 ${line} 行`}
                      title="评论这一行，按住 Shift 再点一行可以选一段"
                      // Shift would otherwise also stretch the page's text selection.
                      onMouseDown={(event) => event.shiftKey && event.preventDefault()}
                      onClick={(event) => choose(index, event.shiftKey)}
                    >
                      {line}
                    </button>
                  )}
                </span>
                {row.text || ' '}
              </div>
              {below.get(index)?.map((quote) => (
                <div key={quote.id} className="diff-comment">
                  <span className={quote.note ? 'diff-comment-note' : 'diff-comment-note muted'}>{quote.note || '只引用这段代码'}</span>
                  <button type="button" className="tool-button" aria-label="移除这条评论" data-tooltip="移除" onClick={() => removeQuote(conversationId, quote.id)}>
                    <CloseIcon />
                  </button>
                </div>
              ))}
              {pick && index === to && (
                <div className="diff-comment diff-comment-draft">
                  <input
                    autoFocus
                    value={note}
                    placeholder={from === to ? `对第 ${line} 行说点什么` : '对这几行说点什么'}
                    aria-label="评论"
                    onChange={(event) => setNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        submit()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        event.stopPropagation()
                        setPick(null)
                      }
                    }}
                  />
                  <button type="button" className="link-button" onClick={() => setPick(null)}>取消</button>
                  <button type="button" className="link-button" onClick={submit}>评论</button>
                </div>
              )}
            </Fragment>
          )
        })}
      </pre>
      {comments.length > 0 && <p className="inspector-empty muted">{comments.length} 条评论在输入框里，会随下一条消息发出。</p>}
    </>
  )
}
