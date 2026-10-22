import { mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'

const plugin = fileURLToPath(new URL('../packages/plugin-github/', import.meta.url))
await mkdir(`${plugin}/dist`, { recursive: true })
await build({ entryPoints: [`${plugin}/src/main.ts`], outfile: `${plugin}/dist/main.mjs`, bundle: true, platform: 'node', format: 'esm', target: 'node22' })
await copyFile(`${plugin}/manifest.json`, `${plugin}/dist/manifest.json`)

const dsh = fileURLToPath(new URL('../packages/dsh-runtime/', import.meta.url))
await mkdir(`${dsh}/dist`, { recursive: true })
await build({
  entryPoints: ['index', 'filesystem', 'shell', 'powershell'].map((name) => `${dsh}/src/${name}.ts`),
  outdir: `${dsh}/dist`, outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*', '@agentclientprotocol/*']
})
const manager = process.env.npm_execpath ?? 'pnpm'
const args = ['--dir', dsh, 'pack', '--out', `${dsh}/dist/runtime.tgz`]
const script = /\.[cm]?js$/.test(manager)
execFileSync(script ? process.execPath : manager, script ? [manager, ...args] : args, { stdio: 'pipe' })
