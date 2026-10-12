import { useRef } from 'react'
import { CloseIcon, SearchIcon } from './icons'

// A sidebar section's search. The query is null while the box is closed, so an open empty box
// still shows; the section owns it and decides what matches.
export function SidebarSearchToggle({ label, query, onToggle }: { label: string; query: string | null; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="icon-button sidebar-tool sidebar-search-toggle"
      aria-label={label}
      aria-pressed={query !== null}
      data-tooltip={label}
      onClick={onToggle}
    >
      <SearchIcon />
    </button>
  )
}

export function SidebarSearchField({ label, placeholder, query, onChange }: {
  label: string
  placeholder: string
  query: string
  onChange: (query: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="sidebar-search">
      <SearchIcon />
      <input
        ref={input}
        className="input"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onChange(null)
        }}
        placeholder={placeholder}
        aria-label={label}
        autoFocus
      />
      {/* Clears the words and keeps the box open for new ones; Esc closes it. */}
      {query !== '' && (
        <button
          type="button"
          className="sidebar-search-clear"
          aria-label="清空"
          title="清空"
          onClick={() => {
            onChange('')
            input.current?.focus()
          }}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}
