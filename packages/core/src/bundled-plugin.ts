import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function bundledGitHub(): string {
  const packaged = fileURLToPath(new URL('./plugins/github', import.meta.url))
  return existsSync(packaged) ? packaged : fileURLToPath(new URL('../../plugin-github/dist', import.meta.url))
}
