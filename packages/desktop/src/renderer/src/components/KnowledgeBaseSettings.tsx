import { useEffect, useState } from 'react'
import { knowledgeBaseKind, type KnowledgeBaseKind, type KnowledgeFolder, type KnowledgeVault } from '@antumi/protocol'
import { perform, setChatSettings, useCore, useSkillsSupported } from '../core-store'
import { canPickFolder, pickFolder } from '../desktop-bridge'
import { projectName } from './ProjectPicker'
import { Segmented, SettingsRow, Toggle } from './SettingsControls'

export function KnowledgeBaseSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const chatSettings = useCore((s) => s.chatSettings)
  const skillsSupported = useSkillsSupported()
  const kindsSupported = useCore((s) => s.rpc?.features.includes('knowledge-base-kind') ?? false)
  const hasObsidianSkills = useCore((s) => s.skillRepos.some((repo) => repo.skills.some((skill) => skill.name === 'obsidian-markdown' && skill.problem === null)))
  const chosen = chatSettings?.knowledgeBase ?? null
  const chosenPath = chosen?.path ?? null
  const [pendingKind, setPendingKind] = useState<KnowledgeBaseKind>('markdown')
  const kind = kindsSupported ? (chosen ? knowledgeBaseKind(chosen) : pendingKind) : 'obsidian'
  const [vaults, setVaults] = useState<KnowledgeVault[] | null>(null)
  const [folder, setFolder] = useState<KnowledgeFolder | null>(null)

  useEffect(() => {
    if (!connected || kind !== 'obsidian') { setVaults(null); return }
    let current = true
    void perform((rpc) => rpc.call('knowledge.vaults', {})).then((found) => { if (current) setVaults(found ?? []) })
    return () => { current = false }
  }, [connected, kind])

  // What the chosen folder holds: known from the listing, else asked.
  useEffect(() => {
    if (!connected || !chosenPath) { setFolder(null); return }
    const listed = vaults?.find((vault) => vault.path === chosenPath)
    if (listed) { setFolder({ vault: true, skillDirs: listed.skillDirs }); return }
    setFolder(null)
    let current = true
    void perform((rpc) => rpc.call('knowledge.inspect', { path: chosenPath })).then((found) => { if (current) setFolder(found) })
    return () => { current = false }
  }, [connected, chosenPath, vaults])

  const changeKind = (next: KnowledgeBaseKind) => {
    setPendingKind(next)
    if (chosen) void setChatSettings({ knowledgeBase: { ...chosen, kind: next } })
  }
  const use = (path: string) => {
    void setChatSettings({ knowledgeBase: { path, write: chosen?.write ?? true, ...(kindsSupported ? { kind: 'obsidian' } : {}) } })
  }
  const browse = async () => {
    const picked = await pickFolder(chosenPath ?? undefined, kind === 'obsidian' ? '选择 Obsidian 知识库' : '选择 Markdown 文件夹')
    if (!picked) return
    void setChatSettings({ knowledgeBase: { path: picked, write: chosen?.write ?? true, ...(kindsSupported ? { kind } : {}) } })
  }

  if (!connected) return <p className="settings-empty">连接到 Antumi core 后才能查看。</p>
  if (!chatSettings) return <p className="settings-empty">正在读取…</p>
  const others = (vaults ?? []).filter((vault) => vault.path !== chosenPath)
  return (
    <>
      <p className="settings-note">
        选择存放笔记的本地文件夹，Agent 可读取资料，并在你要求时保存总结和笔记。写入只在普通阶段，规划、只读和群聊阶段只读。从下次启动 Agent 起生效。
      </p>
      {kindsSupported && <SettingsRow
        label="知识库类型"
        description={kind === 'markdown' ? '使用普通 Markdown 和相对路径链接，遵循已有笔记格式。' : '使用 Obsidian Markdown，支持双链和属性。'}
        control={(labelId) => <Segmented<KnowledgeBaseKind>
          labelId={labelId}
          value={kind}
          options={[{ value: 'markdown', label: 'Markdown 文件夹' }, { value: 'obsidian', label: 'Obsidian' }]}
          onChange={changeKind}
        />}
      />}
      {chosen ? (
        <>
          <ul className="settings-project-list">
            <li className="settings-project">
              <span className="settings-project-name">{projectName(chosen.path)}</span>
              <span className="settings-project-path mono" title={chosen.path}>{chosen.path}</span>
              <button type="button" className="button" onClick={() => void setChatSettings({ knowledgeBase: null })}>停用</button>
            </li>
          </ul>
          {kind === 'obsidian' && folder && !folder.vault && <p className="settings-note">这个文件夹里没有 .obsidian，Obsidian 可能还没打开过它；Agent 一样能读写。</p>}
          {kind === 'obsidian' && skillsSupported && !hasObsidianSkills && (
            <p className="settings-note">在 设置 → 技能 里安装推荐的 Obsidian 技能后，Agent 会按 Obsidian 的 Markdown（双链、属性）写笔记。</p>
          )}
          {folder && folder.skillDirs.length > 0 && (
            <p className="settings-note warning">
              库里有 {folder.skillDirs.join('、')}：Claude Code 和 Cursor 会把里面的技能一并加载，每次启动多花 token。不需要的话把它们移出知识库。
            </p>
          )}
          <SettingsRow
            label="允许写入"
            description="关掉后 Agent 只读知识库，不能新建或修改笔记。"
            control={(labelId) => (
              <Toggle labelId={labelId} checked={chosen.write} onChange={(write) => void setChatSettings({ knowledgeBase: { ...chosen, write } })} />
            )}
          />
        </>
      ) : (
        <p className="settings-empty">还没有选知识库。</p>
      )}
      {kind === 'obsidian' && others.length > 0 && (
        <>
          <h3 className="settings-stats-heading">Obsidian 里的库</h3>
          <ul className="settings-project-list">
            {others.map((vault) => (
              <li key={vault.path} className="settings-project">
                <span className="settings-project-name">{vault.name}{vault.open ? '（已打开）' : ''}</span>
                <span className="settings-project-path mono" title={vault.path}>{vault.path}</span>
                <button type="button" className="button" onClick={() => use(vault.path)}>使用</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {canPickFolder() && (
        <p className="settings-note">
          <button type="button" className="button" onClick={() => void browse()}>{kind === 'markdown' ? '选择 Markdown 文件夹…' : '选择其他文件夹…'}</button>
        </p>
      )}
    </>
  )
}
