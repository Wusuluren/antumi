import { AUTO_ARCHIVE_DAYS, DEFAULT_AUTO_ARCHIVE_DAYS } from '@antumi/protocol'
import { setChatSettings, useCore } from '../core-store'
import { Segmented, SettingsRow, Toggle } from './SettingsControls'

// Off by default; on, how long a conversation may sit idle before core puts it away. Hidden against
// a core that does not archive on its own.
export function AutoArchiveSettings() {
  const days = useCore((state) => state.chatSettings?.autoArchiveDays)
  if (days === undefined) return null
  return <>
    <SettingsRow
      label="自动归档不活跃的会话"
      description="长时间没有新消息的会话移到归档，随时可以在会话列表的归档里找回。置顶的会话、任务和群聊里的会话不归档；Agent 正在工作，或在等你批准、回答问题的，等这一步结束再归档。"
      control={(labelId) => (
        <Toggle labelId={labelId} checked={days !== null} onChange={(on) => void setChatSettings({ autoArchiveDays: on ? DEFAULT_AUTO_ARCHIVE_DAYS : null })} />
      )}
    />
    {days !== null && (
      <SettingsRow
        label="多久没有活跃"
        description="从最后一条消息，或你把它从归档里取出时算起。"
        control={(labelId) => (
          <Segmented labelId={labelId} value={String(days)}
            options={AUTO_ARCHIVE_DAYS.map((each) => ({ value: String(each), label: `${each} 天` }))}
            onChange={(value) => void setChatSettings({ autoArchiveDays: Number(value) })} />
        )}
      />
    )}
  </>
}
