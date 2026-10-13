import { mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const plugin = fileURLToPath(new URL('../packages/plugin-github/', import.meta.url))
await mkdir(`${plugin}/dist`, { recursive: true })
await build({ entryPoints: [`${plugin}/src/main.ts`], outfile: `${plugin}/dist/main.mjs`, bundle: true, platform: 'node', format: 'esm', target: 'node22' })
await copyFile(`${plugin}/manifest.json`, `${plugin}/dist/manifest.json`)
