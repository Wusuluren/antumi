import { setChatSettings, useCore } from '../core-store'
import { usePreferences } from '../preferences'
import { Segmented, SettingsRow } from './SettingsControls'

export function TitleNamingSettings() {
  const mode = useCore((state) => state.chatSettings?.titleNaming)
  if (mode === undefined) return null
  return <SettingsRow
    label="会话标题命名"
    description="默认关闭，沿用首条消息。开启后由同一 Agent 的轻量模型总结标题：仅首轮完成后生成一次，或每轮完成后更新为最新主题。手动重命名始终优先；失败保留原名。每次总结会额外计入用量，不占主会话上下文；任务等固定标题不受影响。"
    control={(labelId) => <div className="title-naming-options"><Segmented labelId={labelId} value={mode}
      options={[{ value: 'off', label: '关闭' }, { value: 'first', label: '首轮总结' }, { value: 'latest', label: '每轮更新' }]}
      onChange={(titleNaming) => void setChatSettings({ titleNaming, titleModels: usePreferences.getState().quickModels })} /></div>}
  />
}
