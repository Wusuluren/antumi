// Bundles daemon, core and Antumi's MCP server into out/backend for a packaged app: one ESM file
// each, run by Electron's binary as plain Node (ELECTRON_RUN_AS_NODE), so users need no Node
// install. node-pty stays external: its prebuilt binding is copied beside the bundles.
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const desktop = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const repo = path.resolve(desktop, '../..')
const out = path.join(desktop, 'out', 'backend')
await import('../../../scripts/build-plugins.mjs')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync(path.join(repo, 'packages/plugin-github/dist'), path.join(out, 'plugins/github'), { recursive: true })

// Some bundled CJS dependencies call require() at runtime; give the ESM output one.
const banner = `import { createRequire as __antumiRequire } from 'node:module';\nconst require = __antumiRequire(import.meta.url);\n`

for (const [name, entry] of [
  ['daemon', 'packages/daemon/src/main.ts'],
  ['core', 'packages/core/src/main.ts'],
  ['mcp', 'packages/core/src/mcp-main.ts']
]) {
  await build({
    entryPoints: [path.join(repo, entry)],
    outfile: path.join(out, `${name}.mjs`),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: ['node-pty'],
    banner: { js: banner },
    logLevel: 'warning'
  })
}

// The prebuilt binding next to the bundles, where `import 'node-pty'` resolves it. Only the target
// platform's prebuilds (--platform, this machine's by default): the rest is 50MB of others. Debug
// symbols stay behind too.
const platformFlag = process.argv.indexOf('--platform')
const platform = platformFlag === -1 ? process.platform : process.argv[platformFlag + 1]
const PREBUILDS = { darwin: ['darwin-arm64', 'darwin-x64'], win32: ['win32-x64'] }
const prebuilds = PREBUILDS[platform]
if (!prebuilds) throw new Error(`[bundle-backend] no package for platform ${platform}`)
const requireDaemon = createRequire(path.join(repo, 'packages/daemon/package.json'))
const ptyRoot = path.dirname(requireDaemon.resolve('node-pty/package.json'))
const ptyOut = path.join(out, 'node_modules', 'node-pty')
for (const piece of ['package.json', 'lib', ...prebuilds.map((each) => `prebuilds/${each}`)]) {
  const from = path.join(ptyRoot, piece)
  if (!existsSync(from)) throw new Error(`[bundle-backend] node-pty has no ${piece}`)
  cpSync(from, path.join(ptyOut, piece), { recursive: true, filter: (file) => !file.endsWith('.pdb') })
}
// node-pty ships its spawn-helper without the exec bit (see scripts/fix-node-pty-spawn-helper.mjs).
for (const arch of prebuilds) {
  const helper = path.join(ptyOut, 'prebuilds', arch, 'spawn-helper')
  if (existsSync(helper)) chmodSync(helper, 0o755)
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
console.log(`[bundle-backend] daemon, core and mcp bundled for ${platform} at ${commit}`)
