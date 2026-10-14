import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { addQuote, useQuotes } from '../chat-quotes'
import { PLAN_SELECTION_MENU, placeCommentBox } from '../plan-comment-place'
import { selectedTextIn, type SelectedText } from '../text-selection'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { ChatIcon } from './icons'
import { useOccludesBrowser } from '../browser-occlusion'

// Where each comment's passage lies, by conversation and quote id, for its highlight. A range lasts
// while its text stays rendered; one whose text is gone simply marks nothing.
const passages = new Map<string, Map<string, Range>>()

function passagesOf(conversationId: string): Map<string, Range> {
  const known = passages.get(conversationId) ?? new Map<string, Range>()
  passages.set(conversationId, known)
  return known
}

type SelectionMenu = { at: MenuPoint; text: string }

function containsPoint(range: Range, x: number, y: number): boolean {
  return [...range.getClientRects()].some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
}

function mark(name: string, ranges: readonly Range[]): void {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
  if (ranges.length === 0) CSS.highlights.delete(name)
  else CSS.highlights.set(name, new Highlight(...ranges))
}

// Text selected in one region of the container (a plan, a reply) opens a box over it to say
// something about it. The comment joins the chat's quotes, as a quote the user picked would, and
// goes on from there the same way; the passages commented on stay marked while their quotes wait.
// name: which highlights it draws (kando-<name>-draft, kando-<name>-comments; see styles.css).
// focus: the box takes the focus as it opens, where a selection is made to comment on; elsewhere it
// waits for the user to type, so a selection made to copy still copies. copyMenu: right-click on
// the passage offers copying it, for a box that took the focus and with it the live selection.
export function SelectionComment({ conversationId, container, region, sourceOf, name, label, focus = false, copyMenu = false, hidden = false, onAdded }: {
  conversationId: string
  container: RefObject<HTMLElement | null>
  region: string
  sourceOf: (region: HTMLElement) => string | null
  name: string
  label: string
  focus?: boolean
  copyMenu?: boolean
  // Kept, but out of sight, while something else (the chat's own menu) is over the passage.
  hidden?: boolean
  onAdded?: () => void
}) {
  const [draft, setDraft] = useState<SelectedText | null>(null)
  const [comment, setComment] = useState('')
  const [menu, setMenu] = useState<SelectionMenu | null>(null)
  // Bumped when the container scrolls under a box being written in, which then follows its passage.
  const [, setMoved] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const menuWasOpen = useRef(false)
  const closeMenu = useCallback(() => setMenu(null), [])
  const quotes = useQuotes(conversationId)
  const draftName = `kando-${name}-draft`
  const commentedName = `kando-${name}-comments`

  // A new selection opens the box; with the box open, the focus in it must not close it.
  useEffect(() => {
    const element = container.current
    if (!element || draft) return
    const settle = () => setTimeout(() => {
      const picked = selectedTextIn(element, region)
      if (picked) {
        setComment('')
        setDraft(picked)
      }
    }, 0)
    document.addEventListener('mouseup', settle)
    element.addEventListener('keyup', settle)
    return () => {
      document.removeEventListener('mouseup', settle)
      element.removeEventListener('keyup', settle)
    }
  }, [container, region, draft])

  // The focus in the box takes the browser's live selection; the cloned range still says what was
  // chosen, for a right-click on it.
  useEffect(() => {
    const element = container.current
    if (!element || !copyMenu) return
    const open = (event: MouseEvent) => {
      const selected = selectedTextIn(element, region)
      const picked = selected ?? (draft && containsPoint(draft.range, event.clientX, event.clientY) ? draft : null)
      if (!picked) return
      event.preventDefault()
      setMenu({ at: { x: event.clientX, y: event.clientY }, text: picked.text })
    }
    element.addEventListener('contextmenu', open)
    return () => element.removeEventListener('contextmenu', open)
  }, [container, region, draft, copyMenu])

  // Without the focus, the first key typed while the passage is selected starts the comment.
  useEffect(() => {
    if (!draft || focus) return
    const type = (event: KeyboardEvent) => {
      if (document.activeElement === input.current || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') setDraft(null)
      else if (event.key.length === 1 || event.key === 'Process') input.current?.focus()
    }
    document.addEventListener('keydown', type, true)
    return () => document.removeEventListener('keydown', type, true)
  }, [draft, focus])

  useEffect(() => {
    mark(draftName, draft ? [draft.range] : [])
    return () => mark(draftName, [])
  }, [draft, draftName])

  // Of the quotes still waiting, the passages in this container.
  useEffect(() => {
    const element = container.current
    const live = new Set(quotes.map((quote) => quote.id))
    const known = passagesOf(conversationId)
    for (const id of known.keys()) if (!live.has(id)) known.delete(id)
    mark(commentedName, quotes.flatMap((quote) => {
      const range = known.get(quote.id)
      return range && element?.contains(range.commonAncestorContainer) ? [range] : []
    }))
  }, [quotes, commentedName, container, conversationId])
  useEffect(() => () => mark(commentedName, []), [commentedName])

  useEffect(() => {
    if (!draft) return
    const close = () => setDraft(null)
    const outside = (event: PointerEvent) => {
      if (event.button === 2 && containsPoint(draft.range, event.clientX, event.clientY)) return
      if (!(event.target instanceof Element && event.target.closest('.selection-comment-box, .context-menu'))) close()
    }
    // A box with nothing written yet goes with a scroll; one being written follows its passage.
    const scrolled = () => (comment ? setMoved((count) => count + 1) : close())
    const element = container.current
    document.addEventListener('pointerdown', outside, true)
    element?.addEventListener('scroll', scrolled)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      element?.removeEventListener('scroll', scrolled)
      window.removeEventListener('resize', close)
    }
  }, [draft, container, comment])

  // The menu takes focus while it is open. Closing it returns here, with the draft still written.
  useEffect(() => {
    if (menu) {
      menuWasOpen.current = true
      return
    }
    if (!menuWasOpen.current) return
    menuWasOpen.current = false
    input.current?.focus()
  }, [menu])

  const add = () => {
    if (!draft) return
    const id = addQuote(conversationId, sourceOf(draft.region), draft.text, comment)
    if (id) passagesOf(conversationId).set(id, draft.range)
    document.getSelection()?.removeAllRanges()
    setDraft(null)
    onAdded?.()
  }
  const bounds = container.current?.closest('.side-panel, .chat-view')?.getBoundingClientRect()
  const passage = draft?.range.getBoundingClientRect()
  const place = draft && passage ? placeCommentBox({
    passage,
    anchorX: draft.x,
    panel: bounds ? { left: bounds.left, right: bounds.right } : null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    menu: menu ? { at: menu.at, ...PLAN_SELECTION_MENU } : null
  }) : null
  useOccludesBrowser(Boolean(draft && place && !hidden))
  return (
    <>
      {draft && place && !hidden && createPortal(
        <div className="selection-comment-box" style={{ left: place.left, top: place.top }} role="dialog" aria-label={label}>
          <ChatIcon />
          <input
            ref={input}
            className="selection-comment-input"
            autoFocus={focus && !menu}
            value={comment}
            placeholder="评论这段…"
            aria-label="评论这段，回车加入引用"
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(null)
              }
            }}
          />
          <button type="button" className="selection-comment-save" aria-label="加入引用" data-tooltip="加入引用（Enter）" data-tooltip-side="top-end" onMouseDown={(event) => event.preventDefault()} onClick={add}>
            ↵
          </button>
        </div>,
        document.body
      )}
      {menu && (
        <ContextMenu at={menu.at} label="所选文字" onClose={closeMenu}>
          <MenuItem
            label="复制"
            onSelect={() => {
              closeMenu()
              void navigator.clipboard.writeText(menu.text).catch(() => {})
            }}
          />
        </ContextMenu>
      )}
    </>
  )
}
