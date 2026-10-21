import { useState } from 'react'
import type { UpdateState } from '../../../shared/app-update'
import { t } from '../i18n'
import { checkForUpdate, installUpdate, setUpdatePrerelease, skipUpdate, updateOffered, useUpdate } from '../update-state'
import { ArrowUpIcon } from './icons'
import { ChatMarkdown } from './ChatMarkdown'
import { Popover } from './Popover'
import { SettingsRow, Toggle } from './SettingsControls'

const ERROR_TEXT: Record<string, () => string> = {
  'download-failed': () => t('AppUpdate.errorDownload'),
  incomplete: () => t('AppUpdate.errorIncomplete'),
  'digest-mismatch': () => t('AppUpdate.errorDigest'),
  'wrong-app': () => t('AppUpdate.errorBadInstaller'),
  'wrong-version': () => t('AppUpdate.errorBadInstaller'),
  'no-app-in-dmg': () => t('AppUpdate.errorBadInstaller'),
  'agents-running': () => t('AppUpdate.errorAgentsRunning')
}

export function updateErrorText(error: string): string {
  return ERROR_TEXT[error]?.() ?? error
}

const isMac = () => window.antumi?.platform === 'darwin'

// What can be done about the newer version: install it in place where main can, else fetch the
// installer; the release page and skipping either way.
export function UpdateActions({ state, onSkip }: { state: UpdateState; onSkip?: () => void }) {
  const latest = state.latest
  if (!latest) return null
  if (state.status === 'downloading') {
    const percent = Math.round((state.progress ?? 0) * 100)
    return (
      <div className="update-progress" role="status">
        <span>{t('AppUpdate.downloading', { percent })}</span>
        <progress max={100} value={percent} />
      </div>
    )
  }
  if (state.status === 'installing') return <div className="update-progress" role="status">{t('AppUpdate.installing')}</div>
  const failedInstall = state.status === 'error' && state.canInstall
  return (
    <>
      {state.error && state.status === 'error' && <p className="update-error">{t('AppUpdate.failed', { reason: updateErrorText(state.error) })}</p>}
      {!state.canInstall && <p className="update-hint">{isMac() ? t('AppUpdate.manualMac') : t('AppUpdate.manualWindows')}</p>}
      <div className="update-actions">
        {state.canInstall ? (
          <button type="button" className="button primary" onClick={installUpdate}>{failedInstall ? t('AppUpdate.retry') : t('AppUpdate.installAndRestart')}</button>
        ) : (
          latest.download && <a className="button primary" href={latest.download} target="_blank" rel="noreferrer">{t('AppUpdate.downloadInstaller')}</a>
        )}
        <a className="button" href={latest.page} target="_blank" rel="noreferrer">{t('AppUpdate.releasePage')}</a>
        {onSkip && <button type="button" className="button update-skip" onClick={onSkip}>{t('AppUpdate.skipVersion')}</button>}
      </div>
      {state.canInstall && <p className="update-hint">{isMac() ? t('AppUpdate.restartNote') : t('AppUpdate.restartNoteWindows')}</p>}
    </>
  )
}

// A newer Antumi, in the status bar until it is installed or skipped.
export function UpdateButton() {
  const state = useUpdate((s) => s.state)
  const [open, setOpen] = useState(false)
  if (!state?.latest || !updateOffered(state)) return null
  const { latest } = state
  const busy = state.status === 'downloading' || state.status === 'installing'
  return (
    <span className="menu-anchor statusbar-update-anchor">
      <button
        type="button"
        className="tool-button statusbar-update"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-busy={busy || undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <ArrowUpIcon />
        <span>{state.status === 'downloading' ? t('AppUpdate.downloading', { percent: Math.round((state.progress ?? 0) * 100) }) : t('AppUpdate.newVersion', { version: latest.version })}</span>
      </button>
      {open && (
        <Popover label={t('AppUpdate.available', { version: latest.version })} onClose={() => setOpen(false)}>
          <div className="update-card">
            <div className="update-title">{t('AppUpdate.available', { version: latest.version })}</div>
            <div className="update-current">{t('AppUpdate.current', { version: state.current })}</div>
            {latest.notes.trim() && <div className="update-notes"><ChatMarkdown text={latest.notes} highlight={false} /></div>}
            <UpdateActions state={state} onSkip={() => { skipUpdate(latest.version); setOpen(false) }} />
          </div>
        </Popover>
      )}
    </span>
  )
}

function statusText(state: UpdateState): string {
  if (state.status === 'checking') return t('AppUpdate.checking')
  if (state.status === 'error' && !state.latest && state.error) return t('AppUpdate.checkFailed', { reason: updateErrorText(state.error) })
  if (state.latest && state.latest.version === state.skipped) return t('AppUpdate.skipped', { version: state.latest.version })
  if (state.latest) return t('AppUpdate.available', { version: state.latest.version })
  if (state.status === 'none') return t('AppUpdate.upToDate')
  return ''
}

// Under 关于: where the app stands against the latest release, a check on demand, and whether
// pre-releases count.
export function UpdateSettings() {
  const state = useUpdate((s) => s.state)
  if (!state) return null
  const skipped = state.latest !== null && state.latest.version === state.skipped
  const checked = state.checkedAt === null ? null : new Date(state.checkedAt).toLocaleString()
  return (
    <>
      <SettingsRow
        label={t('AppUpdate.updates')}
        description={[t('AppUpdate.updatesDescription'), checked && t('AppUpdate.lastChecked', { time: checked })].filter(Boolean).join(' ')}
        control={() => (
          <span className="update-settings-status">
            <span className="muted">{statusText(state)}</span>
            {skipped && <button type="button" className="button" onClick={() => skipUpdate(null)}>{t('AppUpdate.unskip')}</button>}
            <button type="button" className="button" disabled={state.status === 'checking' || state.status === 'downloading' || state.status === 'installing'} onClick={checkForUpdate}>{t('AppUpdate.checkNow')}</button>
          </span>
        )}
      />
      {state.latest && !skipped && (
        <div className="update-settings-actions">
          <UpdateActions state={state} />
        </div>
      )}
      <SettingsRow
        label={t('AppUpdate.prerelease')}
        description={t('AppUpdate.prereleaseDescription')}
        control={(labelId) => <Toggle labelId={labelId} checked={state.prerelease} onChange={setUpdatePrerelease} />}
      />
    </>
  )
}
