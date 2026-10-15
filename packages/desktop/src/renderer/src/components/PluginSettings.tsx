import { useEffect, useId, useState } from 'react'
import type { PluginInfo, PluginInstallSource } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { pickPlugin } from '../desktop-bridge'
import { Toggle } from './SettingsControls'
import { ChatPicker } from './ChatPicker'

export function PluginSettings() {
  const ids = useId()
  const rpc = useCore((state) => state.rpc)
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<'local' | 'github'>('local')
  const [location, setLocation] = useState('')
  const [tag, setTag] = useState('')
  const [asset, setAsset] = useState('')
  const [trusted, setTrusted] = useState(false)
  const [remove, setRemove] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!rpc) { setPlugins(null); return }
    let active = true
    let changed = false
    const off = rpc.on('plugins.changed', ({ plugins }) => { changed = true; if (active) setPlugins(plugins) })
    void perform((connection) => connection.call('plugins.list', {})).then((result) => {
      if (active && !changed && result) setPlugins(result)
    })
    return () => { active = false; off() }
  }, [rpc])

  const run = async (action: Parameters<typeof perform>[0], message: string) => {
    if (busy) return
    setBusy(true)
    setStatus('')
    try {
      const result = await perform(action)
      if (result !== null) {
        setStatus(message)
        const updated = await perform((connection) => connection.call('plugins.list', {}))
        if (updated) setPlugins(updated)
      }
    } finally { setBusy(false) }
  }

  const install = () => {
    const source: PluginInstallSource = kind === 'local'
      ? { kind, path: location.trim() }
      : { kind, repository: location.trim(), ...(tag.trim() ? { tag: tag.trim() } : {}), ...(asset.trim() ? { asset: asset.trim() } : {}) }
    void run((connection) => connection.call('plugins.install', { source }), '插件已安装')
  }

  return (
    <div className="settings-form">
      <form className="plugin-install" onSubmit={(event) => { event.preventDefault(); install() }}>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor={`${ids}-kind`}>安装来源</label>
          <select id={`${ids}-kind`} className="input" value={kind} disabled={busy} onChange={(event) => {
            setKind(event.target.value === 'github' ? 'github' : 'local'); setLocation(''); setTrusted(false)
          }}>
            <option value="local">本地目录或 ZIP</option>
            <option value="github">GitHub Release</option>
          </select>
        </div>
        <div className="settings-field">
          <label className="settings-field-label" htmlFor={`${ids}-location`}>{kind === 'local' ? '插件路径' : 'GitHub 仓库'}</label>
          <input id={`${ids}-location`} className="input mono" value={location} required disabled={busy} placeholder={kind === 'local' ? '插件目录或 ZIP 的完整路径' : 'owner/repository'} onChange={(event) => { setLocation(event.target.value); setTrusted(false) }} />
          {kind === 'local' && window.antumi?.pickPlugin && <div className="plugin-actions">
            <button className="button ghost" type="button" disabled={busy} onClick={() => { void pickPlugin('directory').then((path) => { if (path) { setLocation(path); setTrusted(false) } }) }}>选择目录</button>
            <button className="button ghost" type="button" disabled={busy} onClick={() => { void pickPlugin('zip').then((path) => { if (path) { setLocation(path); setTrusted(false) } }) }}>选择 ZIP</button>
          </div>}
        </div>
        {kind === 'github' && <>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor={`${ids}-tag`}>Release 标签（可选）</label>
            <input id={`${ids}-tag`} className="input mono" value={tag} disabled={busy} placeholder="留空使用最新正式版" onChange={(event) => setTag(event.target.value)} />
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor={`${ids}-asset`}>ZIP 附件名称（可选）</label>
            <input id={`${ids}-asset`} className="input mono" value={asset} disabled={busy} placeholder="有多个 ZIP 时填写" onChange={(event) => setAsset(event.target.value)} />
          </div>
        </>}
        <p className="settings-note">插件会运行本机代码，并接收对应来源的登录凭据。请只安装你信任的插件。</p>
        <label className="plugin-trust"><input type="checkbox" checked={trusted} disabled={busy} onChange={(event) => setTrusted(event.target.checked)} />我信任这个插件及其来源</label>
        <button className="button primary" type="submit" disabled={busy || !location.trim() || !trusted}>{busy ? '正在处理…' : '安装插件'}</button>
      </form>
      {status && <p className="settings-status" role="status">{status}</p>}
      {plugins === null ? <p className="muted">正在读取插件…</p> : plugins.length === 0 ? <p className="muted">还没有安装插件。</p> : plugins.map((plugin) => (
        <div key={plugin.id} className="plugin-row">
          <div className="settings-row">
            <div className="settings-row-text">
              <span id={`${ids}-${plugin.id}`} className="settings-row-label">{plugin.sources.map((source) => source.name).join('、')}</span>
              <p className="settings-row-description">{plugin.id} · {plugin.version} · {plugin.enabled ? plugin.problem ? '启动失败' : '已启用' : '已停用'}</p>
              <p className="settings-row-description">{plugin.origin.kind === 'bundled' ? '随 Antumi 提供' : plugin.origin.kind === 'github' ? `GitHub · ${plugin.origin.repository}` : plugin.origin.path}</p>
            </div>
            <Toggle labelId={`${ids}-${plugin.id}`} checked={plugin.enabled} disabled={busy} onChange={(enabled) => { void run((connection) => connection.call('plugins.setEnabled', { id: plugin.id, enabled }), enabled ? '插件已启用' : '插件已停用') }} />
          </div>
          {plugin.problem && <p className="settings-status" role="status">{plugin.problem}</p>}
          <div className="plugin-actions">
            {plugin.origin.kind !== 'bundled' && <button className="button" disabled={busy} onClick={() => { void run((connection) => connection.call('plugins.update', { id: plugin.id }), '已检查并应用可用更新') }}>检查并更新</button>}
            {plugin.problem && <button className="button" disabled={busy} onClick={() => { void run((connection) => connection.call('plugins.setEnabled', { id: plugin.id, enabled: true }), '插件已重新加载') }}>重试加载</button>}
            {plugin.versions.length > 1 && <ChatPicker label={`${plugin.id} 切换版本`} value={plugin.version} placeholder="选择版本" size="large" placement="below" disabled={busy}
              options={plugin.versions.map((version) => ({ value: version, label: `${version}${version === plugin.version ? '（当前）' : ''}` }))}
              onChange={(version) => { void run((connection) => connection.call('plugins.rollback', { id: plugin.id, version }), '插件版本已切换') }} />}
            <button className="button ghost" disabled={busy} onClick={() => setRemove(plugin.id)}>卸载</button>
          </div>
          {remove === plugin.id && <div className="plugin-actions">
            <span className="settings-note">卸载后保留来源配置、凭据和已导入任务。</span>
            <button className="button" disabled={busy} onClick={() => { void run((connection) => connection.call('plugins.uninstall', { id: plugin.id }), '插件已卸载'); setRemove(null) }}>确认卸载</button>
            <button className="button ghost" disabled={busy} onClick={() => setRemove(null)}>取消</button>
          </div>}
        </div>
      ))}
    </div>
  )
}
