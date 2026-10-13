import { useState, type FormEvent } from 'react'
import { AGENT_KINDS, agentDescriptor, type RecommendedSkillRepo, type SkillRepo, type SkillUpdateCheck } from '@kando/protocol'
import { useEffect } from 'react'
import { perform, useCore } from '../core-store'
import { agentLabel } from '../labels'

const short = (commit: string) => commit.slice(0, 7)

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
    setReadme(found?.text ?? '（没有 README）')
  })
  const checkUpdate = () => run(async () => setCheck(await perform((rpc) => rpc.call('skills.checkUpdate', { id: repo.id }))))
  const update = (commit: string) => run(() => perform((rpc) => rpc.call('skills.update', { id: repo.id, commit })))
  const rollback = () => run(() => perform((rpc) => rpc.call('skills.rollback', { id: repo.id })))
  const remove = () => run(async () => {
    if (window.confirm(`移除 ${repo.plugin?.name ?? repo.id}？用到它的 Agent 下次启动起就没有这些技能。`)) await perform((rpc) => rpc.call('skills.remove', { id: repo.id }))
  })

  return (
    <li className="settings-skill-repo">
      <div className="settings-project">
        <span className="settings-project-name">{repo.plugin?.name ?? repo.id}</span>
        <span className="settings-project-path mono" title={repo.url}>{repo.url}</span>
        <span className="mono muted" title={repo.commit}>{short(repo.commit)}</span>
        <button type="button" className="button" disabled={busy} onClick={() => void showReadme()}>{readme === null ? '说明' : '收起'}</button>
        <button type="button" className="button" disabled={busy} onClick={() => void checkUpdate()}>检查更新</button>
        {repo.previousCommit && <button type="button" className="button" disabled={busy} onClick={() => void rollback()}>回退到 {short(repo.previousCommit)}</button>}
        <button type="button" className="button" disabled={busy} onClick={() => void remove()}>移除</button>
      </div>
      <div className="settings-skill-chips">
        {repo.skills.map((skill) => (
          <span key={skill.name} className={`settings-skill-chip${skill.problem ? ' problem' : ''}`} title={skill.problem ?? skill.description}>{skill.name}</span>
        ))}
      </div>
      {check && (
        <p className="settings-note">
          {check.behind === 0 ? '已是最新。' : (
            <>
              落后 {check.behind} 次提交，{short(check.current)} → {short(check.latest)}；更新后的技能：{check.skills.map((skill) => skill.name).join('、')}。
              <button type="button" className="button" disabled={busy} onClick={() => void update(check.latest)}>更新</button>
              <button type="button" className="button" disabled={busy} onClick={() => setCheck(null)}>取消</button>
            </>
          )}
        </p>
      )}
      {readme !== null && <pre className="settings-skill-readme">{readme}</pre>}
    </li>
  )
}

function RecommendedRow({ repo, installed }: { repo: RecommendedSkillRepo; installed: boolean }) {
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
        {installed ? <span className="muted">已安装</span> : <button type="button" className="button" disabled={busy} onClick={() => void install()}>{busy ? '安装中…' : '安装'}</button>}
      </div>
      <p className="settings-note">{repo.description}</p>
      <div className="settings-skill-chips">
        {repo.skills.map((skill) => <span key={skill} className="settings-skill-chip">{skill}</span>)}
      </div>
    </li>
  )
}

// Agent Skills Kando installs for its agents: what is installed and pinned where, what Kando
// suggests, and any other repository by its address.
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

  if (!connected) return <p className="settings-empty">连接到 Kando core 后才能查看。</p>
  // Which agents take a bundle is the descriptors' to say.
  const takers = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.skills).map(agentLabel)
  const others = AGENT_KINDS.filter((kind) => !agentDescriptor(kind).capabilities.skills).map(agentLabel)
  return (
    <>
      <p className="settings-note">
        装一次，启动 Agent 时交给它，不改你自己的 ~/.claude、~/.codex。仓库固定在安装时的提交，更新前先看会变什么，可以回退。技能是第三方代码，可能带脚本：安装后先看说明再依赖它。
        {takers.length > 0 && `${takers.join('、')} 启动时会带上技能`}{others.length > 0 && `；${others.join('、')} 暂不支持`}。
      </p>
      <h3 className="settings-stats-heading">已安装</h3>
      {repos.length === 0 ? <p className="settings-empty">还没有安装技能。</p> : (
        <ul className="settings-project-list">
          {repos.map((repo) => <RepoRow key={repo.id} repo={repo} />)}
        </ul>
      )}
      {recommended && recommended.length > 0 && (
        <>
          <h3 className="settings-stats-heading">推荐</h3>
          <ul className="settings-project-list">
            {recommended.map((repo) => <RecommendedRow key={repo.url} repo={repo} installed={repos.some((each) => each.url === repo.url || each.url === `${repo.url}.git`)} />)}
          </ul>
        </>
      )}
      <h3 className="settings-stats-heading">其他仓库</h3>
      <form className="settings-skill-install" onSubmit={(event) => void install(event)}>
        <input className="input mono" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/<owner>/<repo>" spellCheck={false} autoComplete="off" />
        <button type="submit" className="button" disabled={installing || !url.trim()}>{installing ? '安装中…' : '安装'}</button>
      </form>
      <p className="settings-note">只接受 https:// 地址，仓库里要有 skills/&lt;名字&gt;/SKILL.md。</p>
    </>
  )
}
