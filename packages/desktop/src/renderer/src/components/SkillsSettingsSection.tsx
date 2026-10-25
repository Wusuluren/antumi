import { t, tr } from '../i18n'
import { useId, useRef, useState, type FormEvent } from 'react'
import { AGENT_KINDS, agentDescriptor, knowledgeBaseSkillRefs, skillRepositoryUrl, type RecommendedSkillRepo, type SkillRepo, type SkillSearchResult } from '@antumi/protocol'
import { useEffect } from 'react'
import { perform, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { Segmented, SettingsGroup } from './SettingsControls'
import { SkillActivationDialog } from './SkillActivationDialog'
import { SkillRepoSettings } from './SkillRepoSettings'

// The ways to add a skill, in tab order. A lone way needs no tab.
export type SkillAddTab = 'recommended' | 'search' | 'url'

export function skillAddTabs(options: { recommended: boolean; search: boolean }): SkillAddTab[] {
  return [...(options.recommended ? ['recommended' as const] : []), ...(options.search ? ['search' as const] : []), 'url' as const]
}

// Keep the chosen tab when it is still offered; otherwise the first one, which is the richest.
export function activeSkillAddTab(tabs: readonly SkillAddTab[], tab: SkillAddTab): SkillAddTab {
  return tabs.includes(tab) ? tab : tabs[0] ?? 'url'
}

function RecommendedRow({ repo, installed, canManage, onManage }: { repo: RecommendedSkillRepo; installed: SkillRepo | undefined; canManage: boolean; onManage: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    try { const saved = await perform((rpc) => rpc.call('skills.install', { url: repo.url })); if (saved) onManage(saved.id) } finally { setBusy(false) }
  }
  return (
    <li className="settings-skill-repo">
      <div className="settings-project">
        <span className="settings-project-name">{repo.name}</span>
        <span className="settings-project-path mono" title={repo.url}>{repo.url}</span>
        <span className="muted">{repo.license}</span>
        {installed ? <><span className="muted">{t('InstalledAgentsSettings.installed')}</span>{canManage && <button type="button" className="button" onClick={() => onManage(installed.id)}>{t('SkillsSettingsSection.configure')}</button>}</> : <button type="button" className="button" disabled={busy} onClick={() => void install()}>{busy ? t('SkillsSettingsSection.installing') : t('SettingsPage.install')}</button>}
      </div>
      <p className="settings-note">{repo.description}</p>
      <div className="settings-skill-chips">
        {repo.skills.map((skill) => <span key={skill} className="settings-skill-chip">{skill}</span>)}
      </div>
    </li>
  )
}

// One skills.sh hit: the repository a skill lives in, installed over the same git path as the rest.
function SearchRow({ result, installed, canManage, onManage }: { result: SkillSearchResult; installed: SkillRepo | undefined; canManage: boolean; onManage: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    try { const saved = await perform((rpc) => rpc.call('skills.install', { url: result.url })); if (saved) onManage(saved.id) } finally { setBusy(false) }
  }
  return (
    <li className="settings-skill-repo">
      <div className="settings-project">
        <span className="settings-project-name">{result.source}</span>
        <span className="settings-project-path mono" title={result.url}>{result.url}</span>
        {result.installs > 0 && <span className="muted">{t('SkillsSettingsSection.installsCount', { value1: result.installs.toLocaleString() })}</span>}
        {installed
          ? <><span className="muted">{t('InstalledAgentsSettings.installed')}</span>{canManage && <button type="button" className="button" onClick={() => onManage(installed.id)}>{t('SkillsSettingsSection.configure')}</button>}</>
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
function SearchMarket({ repos, canManage, onManage }: { repos: readonly SkillRepo[]; canManage: boolean; onManage: (id: string) => void }) {
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
  const installedRepo = (result: SkillSearchResult) => repos.find((each) => skillRepositoryUrl(each.url) === skillRepositoryUrl(result.url))
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
        : <ul className="settings-project-list">{results.map((result) => <SearchRow key={result.url} result={result} installed={installedRepo(result)} canManage={canManage} onManage={onManage} />)}</ul>)}
    </>
  )
}

// Agent Skills Antumi installs for its agents, a card each: what is installed and pinned where,
// what Antumi suggests that is not installed yet, and any other repository by its address.
export function SkillsSettingsSection() {
  const connected = useCore((s) => s.connection === 'connected')
  const searchSupported = useCore((s) => s.rpc?.features.includes('skills-search') ?? false)
  const managed = useCore((s) => s.rpc?.features.includes('skills-activation') ?? false)
  const base = useCore((s) => s.chatSettings?.knowledgeBase ?? null)
  const repos = useCore((s) => s.skillRepos)
  const [recommended, setRecommended] = useState<RecommendedSkillRepo[] | null>(null)
  const [url, setUrl] = useState('')
  const [installing, setInstalling] = useState(false)
  const [tab, setTab] = useState<SkillAddTab>('recommended')
  const [page, setPage] = useState<'installed' | 'discover'>('installed')
  const [managing, setManaging] = useState<string | null>(null)
  const tabLabelId = useId()
  const pageLabelId = useId()
  const onManage = (id: string) => { setPage('installed'); if (managed) setManaging(id) }

  useEffect(() => {
    if (connected) void perform((rpc) => rpc.call('skills.recommended', {})).then((found) => setRecommended(found ?? []))
  }, [connected])

  const install = async (event: FormEvent) => {
    event.preventDefault()
    if (installing || !url.trim()) return
    const existing = repos.find((repo) => skillRepositoryUrl(repo.url) === skillRepositoryUrl(url.trim()))
    if (existing) { onManage(existing.id); setUrl(''); return }
    setInstalling(true)
    try {
      const saved = await perform((rpc) => rpc.call('skills.install', { url: url.trim() }))
      if (saved) { setUrl(''); onManage(saved.id) }
    } finally {
      setInstalling(false)
    }
  }

  if (!connected) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  // Which agents take a bundle is the descriptors' to say.
  const takers = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.skills).map(agentLabel)
  const others = AGENT_KINDS.filter((kind) => !agentDescriptor(kind).capabilities.skills).map(agentLabel)
  const suggested = recommended ?? []
  const tabs = skillAddTabs({ recommended: suggested.length > 0, search: searchSupported })
  const active = activeSkillAddTab(tabs, tab)
  const current = repos.find((repo) => repo.id === managing)
  const fallback = knowledgeBaseSkillRefs(base)
  const installedLabel = repos.length > 0 ? t('SkillsSettingsSection.installed', { value1: repos.length }) : t('InstalledAgentsSettings.installed')
  const tabOptions = tabs.map((value) => ({
    value,
    label: value === 'recommended' ? t('AgentPicker.recommended') : value === 'search' ? t('SkillsSettingsSection.searchTheSkillMarket') : t('SkillsSettingsSection.installFromAnotherRepository')
  }))
  return (
    <>
      <p className="settings-note">{tr('SkillsSettingsSection.pinnedToTheInstalledCommitPreviewChangesBefore', { value1: [takers.length > 0 && t('SkillsSettingsSection.supported', { value1: takers.join('、') }), others.length > 0 && t('SkillsSettingsSection.notSupportedYet', { value1: others.join('、') })].filter(Boolean).join('；') })}</p>
      {managed && <div className="settings-skill-tabs"><span id={pageLabelId} hidden>{t('SkillsSettingsSection.skills')}</span><Segmented labelId={pageLabelId} value={page} options={[{ value: 'installed', label: installedLabel }, { value: 'discover', label: t('SkillsSettingsSection.discover') }]} onChange={setPage}/></div>}
      <div hidden={managed && page !== 'installed'}>
      <SettingsGroup title={managed ? undefined : installedLabel}>
        {repos.length === 0 ? <p className="settings-empty">{t('SkillsSettingsSection.noSkillsInstalledChooseARecommendationBelowOr')}</p> : (
          <ul className="settings-project-list">
            {repos.map((repo) => <SkillRepoSettings key={repo.id} repo={repo} managed={managed} fallback={fallback} onConfigure={() => onManage(repo.id)} />)}
          </ul>
        )}
      </SettingsGroup>
      {managed && repos.length === 0 && <button className="button" type="button" onClick={() => setPage('discover')}>{t('SkillsSettingsSection.discover')}</button>}
      </div>
      <div hidden={managed && page !== 'discover'}>
      <SettingsGroup title={managed ? undefined : tabs.length > 1 ? t('SkillsSettingsSection.addASkill') : t('SkillsSettingsSection.installFromAnotherRepository')}>
        {tabs.length > 1 && (
          <div className="settings-skill-tabs">
            <Segmented<SkillAddTab> labelId={tabLabelId} value={active} options={tabOptions} onChange={setTab} />
            <span id={tabLabelId} hidden>{t('SkillsSettingsSection.addASkill')}</span>
          </div>
        )}
        {active === 'recommended' && (
          <ul className="settings-project-list">
            {suggested.map((repo) => <RecommendedRow key={repo.url} repo={repo} installed={repos.find((each) => skillRepositoryUrl(each.url) === skillRepositoryUrl(repo.url))} canManage={managed} onManage={onManage} />)}
          </ul>
        )}
        {searchSupported && <div hidden={active !== 'search'}><SearchMarket repos={repos} canManage={managed} onManage={onManage} /></div>}
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
      </div>
      {managed && current && <SkillActivationDialog key={current.id} repo={current} repos={repos} fallback={fallback} onClose={() => setManaging(null)} onManage={setManaging} />}
    </>
  )
}
