import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import type { GitAction, GitBranch, GitCommit, GitComparison, GitDetail, GitHistory, GitStatus, GitTarget, ProjectHead } from '@antumi/protocol'
import { checkGitOperation } from '@antumi/protocol'
import { perform, openTerminal, useCore } from '../core-store'
import { gitGraph } from '../git-graph'
import { commitRefs } from '../git-refs'
import { openResolvedFile, showResolvedFile } from '../file-actions'
import { useOccludesBrowser } from '../browser-occlusion'
import { BranchStatusDetails, type BranchTarget } from './BranchStatus'
import { CommitMessageButton } from './CommitMessageButton'
import { commitSubject, commitWithWrittenMessage, useCanWriteCommitMessage, useWritingCommit } from '../written-commits'
import { GitRefLabel, GitRefName } from './GitRefLabel'
import { ContextMenu, MenuItem, menuPoint, type MenuPoint } from './ContextMenu'
import { FileDiffView, FileList, useFocusCount } from './Inspector'
import { BranchIcon, MoreIcon, MaximizeIcon, RestoreIcon, CheckIcon, ClockIcon, CommitIcon, CompareIcon, CopyIcon, DocumentIcon, FolderIcon, MergeIcon, PencilIcon, TagIcon, TrashIcon } from './icons'
import { ChatPicker } from './ChatPicker'
import { CopyButton } from './CopyButton'
import { projectName } from './ProjectPicker'

function ReadState({ error, retry, children }: { error: string | null; retry: () => void; children?: ReactNode }) {
  return error ? <p className="git-message" role="alert">{error} <button className="button" onClick={retry}>重试</button></p> : <>{children}</>
}

function useGitRead<T>(key: string, read: () => Promise<T>, keepPrevious = false) {
  const [result, setResult] = useState<{ key: string; data?: T; error: string | null } | null>(null)
  useEffect(() => {
    let live = true
    void read().then((data) => { if (live) setResult({ key, data, error: null }) }, (error: unknown) => {
      if (live) setResult({ key, error: error instanceof Error ? error.message : String(error) })
    })
    return () => { live = false }
  }, [key])
  return result?.key === key || (keepPrevious && result?.data) ? result : null
}

export function GitInspector({ target, heads, updatedAt, refresh, maximized, onMaximize }: {
  target: BranchTarget; heads: readonly ProjectHead[]; updatedAt: number; refresh: number; maximized: boolean; onMaximize: () => void
}) {
  const rpc = useCore((s) => s.rpc)
  const [project, setProject] = useState(heads[0]?.path ?? '')
  const selected = heads.some((head) => head.path === project) ? project : heads[0]?.path ?? ''
  if (!rpc?.features.includes('git-management')) return <BranchStatusDetails heads={heads} />
  if (!selected) return <p className="inspector-empty muted">正在读取项目…</p>
  return <div className="git-manager">
    <div className="git-project-bar">
      <ChatPicker
        label="Git 项目"
        value={selected}
        placeholder={projectName(selected)}
        size="large"
        placement="below"
        options={heads.map((head, index) => ({ value: head.path, label: `${index === 0 ? '主项目' : '附加项目'} · ${projectName(head.path)}`, description: head.path, icon: <FolderIcon /> }))}
        onChange={setProject}
      />
      <button className="tool-button" aria-label={maximized ? '还原 Git 面板' : '最大化 Git 面板'} title={maximized ? '还原' : '最大化'} onClick={onMaximize}>{maximized ? <RestoreIcon /> : <MaximizeIcon />}</button>
    </div>
    <GitRepository key={`${target.kind}:${target.id}:${selected}`} target={{ ...target, project: selected }} updatedAt={updatedAt} refresh={refresh} />
  </div>
}

type DialogKind = 'create' | 'tag' | 'detach' | 'rename' | 'delete' | 'push' | 'commit' | 'merge' | 'abort'
// What the dialog acts on: a branch from the tree, or a commit from the history.
type DialogChoice = { kind: DialogKind; branch?: GitBranch; commit?: GitCommit }

function GitRepository({ target, updatedAt, refresh }: { target: GitTarget; updatedAt: number; refresh: number }) {
  const rpc = useCore((s) => s.rpc)
  const revision = useCore((s) => s.gitRevision)
  const focus = useFocusCount()
  const [version, setVersion] = useState(0)
  const [selected, setSelected] = useState('HEAD')
  const [query, setQuery] = useState('')
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [detailView, setDetailView] = useState(false)
  // The branch or commit compared with HEAD, while a comparison shows.
  const [comparison, setComparison] = useState<string | null>(null)
  const [branchesCollapsed, setBranchesCollapsed] = useState(false)
  const [direct, setDirect] = useState(false)
  const [dialog, setDialog] = useState<DialogChoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const refreshKey = `${updatedAt}:${refresh}:${revision}:${focus}:${version}`
  const key = `${target.kind}:${target.id}:${target.project}:${refreshKey}:${rpc ? 'connected' : 'disconnected'}`
  const retry = () => setVersion((n) => n + 1)
  const state = useGitRead(key, async () => {
    if (!rpc) throw new Error('尚未连接 core')
    return rpc.call('git.status', target)
  }, true)
  const status = state?.data
  const branch = status?.branches.find((branch) => branch.ref === selected)
  const ref = selected === 'all' || selected === 'HEAD' || branch ? selected : 'HEAD'
  const writing = useWritingCommit(target)
  const disabled = busy || writing || Boolean(status?.blocker) || !status?.git
  const run = async (action: GitAction) => {
    if (busy) return false
    setBusy(true)
    setNote(null)
    try {
      const result = await perform((rpc) => rpc.call('git.execute', { ...target, action }))
      if (!result) return false
      setNote(result.state === 'conflicts' ? 'Merge 出现冲突，请处理下面列出的文件。' : 'Git 操作已完成。')
      if (action.kind === 'switch' || action.kind === 'detach' || (action.kind === 'create' && action.checkout) || action.kind === 'rename') {
        setSelected('HEAD'); setSelectedCommit(null); setComparison(null)
      }
      return true
    } finally { setBusy(false); retry() }
  }
  // The dialog is gone by then: the agent writes the message, and the commit follows behind it.
  const commitWritten = async (push: boolean) => {
    const done = await commitWithWrittenMessage(target, async (message) => (await run({ kind: 'commit', message, push })) || null)
    if (done) setNote(`已提交「${commitSubject(done.message)}」${push ? '并推送' : ''}。`)
  }
  const pick = (ref: string) => { setSelected(ref); setSelectedCommit(null); setComparison(null); setDetailView(false) }
  const can = (action: GitAction) => !disabled && checkGitOperation(target.kind, action, false, status) === null
  const branchActions = (entry: GitBranch, close: () => void) => <>
    <MenuItem label="查看历史" icon={<ClockIcon />} onSelect={() => { pick(entry.ref); close() }} />
    <MenuItem label="切换到此分支" icon={<CheckIcon />} disabled={!can({ kind: 'switch', ref: entry.ref }) || entry.ref === `refs/heads/${status?.branch}` || Boolean(entry.worktree && entry.worktree !== status?.directory)} onSelect={() => { close(); void run({ kind: 'switch', ref: entry.ref }) }} />
    <MenuItem label="从此分支新建" icon={<BranchIcon />} disabled={!can({ kind: 'create', ref: entry.ref, name: 'new', checkout: false })} onSelect={() => { setDialog({ kind: 'create', branch: entry }); close() }} />
    <MenuItem label="与当前分支比较" icon={<CompareIcon />} disabled={!status?.head} onSelect={() => { pick(entry.ref); setComparison(entry.ref); setDetailView(true); close() }} />
    <MenuItem label="合并到当前分支" icon={<MergeIcon />} disabled={!can({ kind: 'merge', ref: entry.ref }) || entry.ref === `refs/heads/${status?.branch}`} onSelect={() => { setDialog({ kind: 'merge', branch: entry }); close() }} />
    {!entry.remote && <MenuItem label="重命名" icon={<PencilIcon />} disabled={!can({ kind: 'rename', ref: entry.ref, name: 'new' }) || entry.protected || Boolean(entry.worktree && entry.worktree !== status?.directory)} onSelect={() => { setDialog({ kind: 'rename', branch: entry }); close() }} />}
    <MenuItem label={entry.remote ? '删除远端分支…' : '删除本地分支…'} icon={<TrashIcon />} disabled={!can({ kind: 'delete', ref: entry.ref }) || entry.protected || Boolean(entry.worktree)} onSelect={() => { setDialog({ kind: 'delete', branch: entry }); close() }} />
    <MenuItem label="复制分支名" icon={<CopyIcon />} onSelect={() => { void navigator.clipboard.writeText(entry.name); close() }} />
  </>
  const commitActionsSupported = rpc?.features.includes('git-commit-actions') ?? false
  const copyMessage = async (sha: string) => {
    const detail = await perform((rpc) => rpc.call('git.detail', { ...target, sha }))
    if (detail) await navigator.clipboard.writeText(detail.message)
  }
  const commitActions = (commit: GitCommit, close: () => void) => <>
    <MenuItem label="复制 SHA" icon={<CopyIcon />} onSelect={() => { void navigator.clipboard.writeText(commit.sha); close() }} />
    <MenuItem label="复制提交信息" icon={<DocumentIcon />} onSelect={() => { close(); void copyMessage(commit.sha) }} />
    <div className="menu-separator" role="separator" />
    <MenuItem label="从此提交新建分支…" icon={<BranchIcon />} disabled={!can({ kind: 'create', name: 'new', ref: commit.sha, checkout: false })} onSelect={() => { setDialog({ kind: 'create', commit }); close() }} />
    {commitActionsSupported && <MenuItem label="新建标签…" icon={<TagIcon />} disabled={!can({ kind: 'tag', name: 'new', ref: commit.sha })} onSelect={() => { setDialog({ kind: 'tag', commit }); close() }} />}
    {commitActionsSupported && <MenuItem label="检出此提交…" icon={<CommitIcon />} disabled={!can({ kind: 'detach', ref: commit.sha }) || (!status?.branch && commit.sha === status?.head)} onSelect={() => { setDialog({ kind: 'detach', commit }); close() }} />}
    <div className="menu-separator" role="separator" />
    <MenuItem label="与当前分支比较" icon={<CompareIcon />} disabled={!status?.head || commit.sha === status.head} onSelect={() => { setSelectedCommit(commit.sha); setComparison(commit.sha); setDetailView(true); close() }} />
  </>
  return <ReadState error={state?.error ?? null} retry={retry}>
    {!status ? <p className="git-message muted">正在读取 Git…</p> : !status.git ? <p className="git-message muted">这个项目不在 Git 仓库中。</p> : <>
      <div className="git-summary">
        <BranchIcon /><span className="mono" title={status.branch ?? status.head ?? ''}>{status.branch ?? (status.head ? `${status.head.slice(0, 8)}（分离 HEAD）` : '尚无提交')}</span>
        <span className="muted">{status.changes ? `${status.changes} 个改动` : '干净'} · ↑{status.ahead} ↓{status.behind}</span>
        <span className="muted mono" title={status.upstream ?? ''}>{status.upstream ?? '无 upstream'}</span>
      </div>
      <div className="git-toolbar">
        <button className="button" disabled={!can({ kind: 'create', ref: 'HEAD', name: 'new', checkout: false }) || !status.head} onClick={() => setDialog({ kind: 'create', branch })}>新建</button>
        <button className="button" disabled={disabled || Boolean(status.operation) || !status.remotes.length} onClick={() => void run({ kind: 'fetch' })}>Fetch</button>
        <button className="button" disabled={!can({ kind: 'pull' }) || !status.branch || !status.upstream || status.changes > 0} onClick={() => void run({ kind: 'pull' })}>Pull</button>
        <button className="button" disabled={!can({ kind: 'push' }) || !status.branch || !status.remotes.length} onClick={() => setDialog({ kind: 'push' })}>Push</button>
        <button className="button" disabled={!can({ kind: 'commit', message: 'commit', push: false }) || !status.branch || !status.changes} onClick={() => setDialog({ kind: 'commit' })}>Commit</button>
      </div>
      {status.blocker && <p className="git-message muted" role="status">{status.blocker}</p>}
      {writing && <p className="git-message muted" role="status">正在写提交信息，写好就提交…</p>}
      {note && <p className="git-message" role="status">{note}</p>}
      {status.operation && <div className="git-conflicts">
        <strong>{status.operation === 'merge' ? 'Merge 尚未完成' : '其他 Git 操作尚未完成，请在终端处理'}</strong>
        {status.conflicts.map((file) => <ConflictRow key={file} target={target} directory={status.directory} file={file} disabled={disabled} resolve={() => void run({ kind: 'resolve', file })} />)}
        <div className="git-toolbar">
          <button className="button" onClick={() => void openTerminal(status.directory)}>打开终端</button>
          {status.operation === 'merge' && <>
            <button className="button" disabled={disabled || status.conflicts.length > 0} onClick={() => void run({ kind: 'continue' })}>完成 Merge</button>
            <button className="button" disabled={disabled} onClick={() => setDialog({ kind: 'abort' })}>中止 Merge…</button>
          </>}
        </div>
      </div>}
      <div className="git-layout" data-detail={detailView || undefined}>
        <div className="git-branches" data-collapsed={branchesCollapsed || undefined}><button className="git-tree-filter git-branch-toggle" aria-expanded={!branchesCollapsed} onClick={() => setBranchesCollapsed((value) => !value)}>{branchesCollapsed ? "▸ 分支" : "▾ 分支"}</button><div className="git-branch-tree"><BranchTree branches={status.branches} selected={ref} current={status.branch} pick={pick} actions={branchActions} /></div></div>
        <div className="git-history">
          <div className="git-history-tools"><span className="mono" title={ref}>{ref === 'all' ? '全部分支' : ref === 'HEAD' ? '当前分支' : ref.replace(/^refs\/(heads|remotes)\//, '')}</span>
            <input className="input" aria-label="搜索提交" placeholder="标题、作者或 SHA" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <History target={target} gitRef={ref} query={query} refreshKey={refreshKey} remotes={status.remotes} selected={selectedCommit} pick={(sha) => { setSelectedCommit(sha); setComparison(null); setDetailView(true) }} actions={commitActions} />
        </div>
        <div className="git-details">
          <button className="button git-detail-back" onClick={() => setDetailView(false)}>← 返回历史</button>
          {comparison ? <Comparison target={target} gitRef={comparison} what={status.branches.some((entry) => entry.ref === comparison) ? '分支' : '提交'} direct={direct} setDirect={setDirect} refreshKey={refreshKey} retry={retry} />
            : selectedCommit ? <CommitDetail target={target} sha={selectedCommit} refreshKey={refreshKey} retry={retry} /> : <p className="git-message muted">选择提交查看说明、文件和 diff。</p>}
        </div>
      </div>
      {dialog && <ActionDialog choice={dialog} target={target} status={status} busy={busy} run={run} commitWritten={(push) => void commitWritten(push)} close={() => setDialog(null)} />}
    </>}
  </ReadState>
}

function ConflictRow({ target, directory, file, disabled, resolve }: { target: GitTarget; directory: string; file: string; disabled: boolean; resolve: () => void }) {
  const conversationId = useCore((s) => target.kind === 'conversation' ? target.id : s.tasks[target.id]?.conversationId ?? '')
  const resolved = { path: `${directory.replace(/[\\/]$/, '')}/${file}`, root: directory, relative: file, kind: 'file' as const }
  return <div className="git-conflict-row"><span className="mono" title={file}>{file}</span>
    {conversationId && <button className="button" onClick={() => showResolvedFile({ conversationId, inspector: target.kind, roots: [directory] }, resolved, null)}>预览</button>}
    <button className="button" onClick={() => void openResolvedFile(resolved)}>打开</button>
    <button className="button" disabled={disabled} onClick={resolve}>标记已解决</button>
  </div>
}

function BranchTree({ branches, selected, current, pick, actions }: { branches: GitBranch[]; selected: string; current: string | null; pick: (ref: string) => void; actions: (branch: GitBranch, close: () => void) => ReactNode }) {
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ branch: GitBranch; at: MenuPoint } | null>(null)
  const filtered = branches.filter((branch) => `${branch.remote ?? ''}/${branch.name}`.toLowerCase().includes(query.toLowerCase()))
  const row = (branch: GitBranch) => <div key={branch.ref} className="git-branch-row" onKeyDown={(event) => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setMenu({ branch, at: { x: bounds.left, y: bounds.bottom } })
    }
  }} data-selected={selected === branch.ref || undefined} onContextMenu={(event) => { event.preventDefault(); setMenu({ branch, at: menuPoint(event) }) }}>
    <button title={`${branch.remote ? `${branch.remote}/` : ''}${branch.name}${branch.upstream ? ` → ${branch.upstream}` : ''}${branch.worktree ? `\nworktree: ${branch.worktree}` : ''}${branch.protected ? '\n任务绑定分支' : ''}`} onClick={() => pick(branch.ref)}>
      <BranchIcon /><span className="mono">{query ? branch.name : branch.name.split('/').at(-1)}</span>
      {!branch.remote && branch.name === current && <CheckIcon />}
      {(branch.worktree || branch.protected) && <span className="git-branch-badge">{branch.protected ? '任务' : '检出'}</span>}
    </button>
    <button className="tool-button" aria-label={`${branch.name} 的操作`} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setMenu({ branch, at: { x: bounds.left, y: bounds.bottom } }) }}><MoreIcon /></button>
  </div>
  const tree = (entries: GitBranch[], prefix = ''): ReactNode => {
    const folders = new Map<string, GitBranch[]>()
    const leaves: GitBranch[] = []
    for (const branch of entries) {
      const remaining = branch.name.slice(prefix.length)
      const slash = remaining.indexOf('/')
      if (slash < 0 || query) leaves.push(branch)
      else { const folder = remaining.slice(0, slash); folders.set(folder, [...folders.get(folder) ?? [], branch]) }
    }
    return <>{[...folders].sort(([a], [b]) => a.localeCompare(b)).map(([name, entries]) => <details key={name} open><summary>{name}</summary><div className="git-branch-folder">{tree(entries, `${prefix}${name}/`)}</div></details>)}{leaves.map(row)}</>
  }
  return <>
    <input className="input" aria-label="搜索分支" placeholder="搜索分支" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="git-branch-list">
      <button className="git-tree-filter" aria-pressed={selected === 'HEAD'} onClick={() => pick('HEAD')}>HEAD · 当前分支</button>
      <button className="git-tree-filter" aria-pressed={selected === 'all'} onClick={() => pick('all')}>全部分支</button>
      <details open><summary>本地</summary>{tree(filtered.filter((branch) => !branch.remote))}</details>
      <details open><summary>远端</summary>{[...new Set(filtered.flatMap((branch) => branch.remote ? [branch.remote] : []))].map((remote) => <details key={remote} open><summary>{remote}</summary>{tree(filtered.filter((branch) => branch.remote === remote))}</details>)}</details>
      {!filtered.length && <p className="git-message muted">没有匹配的分支。</p>}
    </div>
    {menu && <ContextMenu at={menu.at} label="分支操作" onClose={() => setMenu(null)}>{actions(menu.branch, () => setMenu(null))}</ContextMenu>}
  </>
}

function History({ target, gitRef, query, refreshKey, remotes, selected, pick, actions }: { target: GitTarget; gitRef: string; query: string; refreshKey: string; remotes: readonly string[]; selected: string | null; pick: (sha: string) => void; actions: (commit: GitCommit, close: () => void) => ReactNode }) {
  const rpc = useCore((s) => s.rpc)
  const [menu, setMenu] = useState<{ commit: GitCommit; at: MenuPoint } | null>(null)
  const key = `${gitRef}:${query}:${refreshKey}`
  const [page, setPage] = useState<{ key: string; history: GitHistory } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef(0)
  useEffect(() => {
    const sequence = ++request.current
    setBusy(true); setError(null)
    void rpc?.call('git.history', { ...target, ref: gitRef, query }).then((history) => { if (sequence === request.current) setPage({ key, history }) }, (error: unknown) => { if (sequence === request.current) setError(error instanceof Error ? error.message : String(error)) }).finally(() => { if (sequence === request.current) setBusy(false) })
    return () => { request.current++ }
  }, [rpc, key, retry])
  const history = page?.key === key ? page.history : null
  const more = async () => {
    if (!rpc || !history || history.next === null || busy) return
    const sequence = request.current
    setBusy(true); setError(null)
    try {
      const next = await rpc.call('git.history', { ...target, ref: gitRef, query, offset: history.next, tips: history.tips })
      if (sequence === request.current) setPage({ key, history: { ...next, commits: [...history.commits, ...next.commits] } })
    } catch (error) { if (sequence === request.current) setError(error instanceof Error ? error.message : String(error)) }
    finally { if (sequence === request.current) setBusy(false) }
  }
  const graph = gitGraph(history?.commits ?? [])
  return <div className="git-history-list"><ReadState error={error} retry={() => setRetry((n) => n + 1)}>
    {history?.commits.map((commit, index) => <button key={commit.sha} className="git-commit-row" data-selected={selected === commit.sha || undefined} onClick={() => pick(commit.sha)}
      onContextMenu={(event) => { event.preventDefault(); setMenu({ commit, at: menuPoint(event) }) }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setMenu({ commit, at: { x: bounds.left, y: bounds.bottom } })
        }
      }}
      title={`${commit.sha}\n${commit.subject}\n${commit.author} · ${new Date(commit.date).toLocaleString()}`}>
      {/* Each row as wide as its own lanes, as IDEA's log: a busy stretch does not push every subject right. */}
      <svg className="git-graph" width={Math.max(16, graph[index]?.width ?? 0)} height="32" aria-hidden="true">{graph[index]?.paths.map((path, i) => <path key={i} d={path.d} data-color={path.color} />)}<circle cx={8 + (graph[index]?.lane ?? 0) * 12} cy="16" r="3" data-color={graph[index]?.color} /></svg>
      <span className="git-commit-subject"><GitRefLabel refs={commitRefs(commit.refs, remotes)} />{commit.subject}</span>
      <span className="git-commit-author muted">{commit.author}</span><span className="git-commit-date muted">{new Date(commit.date).toLocaleDateString()}</span>
    </button>)}
    {!busy && history?.commits.length === 0 && <p className="git-message muted">没有匹配的提交。</p>}
    {busy && <p className="git-message muted">正在读取历史…</p>}
    {history?.next !== null && history && <button className="button git-load-more" disabled={busy} onClick={() => void more()}>加载更多</button>}
    {menu && <ContextMenu at={menu.at} label="提交操作" onClose={() => setMenu(null)}>{actions(menu.commit, () => setMenu(null))}</ContextMenu>}
  </ReadState></div>
}

// The subject line stands out from the body, as a heading over it.
function CommitMessage({ message }: { message: string }) {
  const end = message.indexOf('\n')
  const subject = end < 0 ? message : message.slice(0, end)
  return <pre className="git-commit-message"><strong className="git-commit-headline">{subject}</strong>{end < 0 ? '' : message.slice(end)}</pre>
}

// The branches a commit is on, local then remote, under its message, as IDEA's "In 2 branches".
// Asked apart from the detail, which need not wait for every branch to be walked.
function CommitBranches({ target, sha, refreshKey }: { target: GitTarget; sha: string; refreshKey: string }) {
  const rpc = useCore((s) => s.rpc)
  const supported = rpc?.features.includes('git-commit-branches') ?? false
  const [found, setFound] = useState<{ key: string; branches: { name: string; remote: boolean }[] | null } | null>(null)
  const key = `${sha}:${refreshKey}`
  useEffect(() => {
    if (!rpc || !supported) return
    let live = true
    void rpc.call('git.containing', { ...target, sha }).then((branches) => { if (live) setFound({ key, branches }) }, () => { if (live) setFound({ key, branches: null }) })
    return () => { live = false }
  }, [rpc, supported, key])
  if (!supported) return null
  const branches = found?.key === key ? found.branches : undefined
  if (branches === null) return null
  return (
    <div className="git-commit-branches">
      {branches === undefined
        ? <span className="muted">正在查找所在分支…</span>
        : branches.length === 0
          ? <span className="muted">不在任何分支上</span>
          : <>
              <span className="muted">在 {branches.length} 个分支上：</span>
              {branches.map(({ name, remote }) => <GitRefName key={name} item={{ name, kind: remote ? 'remote' : 'local', current: false }} />)}
            </>}
    </div>
  )
}

function CommitDetail({ target, sha, refreshKey, retry }: { target: GitTarget; sha: string; refreshKey: string; retry: () => void }) {
  const rpc = useCore((s) => s.rpc)
  const [parent, setParent] = useState<string | undefined>()
  const [file, setFile] = useState<string | null>(null)
  useEffect(() => { setParent(undefined); setFile(null) }, [sha])
  const key = `${sha}:${parent ?? ''}:${refreshKey}`
  const result = useGitRead<GitDetail>(key, async () => {
    if (!rpc) throw new Error('尚未连接 core')
    return rpc.call('git.detail', { ...target, sha, parent })
  })
  const detail = result?.data
  return <ReadState error={result?.error ?? null} retry={retry}>
    {!detail ? <p className="git-message muted">正在读取提交…</p> : <>
      <div className="git-detail-meta"><CopyButton text={sha} label="复制完整 SHA"><span className="mono">{sha.slice(0, 8)}</span></CopyButton><span>{detail.commit.author}</span><time>{new Date(detail.commit.date).toLocaleString()}</time></div>
      <CommitMessage message={detail.message} />
      <CommitBranches target={target} sha={sha} refreshKey={refreshKey} />
      {detail.commit.parents.length > 1 && <div className="git-parent">比较父提交 <ChatPicker label="比较父提交" value={detail.parent ?? ''} placeholder="父提交 1" placement="below"
        options={detail.commit.parents.map((parent, index) => ({ value: parent, label: `父提交 ${index + 1} · ${parent.slice(0, 8)}` }))}
        onChange={(parent) => { setParent(parent); setFile(null) }} /></div>}
      <CommitFiles files={detail.files} select={setFile} />
      {file && rpc && <FileDiffView file={file} loadKey={`${key}:${file}`} commentKey={`git:${target.kind}:${target.id}\0${target.project}\0${detail.parent ?? ''}..${sha}\0${file}`} load={() => rpc.call('git.diff', { ...target, sha, base: detail.parent, file })} onBack={() => setFile(null)} />}
    </>}
  </ReadState>
}

function CommitFiles({ files, select }: { files: GitDetail['files']; select: (file: string) => void }) {
  const folders = new Map<string, GitDetail['files']>()
  for (const file of files) { const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''; folders.set(folder, [...folders.get(folder) ?? [], file]) }
  return <div className="git-commit-files">{[...folders].map(([folder, entries]) => folder ? <details key={folder} open><summary title={folder}>{folder} · {entries.length}</summary><FileList files={entries} onOpen={select} /></details> : <FileList key="root" files={entries} onOpen={select} />)}{!files.length && <p className="git-message muted">没有文件改动。</p>}</div>
}

function Comparison({ target, gitRef, what, direct, setDirect, refreshKey, retry }: { target: GitTarget; gitRef: string; what: '分支' | '提交'; direct: boolean; setDirect: (value: boolean) => void; refreshKey: string; retry: () => void }) {
  const rpc = useCore((s) => s.rpc)
  const [file, setFile] = useState<string | null>(null)
  const key = `${gitRef}:${direct}:${refreshKey}`
  const result = useGitRead<GitComparison>(key, async () => {
    if (!rpc) throw new Error('尚未连接 core')
    return rpc.call('git.compare', { ...target, ref: gitRef, direct })
  })
  const comparison = result?.data
  return <>
    <label className="git-parent"><input type="checkbox" checked={direct} onChange={(event) => { setDirect(event.target.checked); setFile(null) }} />两端直接比较</label>
    <ReadState error={result?.error ?? null} retry={retry}>
      {!comparison ? <p className="git-message muted">正在比较…</p> : <>
        <p className="git-message">当前分支独有 {comparison.ahead} 个提交 · 所选{what}独有 {comparison.behind} 个提交</p>
        <p className="git-message muted">{direct ? '两端' : `共同祖先到所选${what}`}：<span className="mono">{comparison.base.slice(0, 8)} → {comparison.target.slice(0, 8)}</span></p>
        <div className="git-comparison-commits">{comparison.commits.map((commit) => <div key={commit.sha}><span className="git-branch-badge">{commit.side === 'current' ? '当前分支' : `所选${what}`}</span> <span className="mono muted">{commit.sha.slice(0, 8)}</span> {commit.subject}</div>)}{comparison.commits.length >= 100 && <p className="muted">这里只显示前 100 个提交，完整记录请查看历史。</p>}</div>
        <CommitFiles files={comparison.files} select={setFile} />
        {file && rpc && <FileDiffView file={file} loadKey={`${key}:${file}`} commentKey={`git:${target.kind}:${target.id}\0${target.project}\0${comparison.base}..${comparison.target}\0${file}`} load={() => rpc.call('git.diff', { ...target, sha: comparison.target, base: comparison.base, file })} onBack={() => setFile(null)} />}
      </>}
    </ReadState>
  </>
}

const TITLES: Record<DialogKind, string> = { create: '新建分支', tag: '新建标签', detach: '检出提交', rename: '重命名本地分支', delete: '删除分支', push: 'Push', commit: 'Commit', merge: 'Merge', abort: '中止 Merge' }
function ActionDialog({ choice, target, status, busy, run, commitWritten, close }: { choice: DialogChoice; target: GitTarget; status: GitStatus; busy: boolean; run: (action: GitAction) => Promise<boolean>; commitWritten: (push: boolean) => void; close: () => void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(choice.kind === 'push' ? status.upstream?.split('/').slice(1).join('/') || status.branch || '' : choice.kind === 'rename' ? choice.branch?.name ?? '' : '')
  const [source, setSource] = useState(choice.commit?.sha ?? choice.branch?.ref ?? 'HEAD')
  const [checkout, setCheckout] = useState(target.kind === 'conversation')
  const [remote, setRemote] = useState(status.upstream?.split('/')[0] ?? (status.remotes.includes('origin') ? 'origin' : status.remotes[0] ?? ''))
  const [message, setMessage] = useState('')
  const writable = useCanWriteCommitMessage(target)
  const [confirm, setConfirm] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  const performAction = async (action: GitAction) => { if (await run(action)) close() }
  const submit = (event: MouseEvent, push = false) => {
    event.preventDefault()
    switch (choice.kind) {
      case 'create': void performAction({ kind: 'create', name: name.trim(), ref: source, checkout }); break
      case 'tag': if (choice.commit) void performAction({ kind: 'tag', name: name.trim(), ref: choice.commit.sha }); break
      case 'detach': if (choice.commit) void performAction({ kind: 'detach', ref: choice.commit.sha }); break
      case 'rename': if (choice.branch) void performAction({ kind: 'rename', ref: choice.branch.ref, name: name.trim() }); break
      case 'delete': if (choice.branch) void performAction({ kind: 'delete', ref: choice.branch.ref }); break
      case 'push': void performAction({ kind: 'push', remote, name: name.trim() }); break
      case 'commit':
        if (message.trim()) void performAction({ kind: 'commit', message: message.trim(), push })
        else { close(); commitWritten(push) }
        break
      case 'merge': if (choice.branch) void performAction({ kind: 'merge', ref: choice.branch.ref }); break
      case 'abort': void performAction({ kind: 'abort' }); break
    }
  }
  const enabled = !busy && (choice.kind === 'commit' ? Boolean(message.trim()) || writable : ['create', 'tag', 'rename', 'push'].includes(choice.kind) ? Boolean(name.trim()) : choice.kind === 'delete' && choice.branch?.remote ? confirm === `${choice.branch.remote}/${choice.branch.name}` : true)
  return <dialog ref={dialog} className="modal branch-dialog git-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) close() }}>
    <div className="modal-body">
      <h2>{TITLES[choice.kind]}</h2><p className="muted">{projectName(target.project)} · {status.branch ?? '分离 HEAD'}</p>
      {(choice.kind === 'create' || choice.kind === 'tag' || choice.kind === 'rename' || choice.kind === 'push') && <label>{choice.kind === 'tag' ? '标签名' : '分支名'}<input className="input" autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>}
      {choice.kind === 'create' && <><label>起点<select className="input" value={source} onChange={(event) => setSource(event.target.value)}><option value="HEAD">HEAD · 当前提交</option>{choice.commit && <option value={choice.commit.sha}>{choice.commit.sha.slice(0, 8)} · {choice.commit.subject}</option>}{status.branches.map((branch) => <option key={branch.ref} value={branch.ref}>{branch.remote ? `${branch.remote}/` : ''}{branch.name}</option>)}</select></label>{target.kind === 'conversation' && <label><input type="checkbox" checked={checkout} onChange={(event) => setCheckout(event.target.checked)} /> 创建后切换</label>}</>}
      {choice.kind === 'tag' && choice.commit && <p>在 <span className="mono">{choice.commit.sha.slice(0, 8)}</span> {choice.commit.subject} 上建一个轻量标签。标签只建在本地，不会推送到远端。</p>}
      {choice.kind === 'detach' && choice.commit && <p>检出 <span className="mono">{choice.commit.sha.slice(0, 8)}</span> {choice.commit.subject}。之后不在任何分支上（分离 HEAD）：在这里做的提交要新建分支才能留住，切回一个分支即可回来。</p>}
      {choice.kind === 'push' && <label>Remote<select className="input" value={remote} onChange={(event) => setRemote(event.target.value)}>{status.remotes.map((remote) => <option key={remote}>{remote}</option>)}</select></label>}
      {choice.kind === 'commit' && <><textarea className="input branch-commit-message" aria-label="提交信息" autoFocus maxLength={10000} placeholder={writable ? '提交标题，空一行后填写说明。留空则由 Agent 用小模型写好后直接提交' : '提交标题，空一行后填写说明'} value={message} onChange={(event) => setMessage(event.target.value)} /><p className="muted">提交这个仓库的全部改动。推送失败时，本地提交保留。</p></>}
      {choice.kind === 'delete' && <><p>仓库：<span className="mono">{status.directory}</span><br />{choice.branch?.remote ? `删除远端 ${choice.branch.remote}/${choice.branch.name}` : `安全删除本地 ${choice.branch?.name}，未合并时 Git 会拒绝。`}</p>{choice.branch?.remote && <label>输入完整远端分支名确认<input className="input" autoFocus placeholder={`${choice.branch.remote}/${choice.branch.name}`} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>}</>}
      {choice.kind === 'merge' && <p>把 <span className="mono">{choice.branch?.ref.replace(/^refs\/(heads|remotes)\//, '')}</span> 合入 <span className="mono">{status.branch}</span>。分叉时产生合并提交；有冲突时保留现场供你处理。</p>}
      {choice.kind === 'abort' && <p>中止当前 merge，撤销这次合并及解决冲突的改动。Git 无法安全恢复时会拒绝，请在终端检查。</p>}
      <div className="branch-commit-buttons">{choice.kind === 'commit' && <CommitMessageButton target={target} disabled={busy} onMessage={setMessage} />}<button className="button" disabled={busy} onClick={close}>取消</button>{choice.kind === 'commit' && <button className="button" disabled={!enabled} onClick={(event) => submit(event, true)}>Commit &amp; Push</button>}<button className="button primary" disabled={!enabled} onClick={submit}>{busy ? '处理中…' : TITLES[choice.kind]}</button></div>
    </div>
  </dialog>
}
