import { describe, expect, it } from 'vitest'
import { installedApps } from './open-with'

describe('installedApps', () => {
  const home = '/Users/me'
  const on = (...paths: string[]) => async (path: string) => paths.includes(path)

  it('finds each known app at the first bundle and folder it is in', async () => {
    const apps = await installedApps('darwin', home, on(
      '/Applications/Visual Studio Code.app',
      '/Users/me/Applications/JetBrains Toolbox/IntelliJ IDEA Ultimate.app',
      '/Applications/IntelliJ IDEA CE.app',
      '/System/Applications/Utilities/Terminal.app'
    ))
    expect(apps).toEqual([
      { id: 'vscode', name: 'VS Code', kind: 'editor', path: '/Applications/Visual Studio Code.app' },
      { id: 'idea', name: 'IntelliJ IDEA', kind: 'editor', path: '/Users/me/Applications/JetBrains Toolbox/IntelliJ IDEA Ultimate.app' },
      { id: 'terminal', name: '终端', kind: 'terminal', path: '/System/Applications/Utilities/Terminal.app' }
    ])
  })

  it('offers none off macOS', async () => {
    expect(await installedApps('win32', home, async () => true)).toEqual([])
  })
})
