import type { BrowserStatus, WireUsage } from '@antumi/protocol'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { AGENT_KINDS, agentDescriptor, LANGUAGE_NAMES, PROTOCOL_VERSION, quickModel, TRANSLATE_LANGUAGES, UNATTENDED_MODES, type AgentKind, type SourceDescriptor } from '@antumi/protocol'
import packageJson from '../../../../package.json'
import { perform, setAwakeMode, setChatSettings, setSettingsOpen, useAwakeSupported, useCore, useBrowserSupported, useChatCommandsSupported, useKnowledgeBaseSupported, useMcpServersSupported, useSkillsSupported, useTranslateSupported, useWireLogSupported } from '../core-store'
import { setPreference, usePreferences } from '../preferences'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { UNATTENDED_LABEL } from '../schedules'
import { useInstalledAgents } from '../installed-agents'
import { useAgentCatalog } from '../agent-models'
import { ChatPicker } from './ChatPicker'
import { PluginSettings } from './PluginSettings'
import { InstalledAgentsSettings } from './InstalledAgentsSettings'
import { TitleNamingSettings } from './TitleNamingSettings'
import { ChatFontPicker } from './ChatFontPicker'
import { CodeFontPicker } from './CodeFontPicker'
import { agentLabel } from '../labels'
import { canNotify, canShowRequestPopup } from '../desktop-bridge'
import { formatBytes } from '../wire-entries'
import {
  AgentIcon,
  ArrowLeftIcon,
  BellIcon,
  BookIcon,
  BugIcon,
  ChatIcon,
  ContrastIcon,
  FolderIcon,
  GaugeIcon,
  GlobeIcon,
  InfoIcon,
  PlugIcon,
  PuzzleIcon,
  SourceIcon,
  SearchIcon,
  SparkIcon,
  TranslateIcon
} from './icons'
import { AgentStatsSettings } from './AgentStatsSettings'
import { ChatCommandSettings } from './ChatCommandSettings'
import { KnowledgeBaseSettings } from './KnowledgeBaseSettings'
import { SkillsSettingsSection } from './SkillsSettingsSection'
import { McpSettingsSection } from './McpSettingsSection'
import { CopyButton } from './CopyButton'
import { checkStatusText, GIT_INSTALL_HINT } from '../environment-text'
import { settingsSectionOf } from './SourceInboxView'
import { SourceSettingsSection } from './SourceSettingsSection'
import { projectName } from './ProjectPicker'
import { Segmented, SettingsRow, Stepper, Toggle } from './SettingsControls'
import { PalettePicker } from './PalettePicker'
import { useOccludesBrowser } from '../browser-occlusion'

function AppearanceSettings() {
  const theme = usePreferences((s) => s.theme)
  const terminalFontSize = usePreferences((s) => s.terminalFontSize)
  const terminalLineHeight = usePreferences((s) => s.terminalLineHeight)
  const colorPrompt = usePreferences((s) => s.colorPrompt)
  const colorPromptSupported = useCore((s) => s.rpc?.features.includes('terminal-color-prompt') ?? false)
  const chatFontSize = usePreferences((s) => s.chatFontSize)
  const chatWidth = usePreferences((s) => s.chatWidth)
  const foldTurns = usePreferences((s) => s.foldTurns)
  return (
    <>
      <SettingsRow
        label="主题"
        description="跟随系统时，会随 macOS / Windows 的浅色、深色设置自动切换。"
        control={(labelId) => (
          <Segmented
            labelId={labelId}
            value={theme}
            onChange={(next) => setPreference('theme', next)}
            options={[
              { value: 'system', label: '跟随系统' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' }
            ]}
          />
        )}
      />
      <SettingsRow
        label="配色"
        description="界面的整套颜色，各有浅色和深色两面，跟着上面的主题切换；色卡左浅右深。"
        control={(labelId) => <PalettePicker labelId={labelId} />}
      />
      <SettingsRow
        label="终端字号"
        description="终端面板里文字的大小，已经打开的终端会立即生效。"
        control={(labelId) => (
          <Stepper
            labelId={labelId}
            value={terminalFontSize}
            min={10}
            max={20}
            unit="px"
            onChange={(next) => setPreference('terminalFontSize', next)}
          />
        )}
      />
      <SettingsRow
        label="终端行高"
        description="终端里行与行的间距，是字体自身行高的倍数。Geist Mono 用 1.0 就够；换成 Menlo 这类行距紧的字体时可以调大。已经打开的终端会立即生效。"
        control={(labelId) => (
          <Segmented
            labelId={labelId}
            value={String(terminalLineHeight)}
            onChange={(next) => setPreference('terminalLineHeight', Number(next))}
            options={[
              { value: '1', label: '1.0' },
              { value: '1.2', label: '1.2' },
              { value: '1.4', label: '1.4' }
            ]}
          />
        )}
      />
      {colorPromptSupported && (
        <SettingsRow
          label="彩色提示符"
          description="终端用的是 zsh、而你没有自己设置过提示符时，换成带颜色和 git 分支的提示符；上一条命令失败时 % 变红。只影响 Antumi 里新开的终端，不改你的 ~/.zshrc；自己配过提示符（或用 oh-my-zsh、starship）的不受影响。"
          control={(labelId) => <Toggle labelId={labelId} checked={colorPrompt} onChange={(next) => setPreference('colorPrompt', next)} />}
        />
      )}
      <SettingsRow
        label="代码字体"
        description="终端、代码块、改动和文件里的代码用的字体。默认是内置的 Geist Mono；也可以选这台电脑上装的等宽字体，中文回落到系统中文字体。"
        control={(labelId) => <CodeFontPicker labelId={labelId} />}
      />
      <SettingsRow
        label="聊天字号"
        description="聊天消息、过程信息和输入框文字的大小，会立即生效。"
        control={(labelId) => (
          <Stepper
            labelId={labelId}
            value={chatFontSize}
            min={10}
            max={20}
            unit="px"
            onChange={(next) => setPreference('chatFontSize', next)}
          />
        )}
      />
      <SettingsRow
        label="聊天字体"
        description="聊天消息用的字体。衬线只改正文，代码不变；字体里缺的字回落到系统字体。"
        control={(labelId) => <ChatFontPicker labelId={labelId} />}
      />
      <SettingsRow
        label="聊天页宽度"
        description="消息和输入框的最大宽度：窄 800px，中等 1200px，全宽占满聊天区域。"
        control={(labelId) => (
          <Segmented
            labelId={labelId}
            value={chatWidth}
            onChange={(next) => setPreference('chatWidth', next)}
            options={[
              { value: 'narrow', label: '窄' },
              { value: 'medium', label: '中等' },
              { value: 'full', label: '全宽' }
            ]}
          />
        )}
      />
      <SettingsRow
        label="折叠做完的回合"
        description="一轮回完后，把思考、命令和中间的回复收进「工作了 N 秒」，只留最后的回答，点开仍能看。"
        control={(labelId) => (
          <Toggle labelId={labelId} checked={foldTurns} onChange={(next) => setPreference('foldTurns', next)} />
        )}
      />
    </>
  )
}

function NotificationSettings() {
  const notifications = usePreferences((s) => s.notifications)
  const requestPopup = usePreferences((s) => s.requestPopup)
  return (
    <>
      {canNotify() && (
        <SettingsRow
          label="系统通知"
          description="窗口不在前台时，Agent 等你确认、一轮做完、异常退出，或定时任务跑完时发通知，点它回到对应的会话或任务。不影响 Dock 图标上的待处理数字。"
          control={(labelId) => <Toggle labelId={labelId} checked={notifications} onChange={(next) => setPreference('notifications', next)} />}
        />
      )}
      {canShowRequestPopup() && (
        <SettingsRow
          label="离开时在屏幕顶部弹出待处理的请求"
          description="你在别的应用里时，Agent 等你确认的请求以卡片弹在屏幕顶部，可以直接选，不会抢走焦点。打开后这类请求不再另发系统通知。"
          control={(labelId) => <Toggle labelId={labelId} checked={requestPopup} onChange={(next) => setPreference('requestPopup', next)} />}
        />
      )}
    </>
  )
}

// The model one agent does small jobs with: its cheapest by default, which the first option names, or
// one the user picked from its catalog.
function QuickModelPicker({ agent }: { agent: AgentKind }) {
  const catalog = useAgentCatalog(agent, true)
  const picked = usePreferences((s) => s.quickModels[agent]) ?? ''
  const cheapest = quickModel(agentDescriptor(agent).quickModels, catalog)
  const cheapestLabel = catalog?.models.find((model) => model.id === cheapest)?.label ?? (catalog === undefined ? '…' : '默认模型')
  const options = [
    { value: '', label: `自动（${cheapestLabel}）`, description: '它最便宜的小模型' },
    ...(catalog?.models ?? []).map((model) => ({ value: model.id, label: model.label, description: model.description || undefined })),
    // A pick the catalog no longer lists stays shown, saying what translates in its place, so it can
    // be changed; core falls back on the cheapest the same way.
    ...(picked && !catalog?.models.some((model) => model.id === picked)
      ? [{ value: picked, label: catalog ? `${picked}（已下线，改用自动：${cheapestLabel}）` : picked }]
      : [])
  ]
  return (
    <span className="quick-model">
      <AgentIcon agent={agent} />
      <span className="quick-model-agent">{agentLabel(agent)}</span>
      <ChatPicker
        label={`${agentLabel(agent)} 做轻量任务用的模型`}
        value={picked}
        placeholder="自动"
        placement="below"
        align="end"
        options={options}
        onChange={(value) => {
          const { [agent]: _gone, ...rest } = usePreferences.getState().quickModels
          setPreference('quickModels', value ? { ...rest, [agent]: value } : rest)
          if (useCore.getState().chatSettings?.titleModels !== undefined) {
            void setChatSettings({ titleModels: usePreferences.getState().quickModels })
          }
        }}
      />
    </span>
  )
}

function TranslationSettings() {
  const to = usePreferences((s) => s.translateTo)
  const auto = usePreferences((s) => s.autoTranslate)
  const supported = useTranslateSupported()
  return (
    <>
      {!supported && <p className="muted">正在连接的 core 版本较旧，还不能翻译；更新后可用。</p>}
      <SettingsRow
        label="翻译成"
        description="回复不是这种语言时，会出现「翻译」按钮。"
        control={(labelId) => (
          <Segmented labelId={labelId} value={to} options={TRANSLATE_LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))} onChange={(next) => setPreference('translateTo', next)} />
        )}
      />
      <SettingsRow
        label="自动翻译"
        description="回复显示到屏幕上时自动翻译，点「原文」看原文。只翻你看到的，不会一下子翻完整条旧会话。"
        control={(labelId) => <Toggle labelId={labelId} checked={auto} onChange={(next) => setPreference('autoTranslate', next)} />}
      />
      <p className="settings-note">
        由会话里同一个 Agent 翻译，用的模型在 智能体 →「轻量任务用的模型」里选。每次翻译单独发一次请求，不进会话、不占上下文，但会计入这个 Agent 的用量；同一条回复只翻一次。
      </p>
    </>
  )
}

function UsageSettings() {
  const showUsage = usePreferences((s) => s.showUsage)
  const display = usePreferences((s) => s.usageDisplay)
  return (
    <>
      <SettingsRow
        label="在状态栏显示用量额度"
        description="Claude Code 与 Codex 订阅的 5 小时和每周额度。"
        control={(labelId) => (
          <Toggle labelId={labelId} checked={showUsage} onChange={(next) => setPreference('showUsage', next)} />
        )}
      />
      <SettingsRow
        label="百分比显示"
        description="只改变显示的数字；快用完时的黄色、红色提醒不受影响。"
        control={(labelId) => (
          <Segmented
            labelId={labelId}
            value={display}
            onChange={(next) => setPreference('usageDisplay', next)}
            options={[
              { value: 'used', label: '已用' },
              { value: 'remaining', label: '剩余' }
            ]}
          />
        )}
      />
    </>
  )
}

// The hosted browser's state in a few words, and what to do about it.
function browserStatusText(status: BrowserStatus | null): string {
  if (!status) return '正在询问…'
  switch (status.state) {
    case 'app-closed':
      return '没有连上：浏览器在 Antumi 应用里运行'
    case 'starting':
      return '正在启动'
    case 'ready':
      return status.running ? '就绪，正在运行' : '就绪'
    case 'error':
      return `出错：${status.message ?? '未知错误'}`
  }
}

function BrowserRows() {
  const status = useCore((s) => s.browser)
  const openOnTab = usePreferences((s) => s.openBrowserOnTab)
  return (
    <>
      <SettingsRow
        label="浏览器"
        description="Agent 用 Antumi 自带的浏览器打开页面、截图和点击，页面显示在右侧面板。本地地址直接打开，其他网站第一次访问会先问你。Antumi 关掉时不可用。"
        control={() => <span className="muted">{browserStatusText(status)}</span>}
      />
      <SettingsRow
        label="Agent 打开页面时自动显示浏览器"
        description="Agent 第一次用浏览器时自动打开右侧的浏览器面板。关掉时，在页面卡片上点「打开」才显示。"
        control={(labelId) => (
          <Toggle labelId={labelId} checked={openOnTab} onChange={(next) => setPreference('openBrowserOnTab', next)} />
        )}
      />
    </>
  )
}

function AgentSettings() {
  const awakeSupported = useAwakeSupported()
  const awake = useCore((s) => s.awake)
  const chatSettings = useCore((s) => s.chatSettings)
  const installed = useInstalledAgents()
  return (
    <>
      <InstalledAgentsSettings />
      {chatSettings?.maxConcurrentAgents !== undefined && (
        <SettingsRow
          label="同时运行的 Agent 总数"
          description="到上限后，新会话会提示稍后再试，预约任务排队等空位。等你确认的 Agent 也占名额；调低不会停掉正在运行的会话。"
          control={(labelId) => (
            <Stepper labelId={labelId} value={chatSettings.maxConcurrentAgents ?? 20} min={1} max={50} unit="个" onChange={(maxConcurrentAgents) => void setChatSettings({ maxConcurrentAgents })} />
          )}
        />
      )}
      {chatSettings?.agentConcurrency && AGENT_KINDS.map((agent) => (
        <SettingsRow
          key={agent}
          label={`${agentLabel(agent)} 同时运行`}
          description="同一 Agent 的上限；实际可启动数量也受总数上限约束。"
          control={(labelId) => (
            <Stepper labelId={labelId} value={chatSettings.agentConcurrency?.[agent] ?? 6} min={1} max={50} unit="个" onChange={(count) => void setChatSettings({ agentConcurrency: { [agent]: count } })} />
          )}
        />
      ))}
      {awakeSupported && awake && (
        <SettingsRow
          label="保持电脑唤醒"
          description="「Agent 工作时」：有 Agent 在执行或有预约待运行时阻止睡眠，等你输入时不阻止。合上笔记本仍会睡眠。"
          control={(labelId) => (
            <Segmented
              labelId={labelId}
              value={awake.mode}
              onChange={(mode) => void setAwakeMode(mode)}
              options={[
                { value: 'on', label: '始终' },
                { value: 'auto', label: 'Agent 工作或有预约时' },
                { value: 'off', label: '关闭' }
              ]}
            />
          )}
        />
      )}
      {chatSettings && (
        <SettingsRow
          label="回合结束后建议下一步"
          description="Claude Code 每轮回复后，在输入框里用灰字预测你的下一句，按 Tab 或 → 填入。每次多发一个简短请求，会计入少量用量。打开后从下次启动 Claude 起生效；Codex 不支持。"
          control={(labelId) => (
            <Toggle labelId={labelId} checked={chatSettings.promptSuggestions} onChange={(next) => void setChatSettings({ promptSuggestions: next })} />
          )}
        />
      )}
      <TitleNamingSettings />
      {chatSettings?.userBrowser !== undefined && (
        <SettingsRow
          label="让 Claude Code 操作你的 Chrome"
          description="Claude Code 通过 Claude in Chrome 扩展，在你自己的 Chrome 里用已登录的账号打开、点击和填写网页。需要先装好扩展。从下次启动 Agent 起生效；Codex 和 Cursor 不支持。"
          control={(labelId) => (
            <Toggle labelId={labelId} checked={chatSettings.userBrowser ?? true} onChange={(next) => void setChatSettings({ userBrowser: next })} />
          )}
        />
      )}
      {chatSettings?.readHistory !== undefined && (
        <SettingsRow
          label="让 Agent 读你在 Antumi 里的记录"
          description="每个 Agent 都能用两个只读工具，列出和读取你在 Antumi 里的会话、任务和群聊（包括其他 Agent 的），比如让定时任务总结本周工作。从下次启动 Agent 起生效。"
          control={(labelId) => (
            <Toggle labelId={labelId} checked={chatSettings.readHistory ?? true} onChange={(next) => void setChatSettings({ readHistory: next })} />
          )}
        />
      )}
      {chatSettings?.unattendedMode && (
        <SettingsRow
          label="预约运行的权限"
          description="预约的任务和会话到点时无人值守，以这个模式直接开始。「自动接受编辑」：改文件不问，其他操作仍会问，没人回答就停下；「全部放行」：什么都不问，Codex 也不受沙箱限制，只用于你信任的任务。"
          control={(labelId) => (
            <Segmented
              labelId={labelId}
              value={chatSettings.unattendedMode ?? 'acceptEdits'}
              onChange={(unattendedMode) => void setChatSettings({ unattendedMode })}
              options={UNATTENDED_MODES.map((value) => ({ value, label: UNATTENDED_LABEL[value] }))}
            />
          )}
        />
      )}
      <SettingsRow
        label="轻量任务用的模型"
        description="小助手、翻译回复、生成提交信息和总结会话标题时用会话里同一个 Agent 的这个模型。不选就自动用它最便宜的模型（Haiku、Luna、Flash 一类），没有就用默认模型。"
        control={() => (
          <span className="quick-models">
            {installed.map((agent) => <QuickModelPicker key={agent} agent={agent} />)}
          </span>
        )}
      />
    </>
  )
}

function ProjectSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const [projects, setProjects] = useState<string[] | null>(null)

  useEffect(() => {
    if (connected) {
      void perform((rpc) => rpc.call('projects.recent', {})).then((recent) => setProjects(recent ?? []))
    }
  }, [connected])

  const forget = async (projectPath: string) => {
    if (await perform((rpc) => rpc.call('projects.forget', { path: projectPath }))) {
      setProjects((current) => current?.filter((entry) => entry !== projectPath) ?? null)
    }
  }

  if (!connected) {
    return <p className="settings-empty">连接到 Antumi core 后才能查看。</p>
  }
  if (projects === null) {
    return <p className="settings-empty">正在读取…</p>
  }
  if (projects.length === 0) {
    return <p className="settings-empty">还没有用过的项目。给任务或会话添加项目后，会出现在这里。</p>
  }
  return (
    <ul className="settings-project-list">
      {projects.map((projectPath) => (
        <li key={projectPath} className="settings-project">
          <span className="settings-project-name">{projectName(projectPath)}</span>
          <span className="settings-project-path mono" title={projectPath}>
            {projectPath}
          </span>
          <button type="button" className="button" onClick={() => void forget(projectPath)}>
            移除
          </button>
        </li>
      ))}
    </ul>
  )
}

// Read when the section opens and after each change: the wire log grows while agents run.
function DebugSettings() {
  const rpc = useCore((s) => s.rpc)
  const wireLog = useCore((s) => s.chatSettings?.wireLog ?? false)
  const [usage, setUsage] = useState<WireUsage | null>(null)
  const [clearing, setClearing] = useState(false)
  useEffect(() => {
    if (!rpc) return
    let current = true
    void rpc.call('debug.wireUsage', {}).then((found) => { if (current) setUsage(found) }, () => {})
    return () => { current = false }
  }, [rpc, wireLog])
  const clear = async () => {
    if (!rpc || clearing) return
    setClearing(true)
    const left = await perform((connection) => connection.call('debug.clearWire', {}))
    if (left) setUsage(left)
    setClearing(false)
  }
  return (
    <>
      <SettingsRow
        label="记录和 Agent 之间的原始数据"
        description="原样记下 Antumi 和 Agent 之间收发的每一行（含 stderr、启动命令和退出码），在会话或任务检查器的「原始数据」里查看、搜索和复制。正在运行的 Agent 从下一行开始记。"
        control={(labelId) => <Toggle labelId={labelId} checked={wireLog} onChange={(next) => void setChatSettings({ wireLog: next })} />}
      />
      <SettingsRow
        label="已经记下的"
        description={`${usage ? `${usage.files} 段，共 ${formatBytes(usage.bytes)}。` : ''}存在 ~/.antumi/sessions/<会话>/wire/ 下，每段最多 50 MB，7 天后自动删除。里面有文件内容和命令输出，分享前看一眼。`}
        control={() => (
          <button type="button" className="button" disabled={clearing || !usage || usage.files === 0} onClick={() => void clear()}>
            全部删除
          </button>
        )}
      />
    </>
  )
}

const CONNECTION_TEXT = { connected: '已连接', connecting: '连接中…', 'waiting-for-core': '等待 core 启动' } as const

// Not an agent, but every task needs it for its worktree: what core found, and how to install it.
function GitRow() {
  const git = useCore((s) => s.environment?.checks.find((check) => check.tool === 'git'))
  if (!git) return null
  const missing = git.status === 'missing'
  return (
    <SettingsRow
      label="Git"
      description={missing ? '每个任务在自己的 worktree 里执行，没有 Git 就建不了。' : (git.path ?? undefined)}
      control={() => (
        <span className="git-status">
          <span className="environment-pill" data-level={missing ? 'danger' : 'ok'}>{checkStatusText(git)}</span>
          {missing && (
            <span className="environment-fix">
              <code>{GIT_INSTALL_HINT}</code>
              <CopyButton text={GIT_INSTALL_HINT} label="复制命令" />
            </span>
          )}
        </span>
      )}
    />
  )
}

function AboutSettings() {
  const connection = useCore((s) => s.connection)
  const shortcuts = [
    ['新建任务', `${PRIMARY_KEY_LABEL}N`],
    ['创建任务（新建任务对话框中）', `${PRIMARY_KEY_LABEL}↵`],
    ['打开 / 关闭设置', `${PRIMARY_KEY_LABEL},`]
  ] as const
  return (
    <>
      <SettingsRow
        label="项目地址"
        control={() => (
          <a className="settings-about-link" href="https://github.com/flyhero/antumi-agents" target="_blank" rel="noreferrer">
            https://github.com/flyhero/antumi-agents
          </a>
        )}
      />
      <SettingsRow label="桌面端版本" control={() => <span className="mono">{packageJson.version}</span>} />
      <SettingsRow label="协议版本" control={() => <span className="mono">{PROTOCOL_VERSION}</span>} />
      <SettingsRow
        label="Antumi core"
        control={() => (
          <span className="connection" data-state={connection}>
            <span className="connection-dot" aria-hidden="true" />
            {CONNECTION_TEXT[connection]}
          </span>
        )}
      />
      <GitRow />
      {shortcuts.map(([label, keys]) => (
        <SettingsRow key={label} label={label} control={() => <kbd className="settings-kbd">{keys}</kbd>} />
      ))}
    </>
  )
}

type Section = {
  id: string
  group: string
  title: string
  description: string
  keywords: readonly string[]
  Icon: () => ReactElement
  Body: () => ReactElement
}

const SECTIONS: readonly Section[] = [
  {
    id: 'appearance',
    group: '界面',
    title: '外观',
    description: '主题、终端和聊天页的显示方式。',
    keywords: ['主题', '浅色', '深色', '跟随系统', '终端', '字号', '字体', '聊天', '宽度', '全宽', '折叠', '回合', '工作了'],
    Icon: ContrastIcon,
    Body: AppearanceSettings
  },
  {
    id: 'translation',
    group: '界面',
    title: '翻译',
    description: 'Agent 的回复不是你常用的语言时，翻译成你选的语言。',
    keywords: ['翻译', '语言', '中文', '英文', 'english', '日语', '韩语', '自动翻译', '原文', '译文', 'haiku'],
    Icon: TranslateIcon,
    Body: TranslationSettings
  },
  {
    id: 'usage',
    group: '界面',
    title: '用量额度',
    description: '底部状态栏里的 Agent 订阅额度。',
    keywords: ['状态栏', '额度', '百分比', '已用', '剩余', ...AGENT_KINDS],
    Icon: GaugeIcon,
    Body: UsageSettings
  },
  {
    // In Electron only: a plain browser has no dock icon and nothing to click back to.
    id: 'notifications',
    group: '界面',
    title: '通知',
    description: 'Agent 需要你的时候，怎么告诉你。',
    keywords: ['通知', '提醒', '角标', 'dock', '前台', '等待', '确认', '做完', '异常退出', '弹窗', '卡片', '顶部', '审批', '允许'],
    Icon: BellIcon,
    Body: NotificationSettings
  },
  {
    id: 'agents',
    group: '任务',
    title: '智能体',
    description: '这台电脑上的 Agent：是否安装、版本和登录状态（缺什么会给出命令），以及新任务和会话的默认行为。',
    keywords: ['agent', '默认', '已安装', '未安装', '安装', '登录', '版本', '检测', '环境', '检查', 'path', '找不到', '启用', '禁用', ...AGENT_KINDS, '执行', '聊天', '会话', '任务', '规划', '预约', '无人值守', '记录', '历史', '总结', '模型', '轻量', '提交信息', 'haiku', '标题', '命名', '重命名', '首轮', '每轮'],
    Icon: SparkIcon,
    Body: AgentSettings
  },
  {
    id: 'agent-stats',
    group: '任务',
    title: '智能体表现',
    description: '每个 Agent 和模型的表现。任务看你接受、继续修改、重做的比例（从 0.10.0 起记录）；自由会话看用量：回合、失败、撞额度、耗时和 token。',
    keywords: ['表现', '统计', '通过率', '接受', '继续修改', '重做', '耗时', 'token', '模型', '会话', '用量', '回合', '失败', '额度', ...AGENT_KINDS],
    Icon: GaugeIcon,
    Body: AgentStatsSettings
  },
  {
    id: 'projects',
    group: '项目',
    title: '最近使用',
    description: '添加项目时「最近使用」里列出的项目。移除只是不再列出，不影响已有的任务和会话。',
    keywords: ['项目', '仓库', '最近使用', '路径', '文件夹'],
    Icon: FolderIcon,
    Body: ProjectSettings
  },
  {
    id: 'about',
    group: '其他',
    title: '关于',
    description: '项目地址、版本、连接状态、Git 与快捷键。',
    keywords: ['项目地址', 'GitHub', '仓库', '版本', '协议', '连接', 'core', 'git', '环境', '快捷键'],
    Icon: InfoIcon,
    Body: AboutSettings
  }
]

// On a core that keeps them: the user's own slash commands; it follows 智能体.
const CHAT_COMMANDS_SECTION: Section = {
  id: 'chat-commands',
  group: '任务',
  title: '聊天命令',
  description: '自己的斜杠命令：在输入框里输入 / 选用，把存好的提示词填进输入框，改完再发。Claude Code 和 Codex 都能用。',
  keywords: ['命令', '斜杠', '/', '提示词', '模板', 'prompt', '聊天', '会话', '快捷'],
  Icon: ChatIcon,
  Body: ChatCommandSettings
}

// On a core with a skills library: the Agent Skills it installs for agents; it follows 聊天命令.
const SKILLS_SECTION: Section = {
  id: 'skills',
  group: '任务',
  title: '技能',
  description: '给 Agent 安装 Agent Skills（SKILL.md）：从 Git 仓库装一次，固定在安装时的提交，启动时交给 Claude Code 和 Cursor。',
  keywords: ['技能', 'skill', 'skills', '插件', 'plugin', 'obsidian', 'markdown', '安装', '更新', '回退', '仓库', 'git', ...AGENT_KINDS],
  Icon: SparkIcon,
  Body: SkillsSettingsSection
}

// On a core that keeps them: the user's MCP servers, handed to agents at each start; it follows 技能.
const MCP_SECTION: Section = {
  id: 'mcp',
  group: '任务',
  title: 'MCP',
  description: '在 Antumi 里维护 MCP 服务器，启动时交给你选的 Agent，不改它们自己的配置；可以测试连接，也可以从 Claude、Codex、Cursor 导入。',
  keywords: ['mcp', '服务器', 'server', '工具', 'tool', '导入', '连接', '测试', 'token', '令牌', '环境变量', '请求头', ...AGENT_KINDS],
  Icon: PlugIcon,
  Body: McpSettingsSection
}

// On a core that keeps a wire log: whether it does, and what it holds.
const DEBUG_SECTION: Section = {
  id: 'debug',
  group: '其他',
  title: '调试',
  description: '原样记下 Antumi 和 Agent 之间收发的数据，在检查器的「原始数据」里查看。',
  keywords: ['调试', 'debug', '原始数据', '日志', 'log', 'stdout', 'stderr', 'stdin', 'json', '协议', '抓包', 'wire'],
  Icon: BugIcon,
  Body: DebugSettings
}

// The user's local notes, on a core that hands them to agents; it sits before the browser.
const KNOWLEDGE_SECTION: Section = {
  id: 'knowledge',
  group: '集成',
  title: '知识库',
  description: '连接 Markdown 文件夹或 Obsidian 库，让 Agent 读取资料、保存总结和笔记。',
  keywords: ['知识库', 'obsidian', 'vault', '笔记', '总结', '记录', 'markdown', '双链', '集成'],
  Icon: BookIcon,
  Body: KnowledgeBaseSettings
}

// The browser Antumi hosts for chat agents, where core offers one; it follows the task sources.
const BROWSER_SECTION: Section = {
  id: 'browser',
  group: '集成',
  title: '浏览器',
  description: 'Antumi 托管的 Chromium：安装状态，以及 Agent 打开页面时是否自动显示浏览器面板。',
  keywords: ['浏览器', 'chromium', '网页', '截图', '安装', '面板', '集成'],
  Icon: GlobeIcon,
  Body: BrowserRows
}

const PLUGINS_SECTION: Section = {
  id: 'plugins',
  group: '集成',
  title: '插件',
  description: '安装和管理任务来源插件。登录和筛选条件在对应的集成页面设置。',
  keywords: ['插件', '安装', '更新', '卸载', 'GitHub', 'ZIP'],
  Icon: PuzzleIcon,
  Body: PluginSettings
}

// One section per task source, from what its provider declares; they sit before 关于.
function sourceSections(sources: readonly SourceDescriptor[]): Section[] {
  return sources.map((source) => ({
    id: settingsSectionOf(source.provider),
    group: '集成',
    title: source.name,
    description: `把分给你的 issue 从 ${source.name} 同步到左侧的收件箱，挑出要做的导入成任务。`,
    keywords: [source.name, source.provider, 'token', '登录', '收件箱', 'issue', 'bug', '集成', ...source.settings.map((field) => field.label)],
    Icon: () => <SourceIcon provider={source.provider} />,
    Body: () => <SourceSettingsSection source={source} />
  }))
}

function matches(section: Section, needle: string): boolean {
  return [section.title, section.description, ...section.keywords].some((text) => text.toLowerCase().includes(needle))
}

// Laid out like Orca's settings: sections on the left, one section at a time on the right.
export function SettingsPage() {
  useOccludesBrowser()
  const sources = useCore((s) => s.sources)
  const plugins = useCore((s) => s.rpc?.features.includes('plugins') ?? false)
  const browser = useBrowserSupported()
  const knowledge = useKnowledgeBaseSupported()
  const skills = useSkillsSupported()
  const mcp = useMcpServersSupported()
  const chatCommands = useChatCommandsSupported()
  const wireLog = useWireLogSupported()
  const sections = useMemo(() => {
    const about = SECTIONS.filter((section) => section.id === 'about')
    const own = SECTIONS.filter((section) => section.id !== 'about' && (section.id !== 'notifications' || canNotify() || canShowRequestPopup()))
      .flatMap((section) => (section.id === 'agents' ? [section, ...(chatCommands ? [CHAT_COMMANDS_SECTION] : []), ...(skills ? [SKILLS_SECTION] : []), ...(mcp ? [MCP_SECTION] : [])] : [section]))
    return [...own, ...(plugins ? [PLUGINS_SECTION] : []), ...sourceSections(sources ?? []), ...(knowledge ? [KNOWLEDGE_SECTION] : []), ...(browser ? [BROWSER_SECTION] : []), ...(wireLog ? [DEBUG_SECTION] : []), ...about]
  }, [sources, browser, knowledge, skills, mcp, chatCommands, wireLog, plugins])
  const [activeId, setActiveId] = useState(() => useCore.getState().settingsSection ?? SECTIONS[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = needle ? sections.filter((section) => matches(section, needle)) : sections
  // While searching, stay on the chosen section if it still matches, else show the first match.
  const active = visible.find((section) => section.id === activeId) ?? visible[0]
  const groups = [...new Set(visible.map((section) => section.group))]

  return (
    <div className="settings">
      <aside className="settings-nav" aria-label="设置分类">
        <div className="settings-nav-top">
          <button type="button" className="settings-back" onClick={() => setSettingsOpen(false)}>
            <ArrowLeftIcon />
            返回
          </button>
        </div>
        <div className="settings-search">
          <SearchIcon />
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索设置"
            aria-label="搜索设置"
            autoFocus
          />
        </div>
        <nav className="settings-groups">
          {groups.map((group) => (
            <div key={group} className="settings-group">
              <p className="settings-group-title">{group}</p>
              {visible
                .filter((section) => section.group === group)
                .map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className="settings-nav-item"
                    aria-current={section.id === active?.id ? 'page' : undefined}
                    onClick={() => setActiveId(section.id)}
                  >
                    <section.Icon />
                    {section.title}
                  </button>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="settings-content">
        <div className="titlebar-drag" aria-hidden="true" />
        <div className="settings-inner">
          {active ? (
            <section aria-labelledby={`settings-${active.id}`}>
              <header className="settings-section-header">
                <h2 id={`settings-${active.id}`}>{active.title}</h2>
                <p>{active.description}</p>
              </header>
              <div className="settings-card">
                <active.Body />
              </div>
            </section>
          ) : (
            <p className="settings-none">没有找到与「{query.trim()}」相关的设置</p>
          )}
        </div>
      </main>
    </div>
  )
}
