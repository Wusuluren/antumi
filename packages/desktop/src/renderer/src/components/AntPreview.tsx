import { useId, useState } from 'react'
import { setPreference, usePreferences } from '../preferences'
import { AntDelivery, AntMotion, type AntAction, type AntDeliveryStatus } from './AntMotion'
import { PalettePicker } from './PalettePicker'
import { Segmented, SettingsGroup, SettingsRow, Toggle } from './SettingsControls'

const ACTIONS: { action: AntAction; title: string; description: string; once?: boolean }[] = [
  { action: 'walk', title: '轻快爬行', description: '小步前进，触角轻轻探路。' },
  { action: 'carry', title: '搬运箱子', description: '抱稳工作，一步一步送过去。' },
  { action: 'place', title: '放下箱子', description: '放稳，松手，任务交付。', once: true },
  { action: 'throw', title: '扔出箱子', description: '向后蓄力，一口气抛出去。', once: true },
  { action: 'team', title: '一起搬运', description: '两只蚂蚁，合力搬一个大箱子。' },
  { action: 'rest', title: '歇一会儿', description: '安静等待，随时准备继续。' }
]

function ActionPreview({ action, title, description, once }: typeof ACTIONS[number]) {
  const [take, setTake] = useState(0)
  const enabled = usePreferences((s) => s.antAnimations)
  return (
    <article className="ant-gallery-item">
      <AntMotion key={take} action={action} />
      <header><h4>{title}</h4>{once && <button className="ant-gallery-replay" disabled={!enabled} onClick={() => setTake((value) => value + 1)} aria-label={`重播${title}`}>重播 ↻</button>}</header>
      <p>{description}</p>
    </article>
  )
}

export function AntGallery() {
  const enabled = usePreferences((s) => s.antAnimations)
  const [paused, setPaused] = useState(false)
  const [size, setSize] = useState('large')
  const [status, setStatus] = useState<AntDeliveryStatus>('running')
  const sizeId = useId()
  const statusId = useId()
  return (
    <div className="ant-gallery" data-paused={paused || undefined} data-size={size}>
      <div className="ant-gallery-toolbar">
        <span id={sizeId}>预览尺寸</span>
        <Segmented labelId={sizeId} value={size} onChange={setSize} options={[{ value: 'large', label: '放大看' }, { value: 'small', label: '页面尺寸' }]} />
        <button className="ant-gallery-replay" disabled={!enabled} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? '继续播放' : '暂停预览'}</button>
      </div>
      {!enabled && <p className="ant-gallery-disabled" role="status">小蚂蚁已关闭，开启后可预览全部动作。</p>}
      <p className="ant-gallery-reduced">系统已开启减少动态效果，当前展示静态姿势。</p>
      <div className="ant-gallery-grid">
        {ACTIONS.map((item) => <ActionPreview key={item.action} {...item} />)}
      </div>
      <section className="ant-gallery-section">
        <h3>把工作交给子 Agent</h3>
        <p className="ant-gallery-note">蚂蚁沿框的上沿搬来箱子，放进框中，再返回搬下一箱。</p>
        <div className="ant-gallery-toolbar">
          <span id={statusId}>模拟状态</span>
          <Segmented labelId={statusId} value={status} onChange={setStatus} options={[{ value: 'running', label: '运行中' }, { value: 'waiting', label: '等待确认' }, { value: 'done', label: '已完成' }]} />
        </div>
        <div className="ant-demo-flow">
          <div className="ant-demo-root"><strong>主 Agent</strong><span>派出 1 个</span></div>
          <div className="ant-demo-wire" />
          <div className="ant-demo-card" data-status={status}>
            <AntDelivery key={status} status={status} />
            <header><strong>子 Agent</strong><span className="ant-demo-status">{status === 'running' ? '◌ 运行中' : status === 'waiting' ? '◷ 等待确认' : '✓ 已完成'}</span></header>
            <p>{status === 'running' ? '实现设置页面' : status === 'waiting' ? '等你确认后继续工作' : '设置页面已完成'}</p>
          </div>
        </div>
        <p className="ant-gallery-note">此处是动作演示；箱子不表示实际消息数量或进度。等待时停下，完成后收尾。</p>
      </section>
    </div>
  )
}

export function AntSettings({ preview = false }: { preview?: boolean }) {
  const enabled = usePreferences((s) => s.antAnimations)
  return (
    <SettingsGroup title="小蚂蚁">
      <SettingsRow label="显示小蚂蚁动效" description="Agent 工作、子 Agent 运行、回合完成、归档时和空白页上的小蚂蚁；系统减少动态效果时只留静态姿势。" control={(labelId) => <Toggle labelId={labelId} checked={enabled} onChange={(value) => setPreference('antAnimations', value)} />} />
      {preview ? <div className="ant-settings-preview"><AntGallery /></div> : (
        <details className="ant-settings-preview">
          <summary>预览动作与子 Agent 场景</summary>
          <AntGallery />
        </details>
      )}
    </SettingsGroup>
  )
}

export function AntPreview() {
  const theme = usePreferences((s) => s.theme)
  const themeId = useId()
  const paletteId = useId()
  return (
    <main className="ant-preview-page">
      <div className="ant-preview-content">
        <header className="ant-preview-heading">
          <div><span className="ant-preview-eyebrow">ANTUMI / LITTLE WORKERS</span><h1>小蚂蚁，开工了。</h1><p>六个小动作，以及一条通往子 Agent 的搬运路线。</p></div>
          <div className="ant-preview-appearance">
            <span id={themeId} className="visually-hidden">主题</span>
            <Segmented labelId={themeId} value={theme} onChange={(value) => setPreference('theme', value)} options={[{ value: 'system', label: '系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
            <span id={paletteId} className="visually-hidden">配色</span><PalettePicker labelId={paletteId} />
          </div>
        </header>
        <AntSettings preview />
      </div>
    </main>
  )
}
