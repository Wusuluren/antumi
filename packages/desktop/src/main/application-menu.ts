import type { MenuItemConstructorOptions } from 'electron'
import type { UiLocale } from '@antumi/protocol'

// Keep the stock desktop actions while making their authored labels follow the interface.
export function applicationMenu(locale: UiLocale, platform: string): MenuItemConstructorOptions[] {
  const label = (en: string, zh: string) => locale === 'en' ? en : zh
  const role = (role: NonNullable<MenuItemConstructorOptions['role']>, en: string, zh: string): MenuItemConstructorOptions => ({ role, label: label(en, zh) })
  const separator: MenuItemConstructorOptions = { type: 'separator' }
  return [
    ...(platform === 'darwin' ? [{ label: 'Antumi', submenu: [
      role('about', 'About Antumi', '关于 Antumi'), separator,
      role('services', 'Services', '服务'), separator,
      role('hide', 'Hide Antumi', '隐藏 Antumi'), role('hideOthers', 'Hide Others', '隐藏其他'), role('unhide', 'Show All', '显示全部'), separator,
      role('quit', 'Quit Antumi', '退出 Antumi')
    ] }] : []),
    { label: label('File', '文件'), submenu: [role('close', 'Close Window', '关闭窗口'), ...(platform === 'darwin' ? [] : [role('quit', 'Quit', '退出')])] },
    { label: label('Edit', '编辑'), submenu: [
      role('undo', 'Undo', '撤销'), role('redo', 'Redo', '重做'), separator,
      role('cut', 'Cut', '剪切'), role('copy', 'Copy', '复制'), role('paste', 'Paste', '粘贴'),
      role('pasteAndMatchStyle', 'Paste and Match Style', '粘贴并匹配样式'), role('delete', 'Delete', '删除'), separator,
      role('selectAll', 'Select All', '全选')
    ] },
    { label: label('View', '视图'), submenu: [
      role('reload', 'Reload', '重新加载'), role('forceReload', 'Force Reload', '强制重新加载'), role('toggleDevTools', 'Toggle Developer Tools', '切换开发者工具'), separator,
      role('resetZoom', 'Actual Size', '实际大小'), role('zoomIn', 'Zoom In', '放大'), role('zoomOut', 'Zoom Out', '缩小'), separator,
      role('togglefullscreen', 'Toggle Full Screen', '切换全屏')
    ] },
    { role: 'windowMenu', label: label('Window', '窗口'), submenu: [
      role('minimize', 'Minimize', '最小化'), role('zoom', 'Zoom', '缩放'),
      ...(platform === 'darwin' ? [separator, role('front', 'Bring All to Front', '全部前置')] : [])
    ] }
  ]
}
