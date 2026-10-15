import { cpSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// Before the rename the app was Kando (from source, @kando/desktop), so its window state, local
// storage and the built-in browser's logins sit under that name. Copied once, before anything opens
// the new folder; the old one stays, as a way back.
export function adoptLegacyUserData(): void {
  const current = app.getPath('userData')
  const legacy = app.isPackaged ? join(app.getPath('appData'), 'Kando') : join(app.getPath('appData'), '@kando', 'desktop')
  if (existsSync(current) || !existsSync(legacy)) return
  try {
    // Chromium's lock names the process that held the folder; a copy would only confuse the next one.
    cpSync(legacy, current, { recursive: true, verbatimSymlinks: true, filter: (source) => !/[\\/]Singleton[^\\/]*$/.test(source) })
    const partitions = join(current, 'Partitions')
    if (existsSync(join(partitions, 'kando-browser')) && !existsSync(join(partitions, 'antumi-browser'))) {
      renameSync(join(partitions, 'kando-browser'), join(partitions, 'antumi-browser'))
    }
  } catch (error) {
    console.error(`[antumi] copying ${legacy} failed; starting with a fresh one`, error)
  }
}
