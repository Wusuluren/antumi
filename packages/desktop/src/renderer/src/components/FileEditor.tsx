import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import type { FileRead, ResolvedFile } from '@antumi/protocol'
import { useCore } from '../core-store'
import { canOpenWith } from '../desktop-bridge'
import type { ChatFileScope } from '../file-actions'
import { isImagePath } from '../file-links'
import { closedFile, dropFileDraft, EMPTY_FILE_TABS, expandedFolders, openedFile, revealedFile, revealedFolder, toggledFolder, updateFileTabs, useFileTabs, type FileTab } from '../file-tabs'
import { MAX_FILE_TREE_WIDTH, MIN_FILE_TREE_WIDTH, setPreference, usePreferences } from '../preferences'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { FileSource, type FileDisk, type FileSourceHandle } from './FileSource'
import { FileImage } from './FileImage'
import { FileTree } from './FileTree'
import { OpenWithButton } from './OpenWithButton'
import { useFocusCount } from './Inspector'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { FileMenu, FileMenuItems } from './FileMenu'
import { Segmented } from './SettingsControls'
import { CheckIcon, CloseIcon, MaximizeIcon, MoreIcon, RefreshIcon, RestoreIcon, SearchIcon, SidebarIcon } from './icons'

const REASON: Record<Extract<FileRead, { kind: 'unavailable' }>['reason'], string> = {
  'not-found': '文件不存在，可能已被移动或删除。',
  'is-directory': '这是一个目录，无法作为文本打开。',
  binary: '此文件不是 UTF-8 文本，暂不支持内置编辑。',
  'too-large': '文件超过 2 MiB，无法内置编辑。',
  unreadable: '无法读取文件，请检查访问权限。'
}

function FileContent({ scope, tab, wrap, writable, source, refresh, preview }: {
  scope: ChatFileScope; tab: FileTab; wrap: boolean; writable: boolean; source: RefObject<FileSourceHandle | null>; refresh: string; preview: boolean
}) {
  const { conversationId } = scope
  const rpc = useCore((state) => state.rpc)
  const [result, setResult] = useState<FileRead | null>(null)
  const [loading, setLoading] = useState(true)
  const path = tab.file.path
  useEffect(() => {
    if (!rpc) return
    let current = true
    setLoading(true)
    void rpc.call('files.read', { conversationId, path }).catch(() => ({ kind: 'unavailable', reason: 'unreadable' } as const)).then((read) => {
      if (current) { setResult(read); setLoading(false) }
    })
    return () => { current = false }
  }, [rpc, conversationId, path, refresh])
  const disk = useMemo<FileDisk | null>(() => result?.kind === 'text' ? { text: result.text, mtimeMs: result.mtimeMs ?? null } : null, [result])
  return <div className="file-editor-content" data-file-path={path} aria-busy={loading}>
    {disk
      ? <FileSource ref={source} scope={scope} tab={tab} disk={disk} wrap={wrap} writable={writable} preview={preview} />
      : result?.kind === 'unavailable' && preview && /\.svg$/i.test(path)
        ? <FileImage path={path} version={refresh} />
        : <p className="inspector-empty muted" role="status">{result?.kind === 'unavailable' ? REASON[result.reason] : '正在读取文件…'}</p>}
  </div>
}

// Where the file sits: its project, then its folders, the middle ones folded away when there are many.
function Breadcrumb({ file, onFolder }: { file: ResolvedFile; onFolder(folder: string): void }) {
  if (file.root === null || file.relative === null) return <div className="file-editor-crumbs mono" title={file.path}><span className="file-editor-crumb-current">{file.path}</span></div>
  const root = file.root
  const separator = file.path.charAt(root.length) || '/'
  const parts = file.relative.split(/[\\/]/)
  const folders = parts.slice(0, -1).map((name, index) => ({ name, path: [root, ...parts.slice(0, index + 1)].join(separator) }))
  const crumbs = [{ name: root.split(/[\\/]/).filter(Boolean).at(-1) ?? root, path: root }, ...folders]
  const shown = crumbs.length > 4 ? [crumbs[0], null, ...crumbs.slice(-2)] : crumbs
  return <nav className="file-editor-crumbs" aria-label="文件位置" title={file.path}>
    {shown.map((crumb, index) => <span key={crumb?.path ?? `gap-${index}`} className="file-editor-crumb">
      {crumb ? <button type="button" className="file-editor-crumb-button" onClick={() => onFolder(crumb.path)}>{crumb.name}</button> : <span className="muted">…</span>}
      <span className="muted" aria-hidden>/</span>
    </span>)}
    <span className="file-editor-crumb-current">{parts.at(-1)}</span>
  </nav>
}

function TreeResizer({ width, onWidth }: { width: number; onWidth(width: number): void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  const clamp = (value: number) => Math.round(Math.min(MAX_FILE_TREE_WIDTH, Math.max(MIN_FILE_TREE_WIDTH, value)))
  return <div
    className="file-editor-resizer"
    role="separator"
    aria-orientation="vertical"
    aria-label="调整文件树宽度"
    aria-valuenow={width}
    aria-valuemin={MIN_FILE_TREE_WIDTH}
    aria-valuemax={MAX_FILE_TREE_WIDTH}
    tabIndex={0}
    data-dragging={dragging !== null || undefined}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(event.clientX - width) }}
    onPointerMove={(event) => { if (dragging !== null) onWidth(clamp(event.clientX - dragging)) }}
    onPointerUp={() => setDragging(null)}
    onPointerCancel={() => setDragging(null)}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onWidth(clamp(width + (event.key === 'ArrowLeft' ? -16 : 16))) }
    }}
  />
}

// The inspector's 文件 tab: the projects' files on the left, the open ones on the right. Without
// core's file-editor it is the earlier preview: read-only, with no tree.
export function FileEditor({ conversationId, roots, updatedAt, onEmpty, inspector, editor }: {
  conversationId: string; roots: readonly string[]; updatedAt: number; onEmpty(): void; inspector: 'task' | 'conversation'; editor: boolean
}) {
  const state = useFileTabs((state) => state[conversationId] ?? EMPTY_FILE_TABS)
  const treeWidth = usePreferences((preferences) => preferences.fileTreeWidth)
  const focus = useFocusCount()
  const source = useRef<FileSourceHandle>(null)
  const modeLabel = useId()
  const more = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const refresh = `${focus}:${updatedAt}:${refreshCount}`
  const active = state.tabs.find((tab) => tab.file.path === state.active)
  const markdown = active && /\.(?:md|markdown|mdown|mkd)$/i.test(active.file.path)
  const svg = active && /\.svg$/i.test(active.file.path)
  const image = active && isImagePath(active.file.path)
  const text = active && (!image || svg)
  const preview = Boolean((markdown || svg) && active.preview)
  const scope: ChatFileScope = { conversationId, inspector, roots }
  const browsable = editor && roots.length > 0
  const tree = browsable && state.tree
  const expanded = expandedFolders(state, roots)

  useEffect(() => {
    if (editor && active) updateFileTabs(conversationId, (state) => revealedFile(state, roots, active.file.path))
  }, [editor, conversationId, active?.file.path, active?.reveal, roots.join('\0')])

  const close = (tab: FileTab) => {
    if (tab.dirty && !window.confirm(`${tab.file.path.split(/[\\/]/).at(-1)} 有未保存的修改，确定关闭并丢弃吗？`)) return
    const next = closedFile(useFileTabs.getState()[conversationId] ?? EMPTY_FILE_TABS, tab.file.path)
    updateFileTabs(conversationId, () => next)
    dropFileDraft(conversationId, tab.file.path)
    if (next.tabs.length === 0 && !editor) onEmpty()
  }
  const open = (file: ResolvedFile) => updateFileTabs(conversationId, (state) => openedFile(state, file, null))
  const showFolder = (folder: string) => updateFileTabs(conversationId, (state) => revealedFolder({ ...state, tree: true }, roots, folder))
  // With a tree to browse, the bar stays even with the tree folded away, so it can be opened again.
  if (!active && !browsable) return <p className="inspector-empty muted">点击聊天中的文件即可预览。</p>

  const writable = editor && active?.file.root != null && Boolean(text)
  const name = (tab: FileTab) => tab.file.path.split(/[\\/]/).at(-1) ?? tab.file.path
  const setPreview = (preview: boolean) => updateFileTabs(conversationId, (state) => ({ ...state, tabs: state.tabs.map((tab) => tab.file.path === active?.file.path ? { ...tab, preview } : tab) }))
  return <div className="file-editor" onKeyDown={(event) => {
    if (preview && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); source.current?.save() }
  }}>
    <div className="file-editor-bar">
      {browsable && <button type="button" className="tool-button" aria-label={state.tree ? '收起文件树' : '打开文件树'} aria-pressed={state.tree} title={state.tree ? '收起文件树' : '打开文件树'} onClick={() => updateFileTabs(conversationId, (state) => ({ ...state, tree: !state.tree }))}><SidebarIcon /></button>}
      <div className="file-editor-tabs" role="tablist" aria-label="已打开的文件">
        {state.tabs.map((tab) => <div className="file-editor-tab" key={tab.file.path} data-active={tab.file.path === state.active || undefined} data-dirty={tab.dirty || undefined}>
          <FileMenu scope={scope} file={tab.file} inPanel>
            <button type="button" role="tab" aria-selected={tab.file.path === state.active} title={tab.dirty ? `${tab.file.path}（未保存）` : tab.file.path} onClick={() => updateFileTabs(conversationId, (state) => ({ ...state, active: tab.file.path }))}>
              {name(tab)}
              {state.tabs.some((other) => other.file.path !== tab.file.path && name(other) === name(tab)) && <span className="muted"> · {tab.file.relative ?? tab.file.path}</span>}
            </button>
          </FileMenu>
          <button type="button" className="file-editor-tab-close" aria-label={`关闭文件 ${tab.file.path}${tab.dirty ? '（未保存）' : ''}`} onClick={() => close(tab)}>
            <span className="file-editor-tab-dot" aria-hidden /><CloseIcon />
          </button>
        </div>)}
      </div>
      {active && canOpenWith() && <OpenWithButton file={active.file} />}
      {text && <button type="button" className="tool-button" aria-label="搜索文件内容" title={`搜索 · ${PRIMARY_KEY_LABEL}F`} onClick={() => { setPreview(false); requestAnimationFrame(() => source.current?.search()) }}><SearchIcon /></button>}
      <button type="button" className="tool-button" ref={more} aria-label="更多操作" aria-haspopup="menu" aria-expanded={menu !== null} onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenu((menu) => menu ? null : { x: bounds.right, y: bounds.bottom + 4 })
      }}><MoreIcon /></button>
      <button type="button" className="tool-button" aria-label={state.maximized ? '还原文件面板' : '最大化文件面板'} title={state.maximized ? '还原' : '最大化'} onClick={() => updateFileTabs(conversationId, (state) => ({ ...state, maximized: !state.maximized }))}>{state.maximized ? <RestoreIcon /> : <MaximizeIcon />}</button>
      {menu && <ContextMenu at={menu} align="end" trigger={more.current} label="文件操作" onClose={() => setMenu(null)}>
        {writable && active?.dirty && <MenuItem label="保存" icon={<CheckIcon />} hint={`${PRIMARY_KEY_LABEL}S`} onSelect={() => { setMenu(null); source.current?.save() }} />}
        {text && <MenuItem label={state.wrap ? '关闭自动换行' : '自动换行'} icon={<span aria-hidden>↩</span>} onSelect={() => { setMenu(null); updateFileTabs(conversationId, (state) => ({ ...state, wrap: !state.wrap })) }} />}
        <MenuItem label="刷新" icon={<RefreshIcon />} onSelect={() => { setMenu(null); setRefreshCount((count) => count + 1) }} />
        {active && <><div className="menu-separator" role="separator" /><FileMenuItems scope={scope} file={active.file} inPanel onClose={() => setMenu(null)} /></>}
      </ContextMenu>}
    </div>
    <div className="file-editor-main">
      {tree && <>
        <div className="file-editor-tree" style={{ width: treeWidth }}>
          <FileTree scope={scope} roots={roots} expanded={expanded} active={active?.file.path ?? null} refresh={refresh}
            onToggle={(folder) => updateFileTabs(conversationId, (state) => toggledFolder(state, roots, folder))} onOpen={open} />
        </div>
        <TreeResizer width={treeWidth} onWidth={(width) => setPreference('fileTreeWidth', width)} />
      </>}
      <div className="file-editor-pane">
        {active ? <>
          <div className="file-editor-location">
            <Breadcrumb file={active.file} onFolder={showFolder} />
            {(markdown || svg) && <div className="file-editor-mode">
              <span id={modeLabel} className="visually-hidden">{svg ? 'SVG' : 'Markdown'} 显示方式</span>
              <Segmented labelId={modeLabel} value={preview ? 'preview' : 'edit'} options={[{ value: 'edit', label: writable ? '编辑' : '源码' }, { value: 'preview', label: '预览' }]} onChange={(mode) => setPreview(mode === 'preview')} />
            </div>}
          </div>
          {image && !svg ? <FileImage key={active.file.path} path={active.file.path} version={refresh} />
            : <FileContent key={active.file.path} scope={scope} tab={active} wrap={state.wrap} writable={writable} source={source} refresh={refresh} preview={preview} />}
        </> : <p className="inspector-empty muted">{tree ? '从左侧选择文件。' : '打开文件树选择文件。'}</p>}
      </div>
    </div>
  </div>
}
