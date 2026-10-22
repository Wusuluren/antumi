import { useEffect, useId, useMemo, useState } from 'react'
import type { AgentKind, Conversation, ExternalSession } from '@antumi/protocol'
import { t } from '../i18n'
import { perform, selectConversation, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { timeAgo } from '../conversation-state'
import { AgentIcon, RefreshIcon } from './icons'
import { projectName } from './ProjectPicker'
import { Segmented, Toggle } from './SettingsControls'

const keyOf = (session: ExternalSession) => `${session.agent}:${session.sessionId}`
const selectable = (session: ExternalSession) => session.problem === null && session.status !== 'imported'

// Sessions Claude Code and Codex ran in a terminal, listed by the folder they ran in; the ones
// picked come in as conversations that go on in the agent's own session.
export function SessionImportSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const [sessions, setSessions] = useState<ExternalSession[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [agent, setAgent] = useState<'all' | AgentKind>('all')
  const [query, setQuery] = useState('')
  const [hideImported, setHideImported] = useState(true)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<Conversation[] | null>(null)
  const hideLabel = useId()
  const filterLabel = useId()

  const load = async () => {
    setLoading(true)
    const found = await perform((rpc) => rpc.call('sessionImports.list', {}))
    setLoading(false)
    if (found) setSessions(found.sessions)
  }
  useEffect(() => { if (connected) void load() }, [connected])

  const agents = useMemo(() => [...new Set((sessions ?? []).map((session) => session.agent))], [sessions])
  const needle = query.trim().toLowerCase()
  const visible = (sessions ?? []).filter((session) => (agent === 'all' || session.agent === agent)
    && (!hideImported || session.status !== 'imported')
    && (!needle || [session.title, session.firstPrompt, session.cwd].some((text) => text.toLowerCase().includes(needle))))
  // By folder, the folder with the latest session first.
  const groups = [...visible.reduce((byCwd, session) => byCwd.set(session.cwd, [...(byCwd.get(session.cwd) ?? []), session]), new Map<string, ExternalSession[]>())]
  const picked = (sessions ?? []).filter((session) => chosen.has(keyOf(session)) && selectable(session))

  const toggle = (keys: readonly string[], on: boolean) => setChosen((current) => {
    const next = new Set(current)
    keys.forEach((key) => (on ? next.add(key) : next.delete(key)))
    return next
  })

  const submit = async () => {
    if (!picked.length || busy) return
    setBusy(true)
    try {
      const result = await perform((rpc) => rpc.call('sessionImports.import', { sessions: picked.map(({ agent: kind, sessionId }) => ({ agent: kind, sessionId })) }))
      if (!result) return
      setImported(result.conversations)
      setChosen(new Set())
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!connected) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  return (
    <>
      <p className="settings-note">{t('SessionImportSettings.note')}</p>
      <div className="session-import-toolbar">
        <span id={filterLabel} hidden>{t('SessionImportSettings.agentFilter')}</span>
        {agents.length > 1 && (
          <Segmented labelId={filterLabel} value={agent} onChange={setAgent}
            options={[{ value: 'all', label: t('SessionImportSettings.allAgents') }, ...agents.map((kind) => ({ value: kind, label: agentLabel(kind) }))]} />
        )}
        <input className="input session-import-search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder={t('SessionImportSettings.search')} aria-label={t('SessionImportSettings.search')} />
        <span id={hideLabel} className="session-import-hide">
          {t('SessionImportSettings.hideImported')}
          <Toggle labelId={hideLabel} checked={hideImported} onChange={setHideImported} />
        </span>
        <button type="button" className="icon-button" disabled={loading} onClick={() => void load()} title={t('SessionImportSettings.rescan')} aria-label={t('SessionImportSettings.rescan')}><RefreshIcon /></button>
      </div>
      {imported && imported.length > 0 && (
        <p className="settings-note">
          {t('SessionImportSettings.imported', { count: imported.length })}
          <button type="button" className="button" onClick={() => selectConversation(imported[0]!.id)}>{t('SessionImportSettings.open')}</button>
        </p>
      )}
      {sessions === null ? <p className="settings-empty">{t('SessionImportSettings.scanning')}</p>
        : visible.length === 0 ? <p className="settings-empty">{sessions.length ? t('SessionImportSettings.noneMatch') : t('SessionImportSettings.none')}</p>
          : groups.map(([cwd, members]) => {
            const open = members.filter(selectable).map(keyOf)
            const all = open.length > 0 && open.every((key) => chosen.has(key))
            return (
              <section key={cwd} className="session-import-group">
                <label className="session-import-folder">
                  <input type="checkbox" checked={all} disabled={!open.length || busy} onChange={(event) => toggle(open, event.target.checked)}
                    aria-label={t('SessionImportSettings.selectFolder', { value1: projectName(cwd) })} />
                  <span className="settings-project-name">{projectName(cwd)}</span>
                  <span className="settings-project-path mono" title={cwd}>{cwd}</span>
                </label>
                <ul className="settings-project-list">
                  {members.map((session) => {
                    const key = keyOf(session)
                    return (
                      <li key={key} className="settings-project session-import-row">
                        <input type="checkbox" checked={chosen.has(key) && selectable(session)} disabled={!selectable(session) || busy}
                          onChange={(event) => toggle([key], event.target.checked)} aria-label={t('SessionImportSettings.select', { value1: session.title })} />
                        <span className="session-import-agent" title={agentLabel(session.agent)}><AgentIcon agent={session.agent} /></span>
                        <span className="session-import-title" title={session.firstPrompt}>{session.title}</span>
                        {session.problem === 'missing-cwd' && <span className="session-import-badge">{t('SessionImportSettings.missingFolder')}</span>}
                        {session.status === 'imported' && <span className="session-import-badge">{t('SessionImportSettings.statusImported')}</span>}
                        {session.status === 'updated' && <span className="session-import-badge updated">{t('SessionImportSettings.statusUpdated')}</span>}
                        <span className="muted session-import-time">{timeAgo(session.updatedAt, Date.now())}</span>
                        {session.conversationId && (
                          <button type="button" className="button ghost" onClick={() => selectConversation(session.conversationId)}>{t('SessionImportSettings.open')}</button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
      <div className="chat-command-actions">
        <button type="button" className="button primary" disabled={!picked.length || busy} onClick={() => void submit()}>
          {busy ? t('SessionImportSettings.importing') : t('SessionImportSettings.importSelected', { count: picked.length })}
        </button>
      </div>
    </>
  )
}
