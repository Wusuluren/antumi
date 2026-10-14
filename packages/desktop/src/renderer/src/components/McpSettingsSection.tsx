import { useEffect, useId, useState, type FormEvent } from 'react'
import { AGENT_KINDS, agentDescriptor, McpServerName, type AgentKind, type McpImportCandidate, type McpProbe, type McpServer, type McpServerInput } from '@kando/protocol'
import { perform, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { Segmented, Toggle } from './SettingsControls'

// The agents a server can be handed to, as their descriptors say.
const TAKERS = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.userMcp)

type Secret = { key: string; value: string; stored: boolean }
type Draft = {
  previousName: string | null
  name: string
  enabled: boolean
  agents: AgentKind[]
  type: 'stdio' | 'http'
  command: string
  args: string
  cwd: string
  url: string
  secrets: Secret[]
}

const NEW_DRAFT: Draft = { previousName: null, name: '', enabled: true, agents: [...TAKERS], type: 'stdio', command: '', args: '', cwd: '', url: '', secrets: [] }

function draftOf(server: McpServer): Draft {
  const { transport } = server
  const keys = transport.type === 'stdio' ? transport.envKeys : transport.headerKeys
  return {
    previousName: server.name,
    name: server.name,
    enabled: server.enabled,
    agents: [...server.agents],
    type: transport.type,
    command: transport.type === 'stdio' ? transport.command : '',
    args: transport.type === 'stdio' ? transport.args.join('\n') : '',
    cwd: transport.type === 'stdio' ? transport.cwd ?? '' : '',
    url: transport.type === 'http' ? transport.url : '',
    secrets: keys.map((key) => ({ key, value: '', stored: true }))
  }
}

// A stored value left blank is kept; a new key needs one.
function inputOf(draft: Draft): McpServerInput {
  const secrets = draft.secrets.filter((secret) => secret.key.trim()).map((secret) => ({ key: secret.key.trim(), value: secret.stored && !secret.value ? null : secret.value }))
  const base = { name: draft.name.trim(), previousName: draft.previousName, enabled: draft.enabled, agents: draft.agents }
  return draft.type === 'stdio'
    ? { ...base, transport: { type: 'stdio', command: draft.command.trim(), args: draft.args.split('\n').map((arg) => arg.trim()).filter(Boolean), cwd: draft.cwd.trim() || null, env: secrets } }
    : { ...base, transport: { type: 'http', url: draft.url.trim(), headers: secrets } }
}

// One server from JSON as the agents write theirs: { "mcpServers": { name: {...} } }, or the entry alone.
function draftFromJson(text: string, current: Draft): Draft | string {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return '不是有效的 JSON' }
  if (!parsed || typeof parsed !== 'object') return '不是有效的 JSON'
  const servers = 'mcpServers' in parsed && parsed.mcpServers && typeof parsed.mcpServers === 'object' ? Object.entries(parsed.mcpServers) : [[current.name, parsed] as const]
  const [name, entry] = servers[0] ?? []
  if (!entry || typeof entry !== 'object') return '没有找到服务器'
  const field = (key: string): unknown => (key in entry ? Reflect.get(entry, key) : undefined)
  const strings = (value: unknown): Record<string, string> => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string')) : {})
  const command = field('command')
  const url = field('url')
  const args = field('args')
  const cwd = field('cwd')
  const values = strings(typeof command === 'string' ? field('env') : field('headers'))
  if (typeof command !== 'string' && typeof url !== 'string') return '既没有 command 也没有 url'
  return {
    ...current,
    name: typeof name === 'string' && name ? name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32) : current.name,
    type: typeof command === 'string' ? 'stdio' : 'http',
    command: typeof command === 'string' ? command : '',
    args: Array.isArray(args) ? args.filter((arg) => typeof arg === 'string').join('\n') : '',
    cwd: typeof cwd === 'string' ? cwd : '',
    url: typeof url === 'string' ? url : '',
    secrets: Object.entries(values).map(([key, value]) => ({ key, value, stored: false }))
  }
}

function AgentChoices({ value, onChange, disabled = [] }: { value: readonly AgentKind[]; onChange: (agents: AgentKind[]) => void; disabled?: readonly AgentKind[] }) {
  return (
    <span className="mcp-agents">
      {TAKERS.map((kind) => (
        <label key={kind} className="mcp-agent">
          <input type="checkbox" checked={value.includes(kind) && !disabled.includes(kind)} disabled={disabled.includes(kind)}
            onChange={(event) => onChange(event.target.checked ? [...value, kind] : value.filter((each) => each !== kind))} />
          {agentLabel(kind)}
        </label>
      ))}
    </span>
  )
}

function ServerForm({ initial, onDone }: { initial: Draft; onDone: (saved: string | null) => void }) {
  const [draft, setDraft] = useState(initial)
  const [json, setJson] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const typeId = useId()
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))
  const setSecret = (index: number, patch: Partial<Secret>) => set({ secrets: draft.secrets.map((secret, at) => (at === index ? { ...secret, ...patch } : secret)) })
  const badName = draft.name.trim().length > 0 && !McpServerName.safeParse(draft.name.trim()).success
  const ready = McpServerName.safeParse(draft.name.trim()).success && (draft.type === 'stdio' ? draft.command.trim() : draft.url.trim()) && draft.secrets.every((secret) => !secret.key.trim() || secret.stored || secret.value)

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready || saving) return
    setSaving(true)
    const saved = await perform((rpc) => rpc.call('mcpServers.save', inputOf(draft)))
    setSaving(false)
    if (saved) onDone(saved.name)
  }
  const fill = () => {
    const filled = draftFromJson(json ?? '', draft)
    if (typeof filled === 'string') { setJsonError(filled); return }
    setDraft(filled)
    setJson(null)
    setJsonError(null)
  }
  const what = draft.type === 'stdio' ? '环境变量' : '请求头'

  return (
    <form className="chat-command-form" onSubmit={(event) => void save(event)}>
      {json === null ? (
        <button type="button" className="button ghost mcp-json-toggle" onClick={() => setJson('')}>粘贴 JSON 填写</button>
      ) : (
        <label className="chat-command-field">
          <span>JSON</span>
          <textarea className="input mono chat-command-prompt" rows={6} value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} autoFocus
            placeholder={'{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "…" } } } }'} />
          {jsonError && <span className="chat-command-hint warning">{jsonError}</span>}
          <span className="chat-command-actions">
            <button type="button" className="button ghost" onClick={() => { setJson(null); setJsonError(null) }}>取消</button>
            <button type="button" className="button" onClick={fill}>填入</button>
          </span>
        </label>
      )}
      <label className="chat-command-field">
        <span>名称</span>
        <input className="input mono" value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder="github" maxLength={32} spellCheck={false} autoFocus={json === null} aria-invalid={badName} />
        <span className="chat-command-hint">{badName ? '只能用小写字母、数字和 - _，以字母或数字开头；kando 留给 Kando 自己' : 'Agent 里看到的工具名会带上它，如 github · create_issue'}</span>
      </label>
      <div className="chat-command-field">
        <span id={typeId}>类型</span>
        <Segmented labelId={typeId} value={draft.type} options={[{ value: 'stdio', label: '本地命令' }, { value: 'http', label: '远程地址' }]} onChange={(type) => set({ type, secrets: [] })} />
      </div>
      {draft.type === 'stdio' ? (
        <>
          <label className="chat-command-field">
            <span>命令</span>
            <input className="input mono" value={draft.command} onChange={(event) => set({ command: event.target.value })} placeholder="npx" spellCheck={false} />
          </label>
          <label className="chat-command-field">
            <span>参数</span>
            <textarea className="input mono mcp-args" rows={3} value={draft.args} onChange={(event) => set({ args: event.target.value })} placeholder={'-y\n@modelcontextprotocol/server-github'} spellCheck={false} />
            <span className="chat-command-hint">一行一个，原样传给命令，不经过 shell。</span>
          </label>
          <label className="chat-command-field">
            <span>工作目录</span>
            <input className="input mono" value={draft.cwd} onChange={(event) => set({ cwd: event.target.value })} placeholder="可选，绝对路径；不填就在会话的项目里启动" spellCheck={false} />
          </label>
        </>
      ) : (
        <label className="chat-command-field">
          <span>地址</span>
          <input className="input mono" value={draft.url} onChange={(event) => set({ url: event.target.value })} placeholder="https://mcp.example.com/mcp" spellCheck={false} />
          <span className="chat-command-hint">Streamable HTTP。http:// 只能连本机。</span>
        </label>
      )}
      <div className="chat-command-field">
        <span>{what}</span>
        {draft.secrets.map((secret, index) => (
          <span key={index} className="mcp-secret">
            <input className="input mono" value={secret.key} disabled={secret.stored} onChange={(event) => setSecret(index, { key: event.target.value })} placeholder={draft.type === 'stdio' ? 'GITHUB_TOKEN' : 'Authorization'} spellCheck={false} aria-label={`${what}名`} />
            <input className="input mono" type="password" autoComplete="new-password" value={secret.value} onChange={(event) => setSecret(index, { value: event.target.value })} placeholder={secret.stored ? '已设置，留空不改' : '值'} aria-label={`${secret.key || what}的值`} />
            <button type="button" className="button ghost" onClick={() => set({ secrets: draft.secrets.filter((_, at) => at !== index) })}>移除</button>
          </span>
        ))}
        <span><button type="button" className="button ghost" onClick={() => set({ secrets: [...draft.secrets, { key: '', value: '', stored: false }] })}>添加{what}</button></span>
        <span className="chat-command-hint">值只存在本机 Kando 的凭据文件里，之后这里只显示键名；Agent 的配置、命令行和 Kando 的日志里都不会出现。</span>
      </div>
      <div className="chat-command-field">
        <span>交给哪些 Agent</span>
        <AgentChoices value={draft.agents} onChange={(agents) => set({ agents })} />
      </div>
      <div className="chat-command-actions">
        <button type="button" className="button ghost" onClick={() => onDone(null)}>取消</button>
        <button type="submit" className="button primary" disabled={!ready || saving}>{saving ? '保存中…' : '保存并测试'}</button>
      </div>
    </form>
  )
}

function ProbeResult({ probe }: { probe: McpProbe | 'running' }) {
  const [open, setOpen] = useState(false)
  if (probe === 'running') return <p className="settings-status" role="status">正在连接…（第一次用 npx / uvx 时要先下载，可能要等一会儿）</p>
  if (!probe.ok) {
    return (
      <div className="mcp-probe" data-ok="false">
        <p className="settings-status" role="status">没连上：{probe.error}</p>
        {probe.stderr && <pre className="mcp-probe-output">{probe.stderr}</pre>}
      </div>
    )
  }
  return (
    <div className="mcp-probe" data-ok="true">
      <p className="settings-note">
        连上了，{probe.tools.length} 个工具。
        {probe.tools.length > 0 && <button type="button" className="button ghost" onClick={() => setOpen(!open)}>{open ? '收起' : '查看'}</button>}
      </p>
      {open && (
        <ul className="mcp-tools">
          {probe.tools.map((tool) => <li key={tool.name}><span className="mono">{tool.name}</span>{tool.description && <span className="muted"> {tool.description}</span>}</li>)}
        </ul>
      )}
    </div>
  )
}

function summary(server: McpServer): string {
  const { transport } = server
  return transport.type === 'stdio' ? [transport.command, ...transport.args].join(' ') : transport.url
}

function ServerRow({ server, probe, onProbe, onEdit }: { server: McpServer; probe: McpProbe | 'running' | undefined; onProbe: () => void; onEdit: () => void }) {
  const labelId = useId()
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const keys = server.transport.type === 'stdio' ? server.transport.envKeys : server.transport.headerKeys
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  return (
    <div className="plugin-row">
      <div className="settings-row">
        <div className="settings-row-text">
          <span id={labelId} className="settings-row-label mono">{server.name}</span>
          <p className="settings-row-description mono mcp-summary" title={summary(server)}>{summary(server)}</p>
          <p className="settings-row-description">
            {server.agents.length ? `交给 ${server.agents.map(agentLabel).join('、')}` : '没有交给任何 Agent'}
            {keys.length > 0 && ` · ${server.transport.type === 'stdio' ? '环境变量' : '请求头'} ${keys.join('、')}`}
          </p>
        </div>
        <Toggle labelId={labelId} checked={server.enabled} disabled={busy} onChange={(enabled) => void run(() => perform((rpc) => rpc.call('mcpServers.setEnabled', { name: server.name, enabled })))} />
      </div>
      {probe && <ProbeResult probe={probe} />}
      <div className="plugin-actions">
        <button type="button" className="button" disabled={busy || probe === 'running'} onClick={onProbe}>测试连接</button>
        <button type="button" className="button" disabled={busy} onClick={onEdit}>编辑</button>
        {removing ? (
          <>
            <span className="settings-note">删除后，用到它的 Agent 下次启动起就没有它的工具。</span>
            <button type="button" className="button" disabled={busy} onClick={() => void run(() => perform((rpc) => rpc.call('mcpServers.remove', { name: server.name })))}>确认删除</button>
            <button type="button" className="button ghost" onClick={() => setRemoving(false)}>取消</button>
          </>
        ) : <button type="button" className="button ghost" disabled={busy} onClick={() => setRemoving(true)}>删除</button>}
      </div>
    </div>
  )
}

const SOURCE_TEXT: Record<AgentKind, string> = { claude: '~/.claude.json', codex: 'Codex 的 config.toml', cursor: '~/.cursor/mcp.json' }

// Servers the agents have in their own configuration, taken in under names the user can change.
// Each goes to the chosen agents but the one it came from, which loads it already.
function ImportPanel({ onDone }: { onDone: (imported: string[]) => void }) {
  const [candidates, setCandidates] = useState<McpImportCandidate[] | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<AgentKind[]>([...TAKERS])
  const [busy, setBusy] = useState(false)
  useEffect(() => { void perform((rpc) => rpc.call('mcpServers.importable', {})).then((found) => setCandidates(found ?? [])) }, [])
  const keyOf = (candidate: McpImportCandidate) => `${candidate.source}/${candidate.name}`
  const picked = (candidates ?? []).filter((candidate) => keyOf(candidate) in chosen)
  const valid = picked.length > 0 && picked.every((candidate) => McpServerName.safeParse(chosen[keyOf(candidate)]).success)

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const imported: string[] = []
    try {
      for (const source of TAKERS) {
        const items = picked.filter((candidate) => candidate.source === source).map((candidate) => ({ source, name: candidate.name, as: chosen[keyOf(candidate)] ?? '' }))
        if (!items.length) continue
        const saved = await perform((rpc) => rpc.call('mcpServers.import', { items, agents: agents.filter((agent) => agent !== source) }))
        if (!saved) return
        imported.push(...saved.map((server) => server.name))
      }
      onDone(imported)
    } finally {
      setBusy(false)
    }
  }

  if (candidates === null) return <p className="settings-empty">正在读取 Claude、Codex 和 Cursor 的配置…</p>
  return (
    <div className="chat-command-form">
      {candidates.length === 0 ? <p className="settings-empty">Claude、Codex 和 Cursor 的用户配置里都没有 MCP 服务器。</p> : (
        <ul className="settings-project-list">
          {candidates.map((candidate) => {
            const key = keyOf(candidate)
            const on = key in chosen
            const blocked = candidate.problem ?? (candidate.suggestedName ? null : '同名的服务器已经在 Kando 里了，勾选后改个名字')
            return (
              <li key={key} className="settings-project mcp-candidate">
                <input type="checkbox" checked={on} disabled={Boolean(candidate.problem) || busy} aria-label={`导入 ${candidate.name}`}
                  onChange={(event) => setChosen((current) => {
                    const { [key]: _dropped, ...rest } = current
                    return event.target.checked ? { ...rest, [key]: candidate.suggestedName ?? '' } : rest
                  })} />
                <span className="settings-project-name mono">{candidate.name}</span>
                <span className="muted">{SOURCE_TEXT[candidate.source]}</span>
                <span className="settings-project-path mono" title={candidate.transport.type === 'stdio' ? candidate.transport.command : candidate.transport.url}>
                  {candidate.transport.type === 'stdio' ? [candidate.transport.command, ...candidate.transport.args].join(' ') : candidate.transport.url}
                </span>
                {on && <input className="input mono mcp-candidate-name" value={chosen[key] ?? ''} aria-label={`${candidate.name} 在 Kando 里的名字`} onChange={(event) => setChosen((current) => ({ ...current, [key]: event.target.value }))} spellCheck={false} />}
                {blocked && !on && <span className="settings-note warning">{blocked}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="chat-command-field">
          <span>交给哪些 Agent</span>
          <AgentChoices value={agents} onChange={setAgents} />
          <span className="chat-command-hint">不会再交给它原来所在的 Agent：那里已经有了，交两次会启动两份。</span>
        </div>
      )}
      <div className="chat-command-actions">
        <button type="button" className="button ghost" onClick={() => onDone([])}>取消</button>
        {candidates.length > 0 && <button type="button" className="button primary" disabled={!valid || busy} onClick={() => void submit()}>{busy ? '导入中…' : `导入 ${picked.length} 个`}</button>}
      </div>
    </div>
  )
}

// The user's MCP servers: handed at each start to the agents picked for each, beside Kando's own,
// with nothing written into the agents' own configuration.
export function McpSettingsSection() {
  const connected = useCore((s) => s.connection === 'connected')
  const servers = useCore((s) => s.mcpServers)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [importing, setImporting] = useState(false)
  const [probes, setProbes] = useState<Record<string, McpProbe | 'running'>>({})

  const probe = async (name: string) => {
    setProbes((current) => ({ ...current, [name]: 'running' }))
    const result = await perform((rpc) => rpc.call('mcpServers.probe', { name }))
    setProbes(({ [name]: _running, ...rest }) => (result ? { ...rest, [name]: result } : rest))
  }

  if (!connected) return <p className="settings-empty">连接到 Kando core 后才能查看。</p>
  if (draft) return <ServerForm key={draft.previousName ?? 'new'} initial={draft} onDone={(saved) => { setDraft(null); if (saved) void probe(saved) }} />
  if (importing) return <ImportPanel onDone={(imported) => { setImporting(false); imported.forEach((name) => void probe(name)) }} />
  return (
    <>
      <p className="settings-note">
        启动 Agent 时交给它，和 Kando 自己的工具一起；不改 ~/.claude.json、~/.codex/config.toml、~/.cursor/mcp.json，Agent 自己配的服务器照常加载。改动从下次启动 Agent 起生效。
        MCP 服务器能读写你的数据、能联网：只添加你信任的。需要确认的工具调用会在聊天里请你确认。
      </p>
      {servers.length === 0 ? <p className="settings-empty">还没有 MCP 服务器。</p> : servers.map((server) => (
        <ServerRow key={server.name} server={server} probe={probes[server.name]} onProbe={() => void probe(server.name)} onEdit={() => setDraft(draftOf(server))} />
      ))}
      <div className="chat-command-actions">
        <button type="button" className="button" onClick={() => setImporting(true)}>从 Claude / Codex / Cursor 导入</button>
        <button type="button" className="button primary" onClick={() => setDraft(NEW_DRAFT)}>添加服务器</button>
      </div>
    </>
  )
}
