import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'
import { canHaveHelper, LANGUAGE_NAMES, type Conversation, type ResolvedFile } from '@antumi/protocol'
import { handToHelper } from '../helper-conversations'
import { useCore, useTranslateSupported } from '../core-store'
import { usePreferences } from '../preferences'
import { translate, translationKey, useTranslations } from '../translation'
import { canRevealFile } from '../desktop-bridge'
import { copyFileText, filePreviewSupported, showChatFile, type ChatFileScope } from '../file-actions'
import { linkTarget, type FileReference } from '../file-links'
import { copyRegionText } from './ChatCopyRegion'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { FileMenuItems } from './FileMenu'
import { CodeIcon, CopyIcon, DocumentIcon, FolderIcon, LinkIcon, RefreshIcon, SparkIcon, TranslateIcon } from './icons'
import { Spinner } from './Spinner'

export const ChatFilesContext = createContext<ChatFileScope | null>(null)
export function useChatFiles(): ChatFileScope | null { return useContext(ChatFilesContext) }

// `translating`: the selection, once the user asked for it in their language; the menu then shows that.
type Menu = { at: MenuPoint; selection: string; text: string; code: string | null; href: string | null; reference: FileReference | null; file: ResolvedFile | null; resolving: boolean; error: string | null; translating?: string }

export function selectedChatText(root: HTMLElement): string {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return ''
  return selection.toString()
}

export function useChatContextMenu(list: RefObject<HTMLDivElement | null>, scope: ChatFileScope) {
  const parent = useCore((state) => state.conversations[scope.conversationId])
  const [menu, setMenu] = useState<Menu | null>(null)
  const translateSupported = useTranslateSupported()
  const sequence = useRef(0)
  const close = useCallback(() => { sequence.current++; setMenu(null) }, [])
  useEffect(() => { close(); return () => { sequence.current++ } }, [scope.conversationId, close])
  const openMenu = (target: Element, at: MenuPoint) => {
    if (!list.current) return
    const path = target.closest<HTMLElement>('[data-file-path]')?.dataset.filePath
    const reference = path ? { path, line: Number(target.closest<HTMLElement>('[data-file-line]')?.dataset.fileLine) || null } : null
    const href = target.closest<HTMLAnchorElement>('a[href]')?.getAttribute('href') ?? null
    const code = target.closest('.chat-code pre')
    const state: Menu = {
      at, selection: selectedChatText(list.current), text: copyRegionText(target, list.current) ?? '',
      code: code?.textContent?.replace(/\n$/, '') ?? null,
      href: href && ['web', 'app'].includes(linkTarget(href)?.kind ?? '') ? href : null,
      reference, file: null, resolving: reference !== null && filePreviewSupported(), error: null
    }
    const current = ++sequence.current
    setMenu(state)
    const rpc = useCore.getState().rpc
    if (reference && state.resolving && rpc) void rpc.call('files.resolve', { conversationId: scope.conversationId, path: reference.path }).then((file) => {
      if (sequence.current === current) setMenu({ ...state, file, resolving: false, error: file ? null : '找不到文件' })
    }, () => { if (sequence.current === current) setMenu({ ...state, resolving: false, error: '无法访问文件' }) })
  }
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return
    event.preventDefault()
    openMenu(event.target, menuPoint(event, event.target.closest<HTMLElement>('button, .chat-entry') ?? event.currentTarget))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) || !(event.target instanceof Element)) return
    event.preventDefault()
    const box = (event.target.closest<HTMLElement>('button, .chat-entry') ?? event.currentTarget).getBoundingClientRect()
    openMenu(event.target, { x: box.left + 12, y: box.bottom })
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const mac = window.antumi?.platform === 'darwin' || navigator.userAgent.includes('Mac')
    if (event.button === 2 || (mac && event.ctrlKey)) event.preventDefault()
  }
  const copy = (text: string) => { close(); void copyFileText(text) }
  const content = menu && (menu.translating !== undefined
    ? <ContextMenu at={menu.at} scrollBoundary={list.current} label="选中内容的翻译" onClose={close}>
      <SelectionTranslation conversationId={scope.conversationId} text={menu.translating} onClose={close} />
    </ContextMenu>
    : <ContextMenu at={menu.at} scrollBoundary={list.current} label="聊天内容" onClose={close}>
    <HandToHelperItem parent={parent} selection={menu.selection} inspector={scope.inspector} onClose={close} />
    {menu.selection.trim() && translateSupported && <MenuItem label="翻译" icon={<TranslateIcon />} onSelect={() => setMenu({ ...menu, translating: menu.selection.trim() })} />}
    {menu.selection && <MenuItem label="复制选中内容" icon={<CopyIcon />} onSelect={() => copy(menu.selection)} />}
    {menu.text && <MenuItem label="复制所在内容" icon={<DocumentIcon />} onSelect={() => copy(menu.text)} />}
    {menu.code !== null && <MenuItem label="复制代码" icon={<CodeIcon />} onSelect={() => copy(menu.code ?? '')} />}
    {menu.href && <MenuItem label="复制链接" icon={<LinkIcon />} onSelect={() => copy(menu.href ?? '')} />}
    {menu.file && <FileMenuItems scope={scope} file={menu.file} line={menu.reference?.line} onClose={close} />}
    {menu.reference && !filePreviewSupported() && canRevealFile() && <MenuItem label="在文件管理器中显示" icon={<FolderIcon />} onSelect={() => { close(); if (menu.reference) void showChatFile(scope, menu.reference) }} />}
    {menu.resolving && <div className="menu-label" role="status">正在查找文件…</div>}
    {menu.error && <div className="menu-label" role="status">{menu.error}</div>}
    {!menu.selection && !menu.text && menu.code === null && !menu.reference && !menu.href && <MenuItem label="没有可复制的内容" disabled onSelect={close} />}
  </ContextMenu>)
  return { onContextMenu, onKeyDown, onPointerDown, menu: content, open: menu !== null }
}

// A passage the user selected, put into their language by the conversation's agent's small model,
// where the menu was: kept by its text, so the same words are not asked for twice.
export function SelectionTranslation({ conversationId, text, onClose }: { conversationId: string; text: string; onClose: () => void }) {
  const to = usePreferences((preferences) => preferences.translateTo)
  const agent = useCore((state) => state.conversations[conversationId]?.agent)
  const model = usePreferences((preferences) => (agent ? preferences.quickModels[agent] : undefined)) ?? ''
  const key = translationKey(conversationId, `selection:${text}`, to, model)
  const result = useTranslations((state) => state.results[key])
  useEffect(() => { void translate(conversationId, key, text, to, model) }, [conversationId, key, text, to, model])
  return <>
    <div className="menu-label">译成{LANGUAGE_NAMES[to]}{result?.state === 'done' && result.model ? ` · 由 ${result.model} 翻译` : ''}</div>
    <div className="selection-translation" role="status" data-failed={result?.state === 'failed' || undefined}>
      {result?.state === 'done' ? result.text : result?.state === 'failed' ? result.error : <><Spinner />翻译中…</>}
    </div>
    {result?.state === 'done' && <MenuItem label="复制译文" icon={<CopyIcon />} onSelect={() => { onClose(); void copyFileText(result.text) }} />}
    {result?.state === 'failed' && <MenuItem label="重试" icon={<RefreshIcon />} onSelect={() => void translate(conversationId, key, text, to, model)} />}
  </>
}

export function HandToHelperItem({ parent, selection, inspector, onClose }: {
  parent: Conversation | undefined
  selection: string
  inspector: 'task' | 'conversation'
  onClose: () => void
}) {
  const supported = useCore((state) => state.rpc?.features.includes('conversation-helper') ?? false)
  if (!selection.trim() || !supported || !parent || !canHaveHelper(parent)) return null
  return <MenuItem label="交给小助手" icon={<SparkIcon />} onSelect={() => { document.getSelection()?.removeAllRanges(); onClose(); void handToHelper(parent, selection, inspector) }} />
}
