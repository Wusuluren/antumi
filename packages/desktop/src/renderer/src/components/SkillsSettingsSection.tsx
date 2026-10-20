import { t, tr } from '../i18n'
import { useState, type FormEvent } from 'react'
import { AGENT_KINDS, agentDescriptor, type RecommendedSkillRepo, type SkillRepo, type SkillUpdateCheck } from '@antumi/protocol'
import { useEffect } from 'react'
import { perform, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { SettingsGroup } from './SettingsControls'

const short = (commit: string) => commit.slice(0, 7)

// The recommendations not installed yet, by address with or without .git.
export function notInstalled(recommended: readonly RecommendedSkillRepo[], repos: readonly SkillRepo[]): RecommendedSkillRepo[] {
  return recommended.filter((repo) => !repos.some((each) => each.url === repo.url || each.url === `${repo.url}.git`))
}

// One installed repository: its skills, and the pin the user moves by hand.
function RepoRow({ repo }: { repo: SkillRepo }) {
  const [busy, setBusy] = useState(false)
  const [readme, setReadme] = useState<string | null>(null)
  const [check, setCheck] = useState<SkillUpdateCheck | null>(null)
  // A pin that moved makes the check stale.
  useEffect(() => setCheck(null), [repo.commit])

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  const showReadme = () => run(async () => {
    if (readme !== null) { setReadme(null); return }
    const found = await perform((rpc) => rpc.call('skills.readme', { id: repo.id }))
    setReadme(found?.text ?? t('SkillsSettingsSection.noReadme'))
  })
  const checkUpdate = () => run(async () => setCheck(await perform((rpc) => rpc.call('skills.checkUpdate', { id: repo.id }))))
  const update = (commit: string) => run(() => perform((rpc) => rpc.call('skills.update', { id: repo.id, commit })))
  const rollback = () => run(() => perform((rpc) => rpc.call('skills.rollback', { id: repo.id })))
  const remove = () => run(async () => {
    if (window.confirm(t('SkillsSettingsSection.removeAgentsUsingItLoseTheseSkillsAt', { value1: repo.plugin?.name ?? repo.id }))) await perform((rpc) => rpc.call('skills.remove', { id: repo.id }))
  })

  return (
    <li className="settings-skill-repo">
      <div className="settings-project">
        <span className="settings-project-name">{repo.plugin?.name ?? repo.id}</span>
        <span className="settings-project-path mono" title={repo.url}>{repo.url}</span>
        <span className="mono muted" title={repo.commit}>{short(repo.commit)}</span>
        <button type="button" className="button" disabled={busy} onClick={() => void showReadme()}>{readme === null ? t('ChatCommandSettings.description') : t('ChatPlan.collapse')}</button>
        <button type="button" className="button" disabled={busy} onClick={() => void checkUpdate()}>{t('SkillsSettingsSection.checkForUpdates')}</button>
        {repo.previousCommit && <button type="button" className="button" disabled={busy} onClick={() => void rollback()}>{tr('SkillsSettingsSection.rollBackTo', { value1: short(repo.previousCommit) })}</button>}
        <button type="button" className="button" disabled={busy} onClick={() => void remove()}>{t('ChatQuoteCards.remove')}</button>
      </div>
      <div className="settings-skill-chips">
        {repo.skills.map((skill) => (
          <span key={skill.name} className={`settings-skill-chip${skill.problem ? ' problem' : ''}`} title={skill.problem ?? skill.description}>{skill.name}</span>
        ))}
      </div>
      {check && (
        <p className="settings-note">
          {check.behind === 0 ? t('SkillsSettingsSection.alreadyUpToDate') : (
            <>{tr('SkillsSettingsSection.commitsBehindUpdatedSkills', { value1: check.behind, value2: short(check.current), value3: short(check.latest), value4: check.skills.map((skill) => skill.name).join('、'), value5: <button type="button" className="button" disabled={busy} onClick={() => void update(check.latest)}>{t('SettingsPage.update')}</button>, value6: <button type="button" className="button" disabled={busy} onClick={() => setCheck(null)}>{t('ChatCommandSettings.cancel')}</button> })}</>
          )}
        </p>
      )}
      {readme !== null && <pre className="settings-skill-readme">{readme}</pre>}
    </li>
  )
}

function RecommendedRow({ repo }: { repo: RecommendedSkillRepo }) {
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    try { await perform((rpc) => rpc.call('skills.install', { url: repo.url })) } finally { setBusy(false) }
  }
  return (
    <li className="settings-skill-repo">
      <div className="settings-project">
        <span className="settings-project-name">{repo.name}</span>
        <span className="settings-project-path mono" title={repo.url}>{repo.url}</span>
        <span className="muted">{repo.license}</span>
        <button type="button" className="button" disabled={busy} onClick={() => void install()}>{busy ? t('SkillsSettingsSection.installing') : t('SettingsPage.install')}</button>
      </div>
      <p className="settings-note">{repo.description}</p>
      <div className="settings-skill-chips">
        {repo.skills.map((skill) => <span key={skill} className="settings-skill-chip">{skill}</span>)}
      </div>
    </li>
  )
}

// Agent Skills Antumi installs for its agents, a card each: what is installed and pinned where,
// what Antumi suggests that is not installed yet, and any other repository by its address.
export function SkillsSettingsSection() {
  const connected = useCore((s) => s.connection === 'connected')
  const repos = useCore((s) => s.skillRepos)
  const [recommended, setRecommended] = useState<RecommendedSkillRepo[] | null>(null)
  const [url, setUrl] = useState('')
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (connected) void perform((rpc) => rpc.call('skills.recommended', {})).then((found) => setRecommended(found ?? []))
  }, [connected])

  const install = async (event: FormEvent) => {
    event.preventDefault()
    if (installing || !url.trim()) return
    setInstalling(true)
    try {
      if (await perform((rpc) => rpc.call('skills.install', { url: url.trim() }))) setUrl('')
    } finally {
      setInstalling(false)
    }
  }

  if (!connected) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  // Which agents take a bundle is the descriptors' to say.
  const takers = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.skills).map(agentLabel)
  const others = AGENT_KINDS.filter((kind) => !agentDescriptor(kind).capabilities.skills).map(agentLabel)
  const suggested = notInstalled(recommended ?? [], repos)
  return (
    <>
      <p className="settings-note">{tr('SkillsSettingsSection.pinnedToTheInstalledCommitPreviewChangesBefore', { value1: [takers.length > 0 && t('SkillsSettingsSection.supported', { value1: takers.join('、') }), others.length > 0 && t('SkillsSettingsSection.notSupportedYet', { value1: others.join('、') })].filter(Boolean).join('；') })}</p>
      <SettingsGroup title={repos.length > 0 ? t('SkillsSettingsSection.installed', { value1: repos.length }) : t('InstalledAgentsSettings.installed')}>
        {repos.length === 0 ? <p className="settings-empty">{t('SkillsSettingsSection.noSkillsInstalledChooseARecommendationBelowOr')}</p> : (
          <ul className="settings-project-list">
            {repos.map((repo) => <RepoRow key={repo.id} repo={repo} />)}
          </ul>
        )}
      </SettingsGroup>
      {suggested.length > 0 && (
        <SettingsGroup title={t('AgentPicker.recommended')}>
          <ul className="settings-project-list">
            {suggested.map((repo) => <RecommendedRow key={repo.url} repo={repo} />)}
          </ul>
        </SettingsGroup>
      )}
      <SettingsGroup title={t('SkillsSettingsSection.installFromAnotherRepository')}>
        <form className="settings-skill-install" onSubmit={(event) => void install(event)}>
          <input className="input mono" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/<owner>/<repo>" aria-label={t('SkillsSettingsSection.repositoryUrl')} spellCheck={false} autoComplete="off" />
          <button type="submit" className="button" disabled={installing || !url.trim()}>{installing ? t('SkillsSettingsSection.installing') : t('SettingsPage.install')}</button>
        </form>
        <p className="settings-note">{t('SkillsSettingsSection.onlyHttpsUrlsTheRepositoryMustContainSkills')}</p>
      </SettingsGroup>
    </>
  )
}
