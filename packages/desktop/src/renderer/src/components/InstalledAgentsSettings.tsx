import { getLocale, t, tr } from '../i18n'
import { useId, useState, type ReactNode } from 'react'
import { AGENT_KINDS, agentDescriptor, type AgentCliInstallation, type AgentKind, type DetectedAgent, type EnvironmentCheck } from '@antumi/protocol'
import { installAgentCli, refreshEnvironment, showTerminal, useCore } from '../core-store'
import { checkStatusText } from '../environment-text'
import { agentLabel } from '../labels'
import { setPreference, usePreferences } from '../preferences'
import { CopyButton } from './CopyButton'
import { AgentIcon, RefreshIcon } from './icons'
import { Toggle } from './SettingsControls'

// Turning one off takes it out of every choice of agent for new work; the last one on stays on.
function setEnabled(kind: AgentKind, enabled: boolean): void {
  const { disabledAgents } = usePreferences.getState()
  setPreference('disabledAgents', enabled ? disabledAgents.filter((each) => each !== kind) : [...new Set([...disabledAgents, kind])])
}

// What to type to put it right, copyable: an install for one that is not there, a sign-in for one
// with no account.
function Fix({ label, command }: { label: string; command: string }) {
  return (
    <p className="environment-fix">
      <span>{label}</span>
      <code>{command}</code>
      <CopyButton text={command} label={t('InstalledAgentsSettings.copyCommand')} />
    </p>
  )
}

function AgentRow({ kind, check, enabled, last }: { kind: AgentKind; check: EnvironmentCheck; enabled: boolean; last: boolean }) {
  const labelId = useId()
  const version = check.version ?? (check.status === 'unknown' ? t('InstalledAgentsSettings.versionUnknown') : null)
  return (
    <div className="settings-row agent-row" data-off={!enabled || undefined}>
      <span className="agent-row-icon" aria-hidden="true"><AgentIcon agent={kind} /></span>
      <div className="settings-row-text">
        <div className="agent-row-head">
          <span id={labelId} className="settings-row-label">{agentLabel(kind)}</span>
          {version && <span className="agent-row-version mono" title={check.path ?? undefined}>{version}</span>}
          {!enabled && <span className="agent-row-pill">{t('InstalledAgentsSettings.disabled')}</span>}
          {check.signedIn !== null && (
            <span className="environment-pill" data-level={check.signedIn ? 'ok' : 'warning'}>{check.signedIn ? t('InstalledAgentsSettings.signedIn') : t('InstalledAgentsSettings.notSignedIn')}</span>
          )}
        </div>
        {check.status === 'unknown' && <p className="settings-row-description">{tr('InstalledAgentsSettings.checkWhetherTheCliCanStart', { value1: checkStatusText(check), value2: agentDescriptor(kind, getLocale()).environment.outdated?.hint ?? '' })}</p>}
        {check.signedIn === false && <Fix label={t('InstalledAgentsSettings.signIn')} command={agentDescriptor(kind, getLocale()).environment.signIn} />}
      </div>
      <div className="settings-row-control">
        <Toggle
          labelId={labelId}
          checked={enabled}
          disabled={enabled && last}
          title={enabled && last ? t('InstalledAgentsSettings.keepAtLeastOneAgentEnabled') : undefined}
          onChange={(next) => setEnabled(kind, next)}
        />
      </div>
    </div>
  )
}

// One Antumi can run but this machine does not have: dimmed, with what to type to install it.
function MissingAgentRow({ kind, installation }: { kind: AgentKind; installation?: AgentCliInstallation }) {
  const [opening, setOpening] = useState(false)
  const terminal = useCore((s) => installation ? s.terminals.findLast((each) => !each.conversationId && each.command === installation.command) : undefined)
  const running = terminal && !terminal.exited
  const failed = terminal?.exited && terminal.exitCode !== 0
  const install = async () => {
    if (opening) return
    if (running) { showTerminal(terminal.id); return }
    setOpening(true)
    try { await installAgentCli(kind) } finally { setOpening(false) }
  }
  return (
    <div className="settings-row agent-row" data-off>
      <span className="agent-row-icon" aria-hidden="true"><AgentIcon agent={kind} /></span>
      <div className="settings-row-text">
        <div className="agent-row-head">
          <span className="settings-row-label">{agentLabel(kind)}</span>
          <span className="agent-row-pill">{installation ? t('InstalledAgentsSettings.cliNotFound') : t('AgentPicker.notInstalled')}</span>
        </div>
        <p className="settings-row-description">{installation ? t('InstalledAgentsSettings.appDetectedInstallItsCliToUseIt', { value1: agentLabel(kind) }) : agentDescriptor(kind, getLocale()).environment.role}</p>
        <Fix label={t('InstalledAgentsSettings.install')} command={installation?.command ?? agentDescriptor(kind, getLocale()).environment.install} />
        {installation && (
          <div className="agent-install-actions">
            <button type="button" className="button" disabled={opening} onClick={() => void install()}>
              {opening ? t('InstalledAgentsSettings.openingTerminal') : running ? t('InstalledAgentsSettings.viewInstallationProgress') : failed ? t('InstalledAgentsSettings.retryInstallation') : t('InstalledAgentsSettings.installInTerminal')}
            </button>
            {terminal?.exited && <button type="button" className="button ghost" onClick={() => showTerminal(terminal.id)}>{t('InstalledAgentsSettings.viewInstallationOutput')}</button>}
            {terminal?.exited && <span className="settings-row-description">{failed ? t('InstalledAgentsSettings.installationFailedExitCodeReviewOutputAndRetry', { value1: terminal.exitCode ?? t('InstalledAgentsSettings.unknown') }) : t('InstalledAgentsSettings.installationCommandFinishedIfCliIsStillMissing')}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function DetectedAgentRow({ agent }: { agent: DetectedAgent }) {
  const cli = agent.cliCheck
  let cliLabel = t('InstalledAgentsSettings.appFoundAgentCommandNotFound')
  if (cli?.status === 'responded') cliLabel = t('InstalledAgentsSettings.commandResponded', { value1: cli.version ? ` · ${cli.version}` : t('InstalledAgentsSettings.versionNotRecognized') })
  else if (cli?.reason === 'windows-shim') cliLabel = t('InstalledAgentsSettings.commandFoundCannotVerifyVersionThroughWindowsCommand')
  else if (cli?.reason === 'probe-failed') cliLabel = t('InstalledAgentsSettings.commandFoundVersionCheckFailedMayNotStart')
  else if (agent.locations.some((location) => location.source === 'cli')) cliLabel = t('InstalledAgentsSettings.commandFoundVersionNotVerified')
  return (
    <div className="settings-row agent-row">
      <span className="agent-row-icon" aria-hidden="true"><AgentIcon agent={null} /></span>
      <div className="settings-row-text">
        <div className="agent-row-head">
          <span className="settings-row-label">{agent.name}</span>
          <span className="agent-row-pill">{t('InstalledAgentsSettings.notSupportedYet')}</span>
        </div>
        <p className="settings-row-description">{cliLabel}</p>
        {agent.locations.map(({ source, path }) => (
          <p key={`${source}:${path}`} className="settings-row-description mono agent-row-where" title={path}>
            {source === 'cli' ? t('chatTools.command') : t('InstalledAgentsSettings.app')} · {path}
          </p>
        ))}
      </div>
    </div>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="agent-group">
      <div className="agent-group-head">
        <span className="agent-group-title">{title}</span>
        <span className="agent-list-count">{count}</span>
      </div>
      {children}
    </div>
  )
}

// Every agent in one place, as core found them: the ones Antumi runs, each on until turned off (off,
// it is not offered for new tasks and conversations; what already runs on it carries on); the
// ones it runs that are not installed, with how to install them; and others it found but cannot
// run yet. Git, which is not an agent, is under 关于.
export function InstalledAgentsSettings() {
  const environment = useCore((s) => s.environment)
  const installationSupported = useCore((s) => s.rpc?.features.includes('agent-cli-installation') ?? false)
  const disabled = usePreferences((s) => s.disabledAgents)
  const [checking, setChecking] = useState(false)
  const checkOf = (kind: AgentKind) => environment?.checks.find((each) => each.tool === kind)
  const found = AGENT_KINDS.flatMap((kind) => {
    const check = checkOf(kind)
    return check && check.status !== 'missing' ? [{ kind, check }] : []
  })
  const missing = AGENT_KINDS.filter((kind) => checkOf(kind)?.status === 'missing')
  const other = environment?.detectedAgents?.filter((agent) => !AGENT_KINDS.some((kind) => kind === agent.id)) ?? []
  const enabledCount = found.filter(({ kind }) => !disabled.includes(kind)).length
  const recheck = async () => {
    setChecking(true)
    try {
      await refreshEnvironment()
    } finally {
      setChecking(false)
    }
  }
  return (
    <div className="agent-list">
      <div className="agent-list-head">
        <span className="agent-list-title">{t('InstalledAgentsSettings.agentsOnThisComputer')}</span>
        <button type="button" className="button ghost agent-list-refresh" onClick={() => void recheck()} disabled={checking} title={t('InstalledAgentsSettings.scanAgainAfterInstallingOrSigningIn')}>
          <RefreshIcon />
          {checking ? t('InstalledAgentsSettings.scanning') : t('InstalledAgentsSettings.scanAgain')}
        </button>
      </div>
      {!environment && <p className="settings-row-description agent-list-note">{t('InstalledAgentsSettings.notScannedYet')}</p>}
      <Group title={t('InstalledAgentsSettings.installed')} count={found.length}>
        {found.map(({ kind, check }) => (
          <AgentRow key={kind} kind={kind} check={check} enabled={!disabled.includes(kind)} last={enabledCount <= 1} />
        ))}
      </Group>
      <Group title={t('InstalledAgentsSettings.availableToInstall')} count={missing.length}>
        {missing.map((kind) => <MissingAgentRow key={kind} kind={kind} installation={installationSupported ? environment?.cliInstallations?.find((each) => each.agent === kind) : undefined} />)}
      </Group>
      <Group title={t('InstalledAgentsSettings.notSupportedYet')} count={other.length}>
        <p className="settings-row-description agent-list-note">{t('InstalledAgentsSettings.foundOnThisComputerButCannotRunIn')}</p>
        {other.map((agent) => <DetectedAgentRow key={agent.id} agent={agent} />)}
      </Group>
      {environment && (
        <details className="environment-search-path">
          <summary>{tr('InstalledAgentsSettings.antumiSearchesTheseDirectoriesForCommands', { value1: environment.searchPath.length })}</summary>
          <p className="settings-row-description">{t('InstalledAgentsSettings.pathUsedByCoreAndAgentsPlusCommon')}</p>
          <ul className="mono">
            {environment.searchPath.map((dir) => (
              <li key={dir}>{dir}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
