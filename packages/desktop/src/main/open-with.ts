import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type OpenWithKind = 'editor' | 'terminal'
type KnownApp = { id: string; name: string; kind: OpenWithKind; bundles: readonly string[] }
export type InstalledApp = { id: string; name: string; kind: OpenWithKind; path: string }

// The editors and terminals a project file is opened in, under the bundle names their installers
// use. Only these can be opened from the renderer: it names one by id, never a path to run.
export const OPEN_WITH_APPS: readonly KnownApp[] = [
  { id: 'vscode', name: 'VS Code', kind: 'editor', bundles: ['Visual Studio Code.app'] },
  { id: 'cursor', name: 'Cursor', kind: 'editor', bundles: ['Cursor.app'] },
  { id: 'zed', name: 'Zed', kind: 'editor', bundles: ['Zed.app'] },
  { id: 'sublime', name: 'Sublime Text', kind: 'editor', bundles: ['Sublime Text.app'] },
  { id: 'idea', name: 'IntelliJ IDEA', kind: 'editor', bundles: ['IntelliJ IDEA.app', 'IntelliJ IDEA Ultimate.app', 'IntelliJ IDEA CE.app', 'IntelliJ IDEA Community Edition.app'] },
  { id: 'webstorm', name: 'WebStorm', kind: 'editor', bundles: ['WebStorm.app'] },
  { id: 'pycharm', name: 'PyCharm', kind: 'editor', bundles: ['PyCharm.app', 'PyCharm Professional Edition.app', 'PyCharm CE.app', 'PyCharm Community Edition.app'] },
  { id: 'goland', name: 'GoLand', kind: 'editor', bundles: ['GoLand.app'] },
  { id: 'xcode', name: 'Xcode', kind: 'editor', bundles: ['Xcode.app'] },
  { id: 'terminal', name: '终端', kind: 'terminal', bundles: ['Terminal.app'] },
  { id: 'iterm', name: 'iTerm2', kind: 'terminal', bundles: ['iTerm.app'] },
  { id: 'warp', name: 'Warp', kind: 'terminal', bundles: ['Warp.app'] },
  { id: 'ghostty', name: 'Ghostty', kind: 'terminal', bundles: ['Ghostty.app'] }
]

// Where macOS keeps applications: the system's and its utilities, the user's, and JetBrains
// Toolbox's own folder for the IDEs it installs.
export function applicationFolders(home: string): string[] {
  return ['/Applications', '/Applications/Utilities', '/System/Applications/Utilities', join(home, 'Applications'), join(home, 'Applications', 'JetBrains Toolbox')]
}

// The known apps installed here, each at the first place one of its bundles is found. macOS only so
// far: elsewhere the menu offers the default app and the file manager alone.
export async function installedApps(platform: NodeJS.Platform, home: string, exists: (path: string) => Promise<boolean>): Promise<InstalledApp[]> {
  if (platform !== 'darwin') return []
  const found: InstalledApp[] = []
  for (const app of OPEN_WITH_APPS) {
    const places = app.bundles.flatMap((bundle) => applicationFolders(home).map((folder) => join(folder, bundle)))
    for (const path of places) {
      if (await exists(path)) {
        found.push({ id: app.id, name: app.name, kind: app.kind, path })
        break
      }
    }
  }
  return found
}

// A terminal opens in the file's folder; an editor opens the file itself.
export async function openWith(app: InstalledApp, file: string): Promise<void> {
  const target = app.kind === 'terminal' && (await stat(file)).isFile() ? dirname(file) : file
  await run('open', ['-a', app.path, target])
}
