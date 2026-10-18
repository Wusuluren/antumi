import type { BrowserStatus, WireUsage } from '@antumi/protocol'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { AGENT_KINDS, agentDescriptor, LANGUAGE_NAMES, PROTOCOL_VERSION, quickModel, TRANSLATE_LANGUAGES, UNATTENDED_MODES, type AgentKind, type SourceDescriptor } from '@antumi/protocol'
import packageJson from '../../../../package.json'
import { perform, setAwakeMode, setChatSettings, setSettingsOpen, useAwakeSupported, useCore, useBrowserSupported, useChatCommandsSupported, useKnowledgeBaseSupported, useMcpServersSupported, useProjectConfigEditSupported, useSkillsSupported, useTranslateSupported, useWireLogSupported } from '../core-store'
import { DEFAULT_PREFERENCES, setPreference, usePreferences } from '../preferences'
import { PRIMARY_KEY_LABEL } from '../shortcut-keys'
import { UNATTENDED_LABEL } from '../schedules'
import { useInstalledAgents } from '../installed-agents'
import { useAgentCatalog } from '../agent-models'
import { ChatPicker } from './ChatPicker'
import { PluginSettings } from './PluginSettings'
import { InstalledAgentsSettings } from './InstalledAgentsSettings'
import { TitleNamingSettings } from './TitleNamingSettings'
import { AutoArchiveSettings } from './AutoArchiveSettings'
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
import { ChatCommandSettings } from './ChatCommandSettings'
import { KnowledgeBaseSettings } from './KnowledgeBaseSettings'
import { SkillsSettingsSection } from './SkillsSettingsSection'
import { McpSettingsSection } from './McpSettingsSection'
import { CopyButton } from './CopyButton'
import { checkStatusText, GIT_INSTALL_HINT } from '../environment-text'
import { settingsSectionOf } from './SourceInboxView'
import { SourceSettingsSection } from './SourceSettingsSection'
import { projectName } from './ProjectPicker'
import { Resettable, Segmented, SettingsGroup, SettingsRow, Stepper, Toggle } from './SettingsControls'
import { CjkFontPicker } from './CjkFontPicker'
import { ProjectConfigDialog, projectConfigSummary } from './ProjectConfigDialog'
import { PalettePicker } from './PalettePicker'
import { BackdropPicker } from './BackdropPicker'
import { useOccludesBrowser } from '../browser-occlusion'
import { AntSettings } from './AntPreview'

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
      <SettingsGroup title="颜色">
        <SettingsRow
          label="主题"
          description="跟随系统时，随系统的浅色、深色设置切换。"
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
          description="整套界面颜色，随主题切换浅色或深色；色卡左浅右深。"
          control={(labelId) => <PalettePicker labelId={labelId} />}
        />
        <SettingsRow
          label="渐变背景（实验）"
          description="侧边栏和窗口四周铺一层渐变，内容区浮在上面。取自 Slack 的主题，和配色分开选，左浅右深。"
          control={(labelId) => <BackdropPicker labelId={labelId} />}
        />
      </SettingsGroup>
      <AntSettings />
      <SettingsGroup title="聊天">
        <SettingsRow
          label="字号"
          description="消息、过程信息和输入框的文字大小。"
          control={(labelId) => (
            <Resettable label="聊天字号" changed={chatFontSize !== DEFAULT_PREFERENCES.chatFontSize} onReset={() => setPreference('chatFontSize', DEFAULT_PREFERENCES.chatFontSize)}>
              <Stepper
                labelId={labelId}
                value={chatFontSize}
                min={10}
                max={20}
                unit="px"
                onChange={(next) => setPreference('chatFontSize', next)}
              />
            </Resettable>
          )}
        />
        <SettingsRow
          label="字体"
          description="衬线只改正文，代码不变。"
          control={(labelId) => <ChatFontPicker labelId={labelId} />}
        />
        <SettingsRow
          label="中文字体"
          description="聊天里的中文用它显示，英文仍用上面的字体。默认是苹方，选衬线时是宋体。"
          control={(labelId) => <CjkFontPicker labelId={labelId} preference="chatCjkFontFamily" title="选择聊天的中文字体" />}
        />
        <SettingsRow
          label="页面宽度"
          description="消息和输入框的最大宽度：窄 800px，中等 1200px。"
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
          description="把思考、命令和中间回复收进「工作了 N 秒」，只留最终回答，点开可看。"
          control={(labelId) => (
            <Toggle labelId={labelId} checked={foldTurns} onChange={(next) => setPreference('foldTurns', next)} />
          )}
        />
      </SettingsGroup>
      <SettingsGroup title="终端与代码">
        <SettingsRow
          label="代码字体"
          description="终端、代码块、改动和文件预览的字体。默认 Geist Mono，也可选本机等宽字体。"
          control={(labelId) => <CodeFontPicker labelId={labelId} />}
        />
        <SettingsRow
          label="代码中文字体"
          description="终端、代码和文件预览里的中文用它显示，代码字体里没有中文时才用到。默认是苹方。"
          control={(labelId) => <CjkFontPicker labelId={labelId} preference="codeCjkFontFamily" title="选择代码的中文字体" />}
        />
        <SettingsRow
          label="终端字号"
          description="对已打开的终端立即生效。"
          control={(labelId) => (
            <Resettable label="终端字号" changed={terminalFontSize !== DEFAULT_PREFERENCES.terminalFontSize} onReset={() => setPreference('terminalFontSize', DEFAULT_PREFERENCES.terminalFontSize)}>
              <Stepper
                labelId={labelId}
                value={terminalFontSize}
                min={10}
                max={20}
                unit="px"
                onChange={(next) => setPreference('terminalFontSize', next)}
              />
            </Resettable>
          )}
        />
        <SettingsRow
          label="终端行高"
          description="字体自身行高的倍数。Geist Mono 用 1.0 即可，Menlo 这类行距紧的字体可调大。"
          control={(labelId) => (
            <Resettable label="终端行高" changed={terminalLineHeight !== DEFAULT_PREFERENCES.terminalLineHeight} onReset={() => setPreference('terminalLineHeight', DEFAULT_PREFERENCES.terminalLineHeight)}>
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
            </Resettable>
          )}
        />
        {colorPromptSupported && (
          <SettingsRow
            label="彩色提示符"
            description="zsh 未自定义提示符时，换成带颜色和 git 分支的提示符，命令失败时 % 变红。只影响 Antumi 新开的终端，不改 ~/.zshrc。"
            control={(labelId) => <Toggle labelId={labelId} checked={colorPrompt} onChange={(next) => setPreference('colorPrompt', next)} />}
          />
        )}
      </SettingsGroup>
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
          description="窗口不在前台时，Agent 等你确认、做完一轮、异常退出或定时任务完成时通知你，点击回到对应会话。"
          control={(labelId) => <Toggle labelId={labelId} checked={notifications} onChange={(next) => setPreference('notifications', next)} />}
        />
      )}
      {canShowRequestPopup() && (
        <SettingsRow
          label="离开时在屏幕顶部弹出待处理的请求"
          description="在别的应用里时，待确认的请求以卡片弹出，可直接选择，不抢焦点；这类请求不再另发系统通知。"
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
    { value: '', label: `自动（${cheapestLabel}）`, description: '最便宜的小模型' },
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
        description="只翻译显示在屏幕上的回复，点「原文」查看原文。"
        control={(labelId) => <Toggle labelId={labelId} checked={auto} onChange={(next) => setPreference('autoTranslate', next)} />}
      />
      <p className="settings-note">
        由会话所用的 Agent 翻译，模型在 智能体 →「轻量任务用的模型」里选。翻译单独请求，不占会话上下文，但计入该 Agent 的用量；同一条回复只翻一次。
      </p>
    </>
  )
}

function UsageSettings() {
  const showUsage = usePreferences((s) => s.showUsage)
  const display = usePreferences((s) => s.usageDisplay)
  const announcements = useCore((s) => s.chatSettings?.resetAnnouncements)
  return (
    <>
      <SettingsRow
        label="在状态栏显示用量额度"
        description="各 Agent 订阅的额度窗口，如 5 小时、每周或每月。"
        control={(labelId) => (
          <Toggle labelId={labelId} checked={showUsage} onChange={(next) => setPreference('showUsage', next)} />
        )}
      />
      <SettingsRow
        label="百分比显示"
        description="只改显示的数字，不影响快用完时的颜色提醒。"
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
      {announcements !== undefined && (
        <SettingsRow
          label="显示全员重置预告"
          description="OpenAI 等在 X 上宣布给所有人重置额度时，在用量卡片里显示预告和最近一次重置。由社区网站 LimitReset 汇总，每小时问一次，请求不带你的账号信息。"
          control={(labelId) => (
            <Toggle labelId={labelId} checked={announcements} onChange={(next) => void setChatSettings({ resetAnnouncements: next })} />
          )}
        />
      )}
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
        description="Agent 用内置浏览器打开、截图和点击页面，显示在右侧面板。本地地址直接打开，其他网站首次访问先问你。"
        control={() => <span className="muted">{browserStatusText(status)}</span>}
      />
      <SettingsRow
        label="Agent 打开页面时自动显示浏览器"
        description="关闭后，在页面卡片上点「打开」才显示。"
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
  const running = chatSettings?.maxConcurrentAgents !== undefined || Boolean(chatSettings?.agentConcurrency) || (awakeSupported && Boolean(awake)) || Boolean(chatSettings?.unattendedMode)
  const access = chatSettings?.userBrowser !== undefined || chatSettings?.readHistory !== undefined
  return (
    <>
      <SettingsGroup>
        <InstalledAgentsSettings />
      </SettingsGroup>
      {running && (
        <SettingsGroup title="运行">
          {chatSettings?.maxConcurrentAgents !== undefined && (
            <SettingsRow
              label="同时运行的 Agent 总数"
              description="到上限后新会话需稍后再试，预约任务排队。等你确认的也占名额；调低不会停掉运行中的会话。下面各 Agent 的上限同样受此约束。"
              control={(labelId) => (
                <Stepper labelId={labelId} value={chatSettings.maxConcurrentAgents ?? 20} min={1} max={50} unit="个" onChange={(maxConcurrentAgents) => void setChatSettings({ maxConcurrentAgents })} />
              )}
            />
          )}
          {chatSettings?.agentConcurrency && AGENT_KINDS.map((agent) => (
            <SettingsRow
              key={agent}
              label={`${agentLabel(agent)} 同时运行`}
              control={(labelId) => (
                <Stepper labelId={labelId} value={chatSettings.agentConcurrency?.[agent] ?? 6} min={1} max={50} unit="个" onChange={(count) => void setChatSettings({ agentConcurrency: { [agent]: count } })} />
              )}
            />
          ))}
          {awakeSupported && awake && (
            <SettingsRow
              label="保持电脑唤醒"
              description="Agent 等你输入时不阻止睡眠；合上笔记本仍会睡眠。"
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
          {chatSettings?.unattendedMode && (
            <SettingsRow
              label="预约运行的权限"
              description="预约的任务和会话到点后以此模式无人值守地开始。「自动接受编辑」遇到其他确认会停下；「全部放行」什么都不问、不受沙箱限制，只用于信任的任务。"
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
        </SettingsGroup>
      )}
      <SettingsGroup title="会话">
        {chatSettings && (
          <SettingsRow
            label="回合结束后建议下一步"
            description="每轮回复后用灰字预测你的下一句，按 Tab 或 → 填入。每轮多一次简短请求。仅 Claude Code 支持，下次启动起生效。"
            control={(labelId) => (
              <Toggle labelId={labelId} checked={chatSettings.promptSuggestions} onChange={(next) => void setChatSettings({ promptSuggestions: next })} />
            )}
          />
        )}
        <TitleNamingSettings />
        <AutoArchiveSettings />
        <SettingsRow
          label="轻量任务用的模型"
          description="翻译、提交信息、会话标题等小活用同一 Agent 的这个模型；默认用它最便宜的模型。"
          control={() => (
            <span className="quick-models">
              {installed.map((agent) => <QuickModelPicker key={agent} agent={agent} />)}
            </span>
          )}
        />
      </SettingsGroup>
      {access && (
        <SettingsGroup title="访问">
          {chatSettings?.userBrowser !== undefined && (
            <SettingsRow
              label="让 Claude Code 操作你的 Chrome"
              description="通过 Claude in Chrome 扩展，用你已登录的 Chrome 打开、点击和填写网页。需先装好扩展，下次启动起生效。"
              control={(labelId) => (
                <Toggle labelId={labelId} checked={chatSettings.userBrowser ?? true} onChange={(next) => void setChatSettings({ userBrowser: next })} />
              )}
            />
          )}
          {chatSettings?.readHistory !== undefined && (
            <SettingsRow
              label="让 Agent 读你在 Antumi 里的记录"
              description="Agent 可只读地列出和读取你的会话、任务和群聊（含其他 Agent 的），比如让定时任务总结本周工作。下次启动起生效。"
              control={(labelId) => (
                <Toggle labelId={labelId} checked={chatSettings.readHistory ?? true} onChange={(next) => void setChatSettings({ readHistory: next })} />
              )}
            />
          )}
        </SettingsGroup>
      )}
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
    <>
      <p className="settings-note">「项目配置」写在项目里的 .antumi/project.json：新建 worktree 时复制哪些文件、运行什么准备命令，任务提交验收前跑什么检查。移除只是不在最近列表里显示，不影响已有任务和会话。</p>
      <ul className="settings-project-list">
        {projects.map((projectPath) => <ProjectRow key={projectPath} projectPath={projectPath} onForget={() => void forget(projectPath)} />)}
      </ul>
    </>
  )
}

// What a project's config holds, in a few words; asked of core when the row shows and after a save.
function ProjectRow({ projectPath, onForget }: { projectPath: string; onForget: () => void }) {
  const editable = useProjectConfigEditSupported()
  const rpc = useCore((s) => s.rpc)
  const [summary, setSummary] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [reads, setReads] = useState(0)
  useEffect(() => {
    if (!rpc || !editable) return
    let current = true
    rpc.call('projects.config', { path: projectPath }).then(
      (info) => { if (current) setSummary(info ? projectConfigSummary(info.config) : null) },
      () => { if (current) setSummary('格式有误') }
    )
    return () => { current = false }
  }, [rpc, editable, projectPath, reads])
  return (
    <li className="settings-project">
      <span className="settings-project-name">{projectName(projectPath)}</span>
      <span className="settings-project-path mono" title={projectPath}>
        {projectPath}
      </span>
      {summary && <span className="settings-project-config muted">{summary}</span>}
      {editable && <button type="button" className="button" onClick={() => setEditing(true)}>项目配置</button>}
      <button type="button" className="button" onClick={onForget}>
        移除
      </button>
      {editing && <ProjectConfigDialog projectPath={projectPath} onClose={() => setEditing(false)} onSaved={() => setReads((count) => count + 1)} />}
    </li>
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
        description="原样记录收发的每一行（含 stderr、启动命令和退出码），在检查器的「原始数据」里查看。运行中的 Agent 从下一行开始记。"
        control={(labelId) => <Toggle labelId={labelId} checked={wireLog} onChange={(next) => void setChatSettings({ wireLog: next })} />}
      />
      <SettingsRow
        label="已经记下的"
        description={`${usage ? `${usage.files} 段，共 ${formatBytes(usage.bytes)}。` : ''}存在 ~/.antumi/sessions/<会话>/wire/，每段最多 50 MB，7 天后自动删除。含文件内容和命令输出，分享前请检查。`}
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
          <a className="settings-about-link" href="https://github.com/flyhero/antumi" target="_blank" rel="noreferrer">
            https://github.com/flyhero/antumi
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
  // Its body is titled cards of its own (SettingsGroup), not rows for the page to put in one.
  grouped?: true
}

const SECTIONS: readonly Section[] = [
  {
    id: 'appearance',
    group: '界面',
    title: '外观',
    description: '颜色、聊天页和终端的显示。',
    keywords: ['主题', '浅色', '深色', '跟随系统', '颜色', '配色', '终端', '代码', '字号', '字体', '行高', '提示符', 'zsh', '聊天', '宽度', '全宽', '折叠', '回合', '工作了', '中文字体', '恢复默认', '默认'],
    Icon: ContrastIcon,
    Body: AppearanceSettings,
    grouped: true
  },
  {
    id: 'translation',
    group: '界面',
    title: '翻译',
    description: '把 Agent 的回复翻译成你的语言。',
    keywords: ['翻译', '语言', '中文', '英文', 'english', '日语', '韩语', '自动翻译', '原文', '译文', 'haiku'],
    Icon: TranslateIcon,
    Body: TranslationSettings
  },
  {
    id: 'usage',
    group: '界面',
    title: '用量额度',
    description: '状态栏里的 Agent 订阅额度。',
    keywords: ['状态栏', '额度', '百分比', '已用', '剩余', '重置', '全员重置', '预告', 'limitreset', ...AGENT_KINDS],
    Icon: GaugeIcon,
    Body: UsageSettings
  },
  {
    // In Electron only: a plain browser has no dock icon and nothing to click back to.
    id: 'notifications',
    group: '界面',
    title: '通知',
    description: 'Agent 需要你时如何提醒。',
    keywords: ['通知', '提醒', '角标', 'dock', '前台', '等待', '确认', '做完', '异常退出', '弹窗', '卡片', '顶部', '审批', '允许'],
    Icon: BellIcon,
    Body: NotificationSettings
  },
  {
    id: 'agents',
    group: '任务',
    title: '智能体',
    description: '本机 Agent 的安装与登录状态，以及运行、会话和访问的默认设置。',
    keywords: ['agent', '默认', '已安装', '未安装', '安装', '登录', '版本', '检测', '环境', '检查', 'path', '找不到', '启用', '禁用', ...AGENT_KINDS, '执行', '聊天', '会话', '任务', '规划', '预约', '无人值守', '记录', '历史', '总结', '模型', '轻量', '提交信息', 'haiku', '标题', '命名', '重命名', '首轮', '每轮', '归档', '自动归档', '不活跃', '清理'],
    Icon: SparkIcon,
    Body: AgentSettings,
    grouped: true
  },
  {
    id: 'projects',
    group: '项目',
    title: '项目',
    description: '最近使用的项目，以及每个项目新建 worktree 时复制的文件、准备和验收命令。',
    keywords: ['项目', '仓库', '最近使用', '路径', '文件夹', '项目配置', 'setup', 'check', 'worktree', '复制', '.env', '安装依赖', '测试', '验收'],
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
  description: '存好的提示词，在输入框输入 / 选用，填入后可改再发；所有 Agent 通用。',
  keywords: ['命令', '斜杠', '/', '提示词', '模板', 'prompt', '聊天', '会话', '快捷'],
  Icon: ChatIcon,
  Body: ChatCommandSettings
}

// On a core with a skills library: the Agent Skills it installs for agents; it follows 聊天命令.
const SKILLS_SECTION: Section = {
  id: 'skills',
  group: '任务',
  title: '技能',
  description: '从 Git 仓库安装 Agent Skills（SKILL.md），Agent 启动时带上。',
  keywords: ['技能', 'skill', 'skills', '插件', 'plugin', 'obsidian', 'markdown', '安装', '更新', '回退', '仓库', 'git', ...AGENT_KINDS],
  Icon: SparkIcon,
  Body: SkillsSettingsSection,
  grouped: true
}

// On a core that keeps them: the user's MCP servers, handed to agents at each start; it follows 技能.
const MCP_SECTION: Section = {
  id: 'mcp',
  group: '任务',
  title: 'MCP',
  description: '统一管理 MCP 服务器，启动时交给你选的 Agent，也可从各 Agent 的配置导入。',
  keywords: ['mcp', '服务器', 'server', '工具', 'tool', '导入', '连接', '测试', 'token', '令牌', '环境变量', '请求头', ...AGENT_KINDS],
  Icon: PlugIcon,
  Body: McpSettingsSection
}

// On a core that keeps a wire log: whether it does, and what it holds.
const DEBUG_SECTION: Section = {
  id: 'debug',
  group: '其他',
  title: '调试',
  description: 'Antumi 与 Agent 之间的原始数据。',
  keywords: ['调试', 'debug', '原始数据', '日志', 'log', 'stdout', 'stderr', 'stdin', 'json', '协议', '抓包', 'wire'],
  Icon: BugIcon,
  Body: DebugSettings
}

// The user's local notes, on a core that hands them to agents; it sits before the browser.
const KNOWLEDGE_SECTION: Section = {
  id: 'knowledge',
  group: '集成',
  title: '知识库',
  description: '连接 Markdown 文件夹或 Obsidian 库，让 Agent 读资料、记笔记。',
  keywords: ['知识库', 'obsidian', 'vault', '笔记', '总结', '记录', 'markdown', '双链', '集成'],
  Icon: BookIcon,
  Body: KnowledgeBaseSettings
}

// The browser Antumi hosts for chat agents, where core offers one; it follows the task sources.
const BROWSER_SECTION: Section = {
  id: 'browser',
  group: '集成',
  title: '浏览器',
  description: 'Agent 使用的内置浏览器。',
  keywords: ['浏览器', 'chromium', '网页', '截图', '安装', '面板', '集成'],
  Icon: GlobeIcon,
  Body: BrowserRows
}

const PLUGINS_SECTION: Section = {
  id: 'plugins',
  group: '集成',
  title: '插件',
  description: '任务来源插件。登录和筛选在对应的集成页设置。',
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
    description: `把 ${source.name} 里分给你的 issue 同步到收件箱，挑选后导入为任务。`,
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
              {active.grouped ? <active.Body /> : (
                <div className="settings-card">
                  <active.Body />
                </div>
              )}
            </section>
          ) : (
            <p className="settings-none">没有找到与「{query.trim()}」相关的设置</p>
          )}
        </div>
      </main>
    </div>
  )
}
