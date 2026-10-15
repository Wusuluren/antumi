import type { ChatItem, ChatToolStatus } from '@antumi/protocol'
import { toolIconKind, type ToolIconKind } from '../chat-tools'
import { BookIcon, BranchIcon, GearIcon, GlobeIcon, ImageIcon, ListIcon, PencilIcon, SearchIcon, TerminalIcon } from './icons'

function BrowserControlIcon() {
  return <span className="chat-browser-mark"><span className="chat-browser-mark-cursor" /></span>
}

const ICONS = {
  read: BookIcon,
  edit: PencilIcon,
  terminal: TerminalIcon,
  search: SearchIcon,
  browser: GlobeIcon,
  'browser-control': BrowserControlIcon,
  image: ImageIcon,
  agent: BranchIcon,
  list: ListIcon,
  tool: GearIcon
} satisfies Record<ToolIconKind, () => React.JSX.Element>

export function ChatToolIcon({ name, display, status }: { name: string; display?: Extract<ChatItem, { kind: 'tool' }>['display']; status: ChatToolStatus }) {
  const kind = toolIconKind(name, display)
  const Icon = ICONS[kind]
  return <span className="chat-tool-icon" data-kind={kind} data-status={status} aria-hidden="true"><Icon /></span>
}
