import { t } from '../i18n'
import { useState, type FormEvent } from 'react'
import { AGENT_KINDS, DEFAULT_ACCOUNT, accountUsage, accountsSupported, activeAccount, type AgentAccount, type AgentKind } from '@antumi/protocol'
import { activateAccount, addAccount, removeAccount, renameAccount, setAccountAutoSwitch, signInAccount, useCore } from '../core-store'
import { accountName, accountsOf } from '../agent-accounts'
import { agentLabel } from '../labels'
import { usePreferences } from '../preferences'
import { percentText, windowLabel } from '../usage-format'
import { SettingsGroup, SettingsRow, Toggle } from './SettingsControls'

function UsageSummary({ account }: { account: AgentAccount }) {
  const usage = useCore((s) => accountUsage(s.accountUsage, account.agent, account.id))
  const display = usePreferences((s) => s.usageDisplay)
  const windows = usage?.windows.filter((window) => window.model === null) ?? []
  if (!account.signedIn) return null
  return (
    <p className="settings-row-description">
      {windows.length === 0 ? t('AgentAccounts.noUsage') : windows.map((window) => `${windowLabel(window)} ${percentText(window, display)}`).join(' · ')}
    </p>
  )
}

function AccountRow({ account, active }: { account: AgentAccount; active: boolean }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const own = account.id === DEFAULT_ACCOUNT
  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  const rename = async (event: FormEvent) => {
    event.preventDefault()
    if (renaming === null) return
    await act(() => renameAccount(account.agent, account.id, renaming.trim() || null))
    setRenaming(null)
  }
  return (
    <div className="plugin-row">
      <div className="settings-row">
        <div className="settings-row-text">
          <div className="agent-row-head">
            <span className="settings-row-label">{accountName(account)}</span>
            {active && <span className="agent-row-pill">{t('AgentAccounts.active')}</span>}
            <span className="environment-pill" data-level={account.signedIn ? 'ok' : 'warning'}>{account.signedIn ? t('InstalledAgentsSettings.signedIn') : t('InstalledAgentsSettings.notSignedIn')}</span>
          </div>
          {(account.label && account.email) || account.plan ? (
            <p className="settings-row-description">{[account.label ? account.email : null, account.plan].filter(Boolean).join(' · ')}</p>
          ) : null}
          <UsageSummary account={account} />
        </div>
      </div>
      {renaming !== null && (
        <form className="chat-command-actions" onSubmit={(event) => void rename(event)}>
          <input className="input" autoFocus value={renaming} maxLength={60} placeholder={t('AgentAccounts.namePlaceholder')} onChange={(event) => setRenaming(event.target.value)} />
          <button type="button" className="button ghost" onClick={() => setRenaming(null)}>{t('ChatCommandSettings.cancel')}</button>
          <button type="submit" className="button primary" disabled={busy}>{t('FileEditor.save')}</button>
        </form>
      )}
      <div className="plugin-actions">
        {!active && account.signedIn && (
          <button type="button" className="button" disabled={busy} onClick={() => void act(() => activateAccount(account.agent, account.id))}>{t('AgentAccounts.makeActive')}</button>
        )}
        <button type="button" className="button" disabled={busy} onClick={() => void act(() => signInAccount(account.agent, account.id))}>
          {account.signedIn ? t('AgentAccounts.signInAgain') : t('AgentAccounts.signIn')}
        </button>
        {renaming === null && <button type="button" className="button" disabled={busy} onClick={() => setRenaming(account.label ?? '')}>{t('AgentAccounts.rename')}</button>}
        {!own && (removing ? (
          <>
            <span className="settings-note">{t('AgentAccounts.removeWarning')}</span>
            <button type="button" className="button" disabled={busy} onClick={() => void act(() => removeAccount(account.agent, account.id))}>{t('McpSettingsSection.confirmDeletion')}</button>
            <button type="button" className="button ghost" onClick={() => setRemoving(false)}>{t('ChatCommandSettings.cancel')}</button>
          </>
        ) : <button type="button" className="button ghost" disabled={busy} onClick={() => setRemoving(true)}>{t('ChatCommandSettings.delete')}</button>)}
      </div>
    </div>
  )
}

// Adding one signs it in right away, in the terminal panel, which opens on it.
function AddAccount({ agent }: { agent: AgentKind }) {
  const [label, setLabel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (label === null || busy) return
    setBusy(true)
    try {
      await addAccount(agent, label.trim() || null)
      setStarted(true)
      setLabel(null)
    } finally {
      setBusy(false)
    }
  }
  if (label === null) {
    return (
      <div className="chat-command-actions">
        {started && <span className="settings-note">{t('AgentAccounts.signInHint')}</span>}
        <button type="button" className="button" onClick={() => setLabel('')}>{t('AgentAccounts.add', { value1: agentLabel(agent) })}</button>
      </div>
    )
  }
  return (
    <form className="chat-command-actions" onSubmit={(event) => void add(event)}>
      <input className="input" autoFocus value={label} maxLength={60} placeholder={t('AgentAccounts.namePlaceholder')} onChange={(event) => setLabel(event.target.value)} />
      <button type="button" className="button ghost" onClick={() => setLabel(null)}>{t('ChatCommandSettings.cancel')}</button>
      <button type="submit" className="button primary" disabled={busy}>{t('AgentAccounts.addAndSignIn')}</button>
    </form>
  )
}

// Each agent's accounts, the one its next process starts on, and whether a usage limit moves it on.
export function AgentAccountSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const accounts = useCore((s) => s.accounts)
  if (!connected || !accounts) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  return (
    <>
      <p className="settings-note">{t('AgentAccounts.intro')}</p>
      <SettingsGroup>
        <SettingsRow
          label={t('AgentAccounts.autoSwitch')}
          description={t('AgentAccounts.autoSwitchDescription')}
          control={(labelId) => <Toggle labelId={labelId} checked={accounts.autoSwitch} onChange={(next) => void setAccountAutoSwitch(next)} />}
        />
      </SettingsGroup>
      {AGENT_KINDS.filter(accountsSupported).map((agent) => (
        <SettingsGroup key={agent} title={agentLabel(agent)}>
          {accountsOf(accounts, agent).map((account) => (
            <AccountRow key={account.id} account={account} active={activeAccount(accounts, agent) === account.id} />
          ))}
          <AddAccount agent={agent} />
        </SettingsGroup>
      ))}
    </>
  )
}
