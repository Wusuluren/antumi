import { useId } from 'react'
import { MAX_DISCUSSION_REQUIREMENTS } from '@antumi/protocol'
import { DISCUSSION_REQUIREMENT_PRESETS } from '../discussion-requirements'
import { ChatPicker } from './ChatPicker'

export function DiscussionRequirements({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId()
  const selected = DISCUSSION_REQUIREMENT_PRESETS.find((preset) => preset.text === value)?.id ?? null
  return (
    <div className="discussion-draft-field">
      <div className="discussion-draft-requirements-head">
        <label htmlFor={id}>讨论要求（可选）</label>
        <ChatPicker
          label="使用预设"
          value={selected}
          placeholder={value ? '自定义' : '使用预设'}
          size="large"
          placement="below"
          disabled={disabled}
          title="选择预设会替换下方内容，仍可继续编辑"
          options={DISCUSSION_REQUIREMENT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label, description: preset.description }))}
          onChange={(chosen) => {
            const preset = DISCUSSION_REQUIREMENT_PRESETS.find((preset) => preset.id === chosen)
            if (preset) onChange(preset.text)
          }}
        />
      </div>
      <textarea
        id={id}
        className="discussion-draft-requirements"
        rows={4}
        maxLength={MAX_DISCUSSION_REQUIREMENTS}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        placeholder="填写篇幅、表达方式、论证或输出格式等共同要求"
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className="discussion-draft-requirements-hint muted">应用于所有成员、每轮发言和主持人总结。清空后不加额外要求；选择预设会替换当前内容。</p>
    </div>
  )
}
