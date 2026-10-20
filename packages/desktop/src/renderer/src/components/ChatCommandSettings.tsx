import { t, tr } from '../i18n'
import { useEffect, useState, type FormEvent } from 'react'
import { CHAT_COMMAND_ARGUMENTS, ChatCommandFields, type SavedChatCommand } from '@antumi/protocol'
import { deleteChatCommand, perform, saveChatCommand, useCore } from '../core-store'
import { PRIMARY_KEY_LABEL, hasPrimaryModifier } from '../shortcut-keys'
import { projectName } from './ProjectPicker'

type Draft = { id?: string; name: string; description: string; prompt: string; projectPath: string | null }

const NEW_DRAFT: Draft = { name: '', description: '', prompt: '', projectPath: null }

function CommandForm({ draft, projects, onDone }: { draft: Draft; projects: readonly string[]; onDone: () => void }) {
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [prompt, setPrompt] = useState(draft.prompt)
  const [projectPath, setProjectPath] = useState(draft.projectPath)
  const [saving, setSaving] = useState(false)
  const fields = { name: name.trim().replace(/^\//, ''), description: description.trim(), prompt: prompt.trim(), projectPath }
  const valid = ChatCommandFields.safeParse(fields).success
  const badName = fields.name.length > 0 && !ChatCommandFields.shape.name.safeParse(fields.name).success
  // The folder being edited stays a choice even when it has dropped out of the recent list.
  const choices = projectPath && !projects.includes(projectPath) ? [projectPath, ...projects] : projects

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    const saved = await saveChatCommand({ id: draft.id, ...fields })
    setSaving(false)
    if (saved) onDone()
  }

  return (
    <form className="chat-command-form" onSubmit={(event) => void save(event)}>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.name')}</span>
        <span className="chat-command-name-input">
          <span className="mono muted">/</span>
          <input
            className="input mono"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="fix-test"
            maxLength={41}
            spellCheck={false}
            autoFocus
            aria-invalid={badName}
          />
        </span>
        {badName && <span className="chat-command-hint">{t('ChatCommandSettings.useLettersNumbersStartingWithALetterOr')}</span>}
      </label>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.description')}</span>
        <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('ChatCommandSettings.optionalShownInTheCommandList')} maxLength={200} />
      </label>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.prompt')}</span>
        <textarea
          className="input chat-command-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && hasPrimaryModifier(event) && !event.nativeEvent.isComposing) void save()
          }}
          placeholder={t('ChatCommandSettings.forExampleFindWhyFailedFixItAnd', { CHAT_COMMAND_ARGUMENTS: CHAT_COMMAND_ARGUMENTS })}
          rows={6}
        />
        <span className="chat-command-hint">{tr('ChatCommandSettings.expandsIntoTheComposerForEditingBeforeSending', { CHAT_COMMAND_ARGUMENTS: CHAT_COMMAND_ARGUMENTS })}</span>
      </label>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.showInConversations')}</span>
        <select className="input" value={projectPath ?? ''} onChange={(event) => setProjectPath(event.target.value || null)}>
          <option value="">{t('ChatCommandSettings.allConversations')}</option>
          {choices.map((project) => (
            <option key={project} value={project}>{tr('ChatCommandSettings.only', { value1: projectName(project), project: project })}</option>
          ))}
        </select>
      </label>
      <div className="chat-command-actions">
        <button type="button" className="button ghost" onClick={onDone}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={!valid || saving}>{tr('ChatCommandSettings.save', { value1: <kbd>{PRIMARY_KEY_LABEL}↵</kbd> })}</button>
      </div>
    </form>
  )
}

function CommandRow({ command, onEdit }: { command: SavedChatCommand; onEdit: () => void }) {
  return (
    <li className="settings-project chat-command-row">
      <span className="settings-project-name mono">/{command.name}</span>
      <span className="chat-command-summary">
        {command.description || command.prompt}
      </span>
      <span className="chat-command-scope" title={command.projectPath ?? undefined}>
        {command.projectPath ? projectName(command.projectPath) : t('ChatCommandSettings.allConversations')}
      </span>
      <button type="button" className="button" onClick={onEdit}>{t('chatTools.edit')}</button>
      <button type="button" className="button" onClick={() => deleteChatCommand(command.id)}>{t('ChatCommandSettings.delete')}</button>
    </li>
  )
}

export function ChatCommandSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const commands = useCore((s) => s.chatCommands)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [projects, setProjects] = useState<string[]>([])

  useEffect(() => {
    if (connected) void perform((rpc) => rpc.call('projects.recent', {})).then((recent) => setProjects(recent ?? []))
  }, [connected])

  if (!connected) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  if (draft) return <CommandForm key={draft.id ?? 'new'} draft={draft} projects={projects} onDone={() => setDraft(null)} />
  return (
    <>
      {commands.length === 0 ? (
        <p className="settings-empty">{t('ChatCommandSettings.noCommandsYetTypeInTheComposerTo')}</p>
      ) : (
        <ul className="settings-project-list">
          {commands.map((command) => (
            <CommandRow key={command.id} command={command} onEdit={() => setDraft(command)} />
          ))}
        </ul>
      )}
      <div className="chat-command-actions">
        <button type="button" className="button" onClick={() => setDraft(NEW_DRAFT)}>{t('ChatCommandSettings.newCommand')}</button>
      </div>
    </>
  )
}
