import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { DSH_CONFIG_ENV, type AgentCliInstallation, type ChatCatalog } from '@antumi/protocol'
import { launchFile } from '@antumi/protocol/node'
import { findOnPath } from '../../environment-check'
import { Rejection } from '../../rejection'
import { AcpDriver } from '../acp/acp-driver'
import { probeChatCatalog } from '../../chat-catalog'
import type { AgentDetection, AgentStage } from '../agent-adapter'
import { dshDialect } from './dsh-dialect'
import { DSH_PROVIDER_ENV, dshCommand } from './dsh-command'

const execute = promisify(execFile)
export const DSH_VERSION = '0.2.1-rc.2'
const DSH_BASE = '@deepseek-ai/dsh-base'
const prepares = new Map<string, Promise<void>>()

async function output(command: string, args: string[], timeout = 10_000, env = process.env): Promise<string> {
  const launch = launchFile(command, args, env)
  return (await execute(launch.file, launch.args, { env: launch.env, timeout, windowsHide: true, maxBuffer: 1024 * 1024 })).stdout
}

export function dshCompatible(version: string | null): boolean { return version === DSH_VERSION }

async function versionOf(command: string): Promise<string | null> {
  const printed = (await output(command, ['--version']).catch(() => '')).trim()
  return /^v?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(printed) ? printed.replace(/^v/, '') : null
}

export async function detectDsh(pathEnv: string, platform: NodeJS.Platform): Promise<AgentDetection> {
  const command = await findOnPath('dsh', pathEnv, platform)
  if (!command) return { status: 'missing', version: null, path: null, signedIn: null }
  const version = await versionOf(command)
  const compatible = dshCompatible(version)
  return {
    status: compatible ? 'ok' : 'unknown', version, path: command, signedIn: null,
    ...(!compatible ? { problem: version === null ? 'probe-failed' as const : 'incompatible-version' as const } : {})
  }
}

export async function requireDsh(): Promise<string> {
  const command = await findOnPath('dsh', process.env.PATH ?? '', process.platform)
  if (!command) throw new Rejection('dsh-cli-missing', '未找到 DeepSeek Harness，请安装后重新检测')
  if (!dshCompatible(await versionOf(command))) throw new Rejection('dsh-version-incompatible', `请安装 DeepSeek Harness ${DSH_VERSION}，其他版本尚未验证兼容`)
  return command
}

export function dshInstallation(platform: NodeJS.Platform): AgentCliInstallation | null {
  return platform === 'win32' || platform === 'darwin' || platform === 'linux'
    ? { agent: 'dsh', shell: platform === 'win32' ? 'powershell' : 'bash', command: `npm install -g @deepseek-ai/dsh@${DSH_VERSION}` } : null
}

export function bundledDsh(): string {
  const packaged = fileURLToPath(new URL('./plugins/dsh/runtime.tgz', import.meta.url))
  return existsSync(packaged) ? packaged : fileURLToPath(new URL('../../../../dsh-runtime/dist/runtime.tgz', import.meta.url))
}

async function installedVersion(manifest: string): Promise<string | null> {
  try {
    const parsed = z.looseObject({ version: z.string() }).safeParse(JSON.parse(await readFile(manifest, 'utf8')))
    return parsed.success ? parsed.data.version : null
  } catch { return null }
}

export async function prepareDshProfile(command: string, bundle = bundledDsh(), home = process.env.DSH_HOME || path.join(homedir(), '.dsh')): Promise<void> {
  const hash = createHash('sha256').update(await readFile(bundle).catch(() => { throw new Rejection('dsh-runtime-missing', 'DeepSeek Harness 运行时插件缺失，请重新构建或安装 Antumi') })).digest('hex')
  const key = `${home}:${hash}`
  const pending = prepares.get(key)
  if (pending) return pending
  const preparation = (async () => {
    const profile = path.join(home, 'profiles', 'antumi')
    const marker = path.join(profile, '.antumi-runtime')
    const installed = path.join(profile, 'node_modules', '@antumi', 'dsh-runtime', 'package.json')
    // Without its own copy the profile resolves dsh-base from a parent install, whose
    // scheduler symbol differs from this profile's dsh-tools and fails every tool call.
    const base = path.join(profile, 'node_modules', '@deepseek-ai', 'dsh-base', 'package.json')
    const env = { ...process.env, DSH_HOME: home }
    const runtimeReady = (await readFile(marker, 'utf8').catch(() => '')) === hash && existsSync(installed)
    const baseReady = await installedVersion(base) === DSH_VERSION
    if (runtimeReady && baseReady) return
    if (!runtimeReady) {
      try { await output(command, ['plugin', '--profile', 'antumi', 'add', bundle], 180_000, env) } catch {
        throw new Rejection('dsh-runtime-install-failed', 'DeepSeek Harness 运行时准备失败，请检查网络和 pnpm 后重试；已有配置已保留')
      }
    }
    if (await installedVersion(base) !== DSH_VERSION) {
      // Installs that pull native dependencies exit non-zero over the build scripts pnpm
      // skipped, so the package landing is what decides, not the exit code.
      await output(command, ['plugin', '--profile', 'antumi', 'add', `${DSH_BASE}@${DSH_VERSION}`], 180_000, env).catch(() => '')
      if (await installedVersion(base) !== DSH_VERSION) throw new Rejection('dsh-runtime-install-failed', 'DeepSeek Harness 未能把运行时基础包装进 profile，请检查网络和 pnpm 后重试')
    }
    const manifest = z.looseObject({ name: z.literal('@antumi/dsh-runtime') }).safeParse(JSON.parse(await readFile(installed, 'utf8')))
    if (!manifest.success) throw new Rejection('dsh-runtime-install-failed', 'DeepSeek Harness 未能安装 Antumi 运行时插件，请重试')
    await writeFile(marker, hash, { mode: 0o600 })
  })()
  prepares.set(key, preparation)
  try { await preparation } finally { prepares.delete(key) }
}

export const DSH_OVERLAY = `- id: skill-filesystem
  config:
    customSkillDirs: !!js JSON.parse(process.env.${DSH_CONFIG_ENV} || '{}').skills || []
- id: llm-pi-ai
  config:
    providers: !!js "(() => { const providers = JSON.parse(process.env.${DSH_PROVIDER_ENV} || '{}'); for (const provider of Object.values(providers)) { if (provider.headers?.authorization) provider.headers.authorization = 'Bearer ' + (process.env.ANTUMI_MODEL_PROVIDER_KEY || ''); } return providers; })()"
`

export async function prepareDsh(stage: AgentStage): Promise<{ command: string; args: string[] }> {
  const command = await requireDsh()
  await prepareDshProfile(command)
  const directory = path.join(stage.sessionsRoot, stage.conversationId, 'dsh')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const overlay = path.join(directory, `overlay-${stage.stageId}.yml`)
  await writeFile(overlay, DSH_OVERLAY, { mode: 0o600 })
  return { command, args: ['--patch', overlay] }
}

export async function dshCatalog(cwd: string): Promise<ChatCatalog | null> {
  const command = await requireDsh()
  await prepareDshProfile(command)
  const launch = dshCommand({ providerSessionId: null, resume: false, handoffPath: null, extraProjects: [] })
  return probeChatCatalog(new AcpDriver(dshDialect, 'catalog', { cwd, extraDirs: [], resume: null }, true), { ...launch, command }, cwd)
}
