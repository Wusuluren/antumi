import { useEffect, useRef, useState } from 'react'
import type { ResolvedFile } from '@antumi/protocol'
import { showError } from '../core-store'
import { canOpenFile, canRevealFile, installedOpenWithApps, openWith, type OpenWithApp } from '../desktop-bridge'
import { FILE_MANAGER, openResolvedFile, revealResolvedFile } from '../file-actions'
import { setPreference, usePreferences } from '../preferences'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { ChevronDownIcon, ExternalIcon, FolderIcon } from './icons'

function AppIcon({ app }: { app: OpenWithApp }) {
  return app.icon ? <img className="open-with-icon" src={app.icon} alt="" /> : <ExternalIcon />
}

// Opens the file in the app last picked, or another from the menu beside it: the editors and
// terminals installed here, the system's default app and the file manager.
export function OpenWithButton({ file }: { file: ResolvedFile }) {
  const [apps, setApps] = useState<OpenWithApp[]>([])
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const more = useRef<HTMLButtonElement>(null)
  const picked = usePreferences((preferences) => preferences.openWithApp)
  useEffect(() => {
    let current = true
    void installedOpenWithApps().then((found) => { if (current) setApps(found) })
    return () => { current = false }
  }, [])
  // The app picked last; before any, the first editor; with none, the default app.
  const chosen = apps.find((app) => app.id === picked) ?? apps.find((app) => app.kind === 'editor') ?? null
  const open = async (app: OpenWithApp) => {
    setPreference('openWithApp', app.id)
    const error = await openWith(file.path, app.id)
    if (error) showError(error)
  }
  const close = () => setMenu(null)
  const label = chosen ? `用 ${chosen.name} 打开` : '用默认应用打开'
  return <span className="open-with">
    <button type="button" className="tool-button open-with-main" aria-label={label} title={label} disabled={!chosen && !canOpenFile()}
      onClick={() => void (chosen ? open(chosen) : openResolvedFile(file))}>
      {chosen ? <AppIcon app={chosen} /> : <ExternalIcon />}
    </button>
    <button type="button" className="tool-button open-with-more" ref={more} aria-label="用其他方式打开" title="用其他方式打开" aria-haspopup="menu" aria-expanded={menu !== null}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenu((menu) => menu ? null : { x: bounds.right, y: bounds.bottom + 4 })
      }}>
      <ChevronDownIcon />
    </button>
    {menu && <ContextMenu at={menu} align="end" trigger={more.current} label="用其他方式打开" onClose={close}>
      {apps.map((app) => <MenuItem key={app.id} label={app.name} icon={<AppIcon app={app} />} onSelect={() => { close(); void open(app) }} />)}
      {apps.length > 0 && <div className="menu-separator" role="separator" />}
      {canOpenFile() && <MenuItem label="用默认应用打开" icon={<ExternalIcon />} onSelect={() => { close(); void openResolvedFile(file) }} />}
      {canRevealFile() && <MenuItem label={`在${FILE_MANAGER}中显示`} icon={<FolderIcon />} onSelect={() => { close(); void revealResolvedFile(file) }} />}
    </ContextMenu>}
  </span>
}
