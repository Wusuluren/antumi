import { t, tr } from '../i18n'
import { useId, useRef, useState, type FormEvent } from 'react'
import { AGENT_KINDS, agentDescriptor, type RecommendedSkillRepo, type SkillRepo, type SkillSearchResult, type SkillUpdateCheck } from '@antumi/protocol'
import { useEffect } from 'react'
import { perform, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { Segmented, SettingsGroup } from './SettingsControls'

const short = (commit: string) => commit.slice(0, 7)

// The recommendations not installed yet, by address with or without .git.
export function notInstalled(recommended: readonly RecommendedSkillRepo[], repos: readonly SkillRepo[]): RecommendedSkillRepo[] {
  return recommended.filter((repo) => !repos.some((each) => each.url === repo.url || each.url === `${repo.url}.git`))
}

// The ways to add a skill, in tab order. A lone way needs no tab.
export type SkillAddTab = 'recommended' | 'search' | 'url'

export function skillAddTabs(options: { recommended: boolean; search: boolean }): SkillAddTab[] {
  return [...(options.recommended ? ['recommended' as const] : []), ...(options.search ? ['search' as const] : []), 'url' as const]
}

// Keep the chosen tab when it is still offered; otherwise the first one, which is the richest.
export function activeSkillAddTab(tabs: readonly SkillAddTab[], tab: SkillAddTab): SkillAddTab {
  return tabs.includes(tab) ? tab : tabs[0] ?? 'url'
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

// One skills.sh hit: the repository a skill lives in, installed over the same git path as the rest.
function SearchRow({ result, installed }: { result: SkillSearchResult; installed: boolean }) {
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    try { await perform((rpc) => rpc.call('skills.install', { url: result.url })) } finally { setBusy(false) }
  }
  return (
    <li className="settings-skill-repo">
      <div className="settings-project">
        <span className="settings-project-name">{result.source}</span>
        <span className="settings-project-path mono" title={result.url}>{result.url}</span>
        {result.installs > 0 && <span className="muted">{t('SkillsSettingsSection.installsCount', { value1: result.installs.toLocaleString() })}</span>}
        {installed
          ? <span className="muted">{t('InstalledAgentsSettings.installed')}</span>
          : <button type="button" className="button" disabled={busy} onClick={() => void install()}>{busy ? t('SkillsSettingsSection.installing') : t('SettingsPage.install')}</button>}
      </div>
      {result.skills.length > 0 && (
        <div className="settings-skill-chips">
          {result.skills.map((skill) => <span key={skill} className="settings-skill-chip">{skill}</span>)}
        </div>
      )}
    </li>
  )
}

// Search skills.sh and install from its hits. The registry finds the repository; installing it
// clones and pins the whole thing, exactly like a recommendation or a hand-typed URL. Clearing
// drops the query and the hits, and ignores a search that was already in flight.
function SearchMarket({ repos }: { repos: readonly SkillRepo[] }) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SkillSearchResult[] | null>(null)
  const request = useRef(0)

  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (searching || !query.trim()) return
    const id = ++request.current
    setSearching(true)
    try {
      const found = await perform((rpc) => rpc.call('skills.search', { query: query.trim() }))
      if (id === request.current && found) setResults(found)
    } finally {
      if (id === request.current) setSearching(false)
    }
  }
  const clear = () => {
    request.current += 1
    setQuery('')
    setResults(null)
    setSearching(false)
  }
  const isInstalled = (result: SkillSearchResult) => repos.some((each) => each.url === result.url || each.url === `${result.url}.git`)
  const canClear = query !== '' || results !== null

  return (
    <>
      <form className="settings-skill-install" onSubmit={(event) => void search(event)}>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('SkillsSettingsSection.searchSkillsShPlaceholder')} aria-label={t('SkillsSettingsSection.searchTheSkillMarket')} spellCheck={false} autoComplete="off" />
        <button type="submit" className="button" disabled={searching || !query.trim()}>{searching ? t('SkillsSettingsSection.searching') : t('SkillsSettingsSection.search')}</button>
        {canClear && <button type="button" className="button" onClick={clear}>{t('SidebarSearch.clear')}</button>}
      </form>
      <p className="settings-note">{t('SkillsSettingsSection.resultsFromSkillsShInstallsTheWholeRepository')}</p>
      {results !== null && (results.length === 0
        ? <p className="settings-empty">{t('SkillsSettingsSection.noMatchingSkillsFound')}</p>
        : <ul className="settings-project-list">{results.map((result) => <SearchRow key={result.url} result={result} installed={isInstalled(result)} />)}</ul>)}
    </>
  )
}

// Agent Skills Antumi installs for its agents, a card each: what is installed and pinned where,
// what Antumi suggests that is not installed yet, and any other repository by its address.
export function SkillsSettingsSection() {
  const connected = useCore((s) => s.connection === 'connected')
  const searchSupported = useCore((s) => s.rpc?.features.includes('skills-search') ?? false)
  const repos = useCore((s) => s.skillRepos)
  const [recommended, setRecommended] = useState<RecommendedSkillRepo[] | null>(null)
  const [url, setUrl] = useState('')
  const [installing, setInstalling] = useState(false)
  const [tab, setTab] = useState<SkillAddTab>('recommended')
  const tabLabelId = useId()

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
  const tabs = skillAddTabs({ recommended: suggested.length > 0, search: searchSupported })
  const active = activeSkillAddTab(tabs, tab)
  const tabOptions = tabs.map((value) => ({
    value,
    label: value === 'recommended' ? t('AgentPicker.recommended') : value === 'search' ? t('SkillsSettingsSection.searchTheSkillMarket') : t('SkillsSettingsSection.installFromAnotherRepository')
  }))
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
      <SettingsGroup title={tabs.length > 1 ? t('SkillsSettingsSection.addASkill') : t('SkillsSettingsSection.installFromAnotherRepository')}>
        {tabs.length > 1 && (
          <div className="settings-skill-tabs">
            <Segmented<SkillAddTab> labelId={tabLabelId} value={active} options={tabOptions} onChange={setTab} />
            <span id={tabLabelId} hidden>{t('SkillsSettingsSection.addASkill')}</span>
          </div>
        )}
        {active === 'recommended' && (
          <ul className="settings-project-list">
            {suggested.map((repo) => <RecommendedRow key={repo.url} repo={repo} />)}
          </ul>
        )}
        {searchSupported && <div hidden={active !== 'search'}><SearchMarket repos={repos} /></div>}
        {active === 'url' && (
          <>
            <form className="settings-skill-install" onSubmit={(event) => void install(event)}>
              <input className="input mono" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/<owner>/<repo>" aria-label={t('SkillsSettingsSection.repositoryUrl')} spellCheck={false} autoComplete="off" />
              <button type="submit" className="button" disabled={installing || !url.trim()}>{installing ? t('SkillsSettingsSection.installing') : t('SettingsPage.install')}</button>
            </form>
            <p className="settings-note">{t('SkillsSettingsSection.onlyHttpsUrlsTheRepositoryMustContainSkills')}</p>
          </>
        )}
      </SettingsGroup>
    </>
  )
}
