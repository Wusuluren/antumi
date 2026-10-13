import { useEffect, useState } from 'react'
import type { KnowledgeFolder, KnowledgeVault } from '@kando/protocol'
import { perform, setChatSettings, useCore, useSkillsSupported } from '../core-store'
import { canPickFolder, pickFolder } from '../desktop-bridge'
import { projectName } from './ProjectPicker'
import { SettingsRow, Toggle } from './SettingsControls'

// The user's Obsidian vault agents are given: the one chosen and whether they may write it, and
// the vaults Obsidian knows, to choose from.
export function KnowledgeBaseSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const chatSettings = useCore((s) => s.chatSettings)
  const skillsSupported = useSkillsSupported()
  const hasObsidianSkills = useCore((s) => s.skillRepos.some((repo) => repo.skills.some((skill) => skill.name === 'obsidian-markdown' && skill.problem === null)))
  const chosen = chatSettings?.knowledgeBase ?? null
  const chosenPath = chosen?.path ?? null
  const [vaults, setVaults] = useState<KnowledgeVault[] | null>(null)
  const [folder, setFolder] = useState<KnowledgeFolder | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (connected) void perform((rpc) => rpc.call('knowledge.vaults', {})).then((found) => setVaults(found ?? []))
  }, [connected])

  // What the chosen folder holds: known from the listing, else asked.
  useEffect(() => {
    if (!connected || !chosenPath) { setFolder(null); return }
    const listed = vaults?.find((vault) => vault.path === chosenPath)
    if (listed) { setFolder({ vault: true, skillDirs: listed.skillDirs }); return }
    let current = true
    void perform((rpc) => rpc.call('knowledge.inspect', { path: chosenPath })).then((found) => { if (current) setFolder(found) })
    return () => { current = false }
  }, [connected, chosenPath, vaults])

  const use = (path: string) => { setNotice(null); void setChatSettings({ knowledgeBase: { path, write: true } }) }
  const browse = async () => {
    const picked = await pickFolder(chosenPath ?? undefined, '选择 Obsidian 知识库')
    if (!picked) return
    const found = await perform((rpc) => rpc.call('knowledge.inspect', { path: picked }))
    void setChatSettings({ knowledgeBase: { path: picked, write: true } })
    setNotice(found && !found.vault ? '这个文件夹里没有 .obsidian，Obsidian 可能还没打开过它；Agent 一样能读写。' : null)
  }

  if (!connected) return <p className="settings-empty">连接到 Kando core 后才能查看。</p>
  if (!chatSettings) return <p className="settings-empty">正在读取…</p>
  const others = (vaults ?? []).filter((vault) => vault.path !== chosenPath)
  return (
    <>
      <p className="settings-note">
        每次启动 Agent 都把知识库的原目录交给它（不算项目，也不建 worktree）：让它总结或记笔记时就能直接写进去，Obsidian 立刻能看到。读取始终可以；写入只在普通阶段，规划、只读和群聊阶段只读，Codex 的只读沙箱下也不能写。从下次启动 Agent 起生效。
      </p>
      {chosen ? (
        <>
          <ul className="settings-project-list">
            <li className="settings-project">
              <span className="settings-project-name">{projectName(chosen.path)}</span>
              <span className="settings-project-path mono" title={chosen.path}>{chosen.path}</span>
              <button type="button" className="button" onClick={() => void setChatSettings({ knowledgeBase: null })}>停用</button>
            </li>
          </ul>
          {notice && <p className="settings-note">{notice}</p>}
          {skillsSupported && !hasObsidianSkills && (
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
              <Toggle labelId={labelId} checked={chosen.write} onChange={(write) => void setChatSettings({ knowledgeBase: { path: chosen.path, write } })} />
            )}
          />
        </>
      ) : (
        <p className="settings-empty">还没有选知识库。</p>
      )}
      {others.length > 0 && (
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
          <button type="button" className="button" onClick={() => void browse()}>选择其他文件夹…</button>
        </p>
      )}
    </>
  )
}
