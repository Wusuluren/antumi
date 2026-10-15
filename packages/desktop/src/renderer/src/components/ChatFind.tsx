import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { chatFindRanges, nextFindIndex } from '../chat-find'
import { hasPrimaryModifier } from '../shortcut-keys'
import { ArrowDownIcon, CloseIcon, SearchIcon } from './icons'

export type ChatHistoryResult = 'loaded' | 'done' | 'failed'

export function useChatFindState(id: string) {
  const [state, setState] = useState({ id, open: false, query: '' })
  const setOpen = useCallback((open: boolean) => setState((previous) => ({ id, open, query: previous.id === id && open ? previous.query : '' })), [id])
  const setQuery = useCallback((query: string) => setState({ id, open: true, query }), [id])
  const open = state.id === id && state.open
  const query = state.id === id ? state.query : ''
  return { open, query, searching: open && Boolean(query.trim()), setOpen, setQuery }
}

function ownsShortcut(scope: HTMLElement | null, target: EventTarget | null): boolean {
  if (!scope?.getClientRects().length) return false
  if (target instanceof Element && target.closest('.side-panel, .utility-panel-dock, .xterm, dialog, [role="dialog"], [role="menu"]')) return false
  return ![...document.querySelectorAll('dialog[open], [role="dialog"], [role="menu"]')].some((element) => element.getClientRects().length > 0)
}

export function ChatFind({ state, scope, container, onOpen, loadOlder, hasOlder = false }: {
  state: ReturnType<typeof useChatFindState>
  scope: RefObject<HTMLElement | null>
  container: RefObject<HTMLElement | null>
  onOpen: () => void
  loadOlder?: () => Promise<ChatHistoryResult>
  hasOlder?: boolean
}) {
  const { open, query, setOpen, setQuery } = state
  const input = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const matches = useRef<Range[]>([])
  const current = useRef(0)
  const [result, setResult] = useState({ index: 0, count: 0 })
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  const mark = useCallback(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
    CSS.highlights.set('antumi-chat-find', new Highlight(...matches.current))
    const active = matches.current[current.current]
    const highlight = new Highlight(...(active ? [active] : []))
    highlight.priority = 1
    CSS.highlights.set('antumi-chat-find-current', highlight)
  }, [])
  const scroll = useCallback(() => {
    const range = matches.current[current.current]
    const list = container.current
    if (!range || !list) return
    // Tool output, code and thoughts can each scroll inside the chat list.
    for (let element = range.startContainer.parentElement; element && element !== list; element = element.parentElement) {
      const style = getComputedStyle(element)
      const bounds = range.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      if (/auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
        element.scrollTop += bounds.top - box.top - element.clientHeight / 2 + bounds.height / 2
      }
      if (/auto|scroll/.test(style.overflowX) && (bounds.left < box.left || bounds.right > box.right)) {
        element.scrollLeft += bounds.left - box.left - element.clientWidth / 2 + bounds.width / 2
      }
    }
    const bounds = range.getBoundingClientRect()
    list.scrollTo({ top: list.scrollTop + bounds.top - list.getBoundingClientRect().top - list.clientHeight / 2 + bounds.height / 2 })
  }, [container])
  const next = useCallback((direction: number) => {
    current.current = nextFindIndex(current.current, direction, matches.current.length)
    setResult({ index: current.current, count: matches.current.length })
    mark()
    scroll()
  }, [mark, scroll])
  const close = useCallback(() => {
    setOpen(false)
    if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
  }, [setOpen])

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !ownsShortcut(scope.current, event.target)) return
      const primary = hasPrimaryModifier(event) && !event.altKey
      if (primary && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        event.stopPropagation()
        if (!open) {
          previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          const selected = document.getSelection()
          if (selected?.anchorNode && container.current?.contains(selected.anchorNode)) {
            const text = selected.toString()
            if (text.trim() && text.length <= 256) setQuery(text)
          }
        }
        onOpen()
        setOpen(true)
        requestAnimationFrame(() => { input.current?.focus(); input.current?.select() })
      } else if (open && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (open && (event.key === 'F3' || (primary && event.key.toLowerCase() === 'g'))) {
        event.preventDefault()
        event.stopPropagation()
        next(event.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  }, [scope, container, open, setOpen, setQuery, onOpen, close, next])

  useEffect(() => {
    const list = container.current
    matches.current = []
    current.current = 0
    setResult({ index: 0, count: 0 })
    if (!open || !list || !query.trim()) return
    let frame = 0
    let first = true
    const refresh = () => {
      const active = matches.current[current.current]
      const ranges = chatFindRanges(list, query)
      const preserved = active ? ranges.findIndex((range) => range.startContainer === active.startContainer && range.startOffset === active.startOffset) : -1
      current.current = preserved >= 0 ? preserved : Math.min(current.current, Math.max(0, ranges.length - 1))
      matches.current = ranges
      setResult({ index: current.current, count: ranges.length })
      mark()
      if (first && ranges.length) { first = false; scroll() }
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh) }
    const observer = new MutationObserver(schedule)
    observer.observe(list, { childList: true, characterData: true, subtree: true })
    const debounce = setTimeout(schedule, 150)
    return () => { clearTimeout(debounce); cancelAnimationFrame(frame); observer.disconnect() }
  }, [open, query, container, mark, scroll])

  useEffect(() => {
    return () => {
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        CSS.highlights.delete('antumi-chat-find')
        CSS.highlights.delete('antumi-chat-find-current')
      }
    }
  }, [open, query])

  useEffect(() => {
    if (!open || !query.trim() || !hasOlder || !loadOlder) { setLoading(false); setFailed(false); return }
    let cancelled = false
    setLoading(true)
    setFailed(false)
    const load = async () => {
      try {
        while (!cancelled) {
          const result = await loadOlder()
          if (result !== 'loaded') { if (!cancelled) setFailed(result === 'failed'); break }
        }
      } catch { if (!cancelled) setFailed(true) }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [open, query, hasOlder, loadOlder, retry])

  if (!open) return null
  return (
    <div className="chat-find" role="search" aria-label="当前聊天搜索">
      <div className="chat-find-bar">
        <SearchIcon />
        <input ref={input} className="chat-find-input" type="search" aria-label="搜索当前聊天" placeholder="搜索当前聊天" value={query}
          title="搜索时临时展开折叠内容，并加载更早的聊天记录"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); next(event.shiftKey ? -1 : 1) }
          }} />
        <span className="chat-find-count" role="status" aria-live="polite">{loading ? '加载中…' : `${result.count ? result.index + 1 : 0} / ${result.count}`}</span>
        <button type="button" className="tool-button chat-find-previous" aria-label="上一个结果" data-tooltip="上一个结果（Shift+Enter）" disabled={!result.count} onClick={() => next(-1)}><ArrowDownIcon /></button>
        <button type="button" className="tool-button" aria-label="下一个结果" data-tooltip="下一个结果（Enter）" disabled={!result.count} onClick={() => next(1)}><ArrowDownIcon /></button>
        <button type="button" className="tool-button" aria-label="关闭搜索" data-tooltip="关闭搜索（Esc）" onClick={close}><CloseIcon /></button>
      </div>
      {failed && <div className="chat-find-error" role="status">更早的聊天记录读取失败。<button type="button" className="link-button" onClick={() => setRetry((value) => value + 1)}>重试</button></div>}
    </div>
  )
}
