import type { AgentCliStatus } from '@antumi/protocol'
import { t } from './i18n'

export function cliStatusText(status: AgentCliStatus): string {
  switch (status.phase) {
    case 'checking': return t('agentCli.checking')
    case 'starting': return t('agentCli.starting')
    case 'running': return t('agentCli.running')
    case 'succeeded': return t('agentCli.succeeded')
    case 'unchanged': return t('agentCli.unchanged')
    case 'cancelled': return t('agentCli.cancelled')
    case 'error': return t('agentCli.failed')
  }
  switch (status.availability) {
    case 'current': return t('agentCli.current')
    case 'available': return t('agentCli.available')
    case 'managed': return status.channel === 'desktop' ? t('agentCli.appManaged') : t('agentCli.selfManaged')
    case 'missing': return t('agentCli.missing')
    case 'unknown': return t('agentCli.unknown')
  }
}
export function cliErrorText(error: string): string {
  switch (error) {
    case 'agent-cli-active': return t('agentCli.active')
    case 'agent-cli-maintenance-running': return t('agentCli.busy')
    case 'agent-cli-daemon-outdated': case 'unknown-method': return t('agentCli.daemonOutdated')
    case 'agent-cli-target-changed': return t('agentCli.changed')
    case 'agent-cli-network': return t('agentCli.network')
    case 'agent-cli-source-unknown': return t('agentCli.manual')
    case 'agent-cli-version-unchanged': return t('agentCli.unchangedHint')
    case 'agent-cli-target-not-reached': return t('agentCli.targetNotReached')
    case 'agent-cli-version-unverified': return t('agentCli.unverified')
    case 'agent-cli-timed-out': return t('agentCli.timeout')
    case 'agent-cli-cancelled': return t('agentCli.cancelled')
    case 'daemon-unavailable': return t('agentCli.disconnected')
    case 'agent-cli-interrupted': return t('agentCli.interrupted')
    default: return t('agentCli.failedHint')
  }
}
