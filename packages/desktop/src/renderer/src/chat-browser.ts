import { browserToolKind, parseBrowserPage, parseClosedTab, type BrowserTab, type ChatItem } from '@antumi/protocol'

type ToolItem = Extract<ChatItem, { kind: 'tool' }>
export type RunTab = Pick<BrowserTab, 'id' | 'url' | 'title'>
export type RunTabs = { open: RunTab[]; current: RunTab | null; closed: number }

// The tabs a turn's browser calls leave: each at the last page a successful call reported, in the
// order they first came up, less the ones it closed. The tab acted on last is current.
export function browserRunTabs(tools: readonly ToolItem[]): RunTabs {
  const pages = new Map<string, RunTab>()
  const closed = new Set<string>()
  let current: string | null = null
  for (const item of tools) {
    if (!browserToolKind(item.name) || item.status !== 'done' || !item.output) continue
    const gone = parseClosedTab(item.output)
    if (gone) {
      pages.delete(gone)
      closed.add(gone)
      if (current === gone) current = null
      continue
    }
    const page = parseBrowserPage(item.output)
    if (!page) continue
    pages.set(page.id, page)
    current = page.id
  }
  const open = [...pages.values()]
  return { open, current: (current ? pages.get(current) : open.at(-1)) ?? null, closed: closed.size }
}

// The host a URL names, with its path; the URL itself when it is not one.
export function hostLine(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.host ? `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}` : url
  } catch {
    return url
  }
}
