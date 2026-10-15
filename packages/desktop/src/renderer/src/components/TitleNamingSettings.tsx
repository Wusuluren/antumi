import { setChatSettings, useCore } from '../core-store'
import { usePreferences } from '../preferences'
import { Segmented, SettingsRow } from './SettingsControls'

export function TitleNamingSettings() {
  const mode = useCore((state) => state.chatSettings?.titleNaming)
  if (mode === undefined) return null
  return <SettingsRow
    label="会话标题命名"
    description="关闭时沿用首条消息；开启后由同一 Agent 的轻量模型总结。手动重命名优先，每次总结计入少量用量。"
    control={(labelId) => <div className="title-naming-options"><Segmented labelId={labelId} value={mode}
      options={[{ value: 'off', label: '关闭' }, { value: 'first', label: '首轮总结' }, { value: 'latest', label: '每轮更新' }]}
      onChange={(titleNaming) => void setChatSettings({ titleNaming, titleModels: usePreferences.getState().quickModels })} /></div>}
  />
}
