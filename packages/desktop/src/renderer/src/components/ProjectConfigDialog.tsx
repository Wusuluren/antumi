import { useEffect, useRef, useState } from 'react'
import { tidyProjectConfig, type ProjectConfig } from '@antumi/protocol'
import { useOccludesBrowser } from '../browser-occlusion'
import { perform, useCore } from '../core-store'
import { CloseIcon, SparkIcon } from './icons'

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; file: string | null; config: ProjectConfig }
  // The file is there but cannot be read; saving writes over it.
  | { state: 'broken'; message: string }

// The fields as the user edits them: the files to copy one a line.
export type Draft = { copy: string; setup: string; check: string }

const draftOf = (config: ProjectConfig): Draft => ({ copy: (config.copy ?? []).join('\n'), setup: config.setup ?? '', check: config.check ?? '' })

// What a config holds, in a few words, for the project's row.
export function projectConfigSummary(config: ProjectConfig): string | null {
  const parts = [config.copy?.length ? `复制 ${config.copy.length} 个文件` : null, config.setup ? 'setup' : null, config.check ? 'check' : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

const FIELD_NAMES: Record<keyof Draft, string> = { copy: '复制的文件', setup: 'setup', check: 'check' }

// Fills the fields left empty from a suggestion, the user's own words kept; and says what it did.
export function fillFromSuggestion(draft: Draft, suggestion: { config: ProjectConfig; from: string[] }): { draft: Draft; note: string } {
  const suggested = draftOf(suggestion.config)
  const filled = (Object.keys(FIELD_NAMES) as (keyof Draft)[]).filter((name) => !draft[name].trim() && suggested[name])
  const next = { ...draft, ...Object.fromEntries(filled.map((name) => [name, suggested[name]])) }
  if (suggestion.from.length === 0 && filled.length === 0) return { draft, note: '没认出项目类型，可以参考输入框里的示例自己填。' }
  if (filled.length === 0) return { draft, note: '要填的项都已有内容，没有改动；清空某一项再点，可以换成建议的命令。' }
  const by = suggestion.from.length > 0 ? `按 ${suggestion.from.join('、')} ` : ''
  return { draft: next, note: `${by}填入了${filled.map((name) => FIELD_NAMES[name]).join('、')}，保存前看一眼命令对不对。` }
}

export function configOf(draft: Draft): ProjectConfig {
  return tidyProjectConfig({ copy: draft.copy.split('\n'), setup: draft.setup, check: draft.check })
}

// A project's .antumi/project.json as a form: what a new worktree copies from the project, the
// command that readies it, and the one a task's work must pass before review. Saving writes the
// file in the project, where it is meant to be committed.
export function ProjectConfigDialog({ projectPath, onClose, onSaved }: { projectPath: string; onClose: () => void; onSaved?: (config: ProjectConfig | null) => void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const rpc = useCore((s) => s.rpc)
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [draft, setDraft] = useState<Draft>({ copy: '', setup: '', check: '' })
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  useEffect(() => {
    if (!rpc) return
    let current = true
    rpc.call('projects.config', { path: projectPath }).then(
      (info) => {
        if (!current) return
        setLoaded({ state: 'ready', file: info ? `${info.path}/.antumi/project.json` : null, config: info?.config ?? {} })
        setDraft(draftOf(info?.config ?? {}))
      },
      (error: unknown) => {
        if (current) setLoaded({ state: 'broken', message: error instanceof Error ? error.message : String(error) })
      }
    )
    return () => { current = false }
  }, [rpc, projectPath])

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const config = configOf(draft)
      const saved = await perform((connection) => connection.call('projects.writeConfig', { path: projectPath, config }))
      if (saved !== null || Object.keys(config).length === 0) {
        onSaved?.(saved?.config ?? null)
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }
  const suggest = async () => {
    if (suggesting) return
    setSuggesting(true)
    try {
      const suggestion = await perform((connection) => connection.call('projects.suggestConfig', { path: projectPath }))
      if (!suggestion) return
      const result = fillFromSuggestion(draft, suggestion)
      setDraft(result.draft)
      setNote(result.note)
    } finally {
      setSuggesting(false)
    }
  }
  const field = (name: keyof Draft) => ({
    value: draft[name],
    onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [name]: event.target.value }))
  })

  return <dialog ref={dialog} className="modal project-config-dialog" aria-labelledby="project-config-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <header className="modal-header"><h2 id="project-config-title">项目配置</h2><button type="button" className="icon-button modal-close" aria-label="关闭" onClick={onClose}><CloseIcon /></button></header>
      <div className="project-config-source">
        <p className="project-trust-path">{loaded.state === 'ready' && loaded.file ? loaded.file : `${projectPath}/.antumi/project.json`}</p>
        <button type="button" className="button" disabled={loaded.state === 'loading' || suggesting} onClick={() => void suggest()}>
          <SparkIcon />{suggesting ? '正在看项目…' : '按项目填入建议'}
        </button>
      </div>
      {note && <p className="project-config-note" role="status">{note}</p>}
      {loaded.state === 'broken' && <p className="modal-error">现有文件读不了：{loaded.message}。保存会用下面填的内容覆盖它。</p>}
      <label className="modal-field">
        <span className="modal-label">新建 worktree 时复制的文件 <span className="modal-optional">· 每行一个，相对项目根目录，如 .env</span></span>
        <textarea className="input modal-textarea mono project-config-copy" rows={2} spellCheck={false} placeholder=".env" disabled={loaded.state === 'loading'} {...field('copy')} />
      </label>
      <label className="modal-field">
        <span className="modal-label">setup · 新建 worktree 后运行一次 <span className="modal-optional">· 如安装依赖</span></span>
        <textarea className="input modal-textarea mono" rows={2} spellCheck={false} placeholder="pnpm install、go mod download、uv sync…" disabled={loaded.state === 'loading'} {...field('setup')} />
      </label>
      <label className="modal-field">
        <span className="modal-label">check · 任务提交验收前运行 <span className="modal-optional">· 不通过就留在执行中，输出交给 Agent 修</span></span>
        <textarea className="input modal-textarea mono" rows={2} spellCheck={false} placeholder="pnpm test、go test ./...、mvn -q test…" disabled={loaded.state === 'loading'} {...field('check')} />
      </label>
      <p className="project-trust-note">命令由你的登录 shell 在 worktree 根目录运行，可用 $ANTUMI_ROOT_PATH（项目）和 $ANTUMI_WORKTREE_PATH。文件保存在项目里，建议提交到 Git，同项目的人用 Antumi 也会生效；都清空则删除这个文件。</p>
      <footer className="modal-footer"><button type="button" className="button ghost" onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={loaded.state === 'loading' || saving}>{saving ? '保存中…' : '保存'}</button></footer>
    </form>
  </dialog>
}
