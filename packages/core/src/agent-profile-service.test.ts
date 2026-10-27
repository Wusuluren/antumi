import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AgentProfile } from '@antumi/protocol'
import { AgentProfileService } from './agent-profile-service'
import { AgentProfileStore } from './agent-profile-store'
import { TaskStore } from './task-store'
import { ConversationStore } from './conversation-store'
import { ConversationService } from './conversation-service'
import { ProjectRegistry } from './project-registry'
import { AttachmentStore } from './attachment-store'
import { fakeChatDaemon } from './fake-chat-agent'

describe('reusable agent roles and delegated work', () => {
  let root: string
  let tasks: TaskStore
  let conversations: ConversationStore
  let projects: ProjectRegistry
  let daemon: ReturnType<typeof fakeChatDaemon>
  let chats: ConversationService
  let store: AgentProfileStore
  let profiles: AgentProfileService
  let reviewer: AgentProfile
  let parentId: string
  const waitFor = async (check: () => boolean) => { await expect.poll(check, { timeout: 5000 }).toBe(true) }
  const complete = (sessionId: string, text = 'verified the change', failed = false) => {
    daemon.emit(sessionId, { type: 'assistant', uuid: `a-${sessionId}-${daemon.writes.length}`, message: { id: `m-${sessionId}-${daemon.writes.length}`, content: [{ type: 'text', text }] }, parent_tool_use_id: null })
    daemon.emit(sessionId, { type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, result: text, terminal_reason: failed ? 'error' : 'completed', duration_ms: 5 })
  }
  beforeEach(async () => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-profiles-')))
    const db = path.join(root, 'antumi.db')
    tasks = new TaskStore(db); conversations = new ConversationStore(db); projects = new ProjectRegistry(db)
    daemon = fakeChatDaemon(); daemon.reply = () => {}
    chats = new ConversationService(conversations, daemon, path.join(root, 'sessions'), (event) => {
      if (event.type === 'changed' || event.type === 'chatItems') profiles.tick()
    }, projects, new AttachmentStore(path.join(root, 'attachments')))
    store = new AgentProfileStore(db)
    profiles = new AgentProfileService(store, chats, { profile: () => {}, call: () => {} })
    chats.setSquadGuard((conversation) => profiles.guard(conversation))
    chats.setCallCleanup((id) => profiles.cancelForParent(id))
    chats.setCapacity({ maxConcurrentAgents: 20, agentConcurrency: { claude: 6 } }, () => profiles.tick())
    daemon.deliver = (event) => {
      if (event.event === 'data') chats.handleData(event)
      else if (event.event === 'exit') chats.handleExit(event.sessionId, event.exitCode)
      else chats.handleStderr(event.sessionId, event.data)
    }
    reviewer = profiles.save({ name: 'Reviewer', agent: 'claude', capability: 'readOnly', instructions: 'Find defects with evidence.' })
    const repo = path.join(root, 'project'); mkdirSync(repo)
    parentId = (await chats.create('claude', [repo], false, { permissionMode: 'ask' })).id
  })
  afterEach(async () => {
    await profiles.close(); projects.close(); conversations.close(); tasks.close()
    rmSync(root, { recursive: true, force: true })
  })
  it('freezes role configuration, isolates history, hides the child and returns the result once', async () => {
    await chats.send(parentId, 'Implement a feature')
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review the changed files', 'review-1')
    profiles.save({ ...reviewer, instructions: 'New instructions' }, reviewer.id)
    complete(chats.get(parentId).sessionId!, 'delegated')
    await waitFor(() => store.call(call.id).state === 'running')
    const child = chats.get(call.conversationId)
    expect(child).toMatchObject({ parentConversationId: parentId, agentCallId: call.id, workspaceReadOnly: true, profile: { instructions: reviewer.instructions } })
    expect(chats.list().map((item) => item.id)).toEqual([parentId])
    const spawn = daemon.spawns.at(-1)!
    expect(spawn.args.join(' ')).toContain(reviewer.instructions)
    expect(chats.messages(child.id).some((message) => message.text === 'Implement a feature')).toBe(false)
    complete(child.sessionId!, 'Found a missing timeout')
    await waitFor(() => store.call(call.id).delivered)
    expect(store.call(call.id)).toMatchObject({ state: 'completed', result: 'Found a missing timeout' })
    expect(chats.get(child.id).sessionId).toBeNull()
    await profiles.reconcile()
    expect(chats.messages(parentId).filter((message) => message.text.includes('Found a missing timeout'))).toHaveLength(1)
    expect(await profiles.dispatch(parentId, reviewer.id, 'Review the changed files', 'review-1')).toMatchObject({ id: call.id })
  })
  it('limits role callers, refuses nested dispatch and caps a planning caller to read-only', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    conversations.setWorkspaceReadOnly(parentId, true)
    const call = await profiles.dispatch(parentId, developer.id, 'Analyze the implementation')
    expect(call.readOnly).toBe(true)
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(call.conversationId).workspaceReadOnly).toBe(true)
    await expect(profiles.dispatch(call.conversationId, reviewer.id, 'Nested work')).rejects.toMatchObject({ reason: 'agent-call-unavailable' })
    conversations.setProfile(parentId, profiles.save({ name: 'Restricted', agent: 'claude', callableProfiles: [] }))
    expect(profiles.available(parentId)).toEqual([])
    await expect(profiles.dispatch(parentId, reviewer.id, 'Not allowed')).rejects.toMatchObject({ reason: 'agent-call-forbidden' })
  })
  it('runs one developer at a time, prevents parent edits and cancels without deleting files', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    const first = await profiles.dispatch(parentId, developer.id, 'Implement part one')
    const second = await profiles.dispatch(parentId, developer.id, 'Implement part two')
    await waitFor(() => store.call(first.id).state === 'running')
    expect(store.call(second.id).state).toBe('queued')
    await expect(chats.send(parentId, 'Edit the same files')).rejects.toMatchObject({ reason: 'agent-call-writing' })
    await profiles.cancelForParent(parentId)
    expect(profiles.calls(parentId).map((call) => call.state)).toEqual(['cancelled', 'cancelled'])
    expect(chats.get(first.conversationId).sessionId).toBeNull()
    expect(profiles.calls(parentId).every((call) => call.delivered)).toBe(true)
  })
  it('sends failures back to the parent instead of treating them as success', async () => {
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review')
    await waitFor(() => store.call(call.id).state === 'running')
    complete(chats.get(call.conversationId).sessionId!, 'Could not read the file', true)
    await waitFor(() => store.call(call.id).delivered)
    expect(store.call(call.id).state).toBe('failed')
    expect(chats.messages(parentId).some((message) => message.text.includes('"state":"failed"'))).toBe(true)
  })
  it('restores queued work and archived roles do not change its saved snapshot', async () => {
    await chats.send(parentId, 'Working')
    const call = await profiles.dispatch(parentId, reviewer.id, 'Review later')
    profiles.archive(reviewer.id, true)
    expect(profiles.available(parentId)).toEqual([])
    await profiles.close()
    store = new AgentProfileStore(path.join(root, 'antumi.db'))
    profiles = new AgentProfileService(store, chats, { profile: () => {}, call: () => {} })
    complete(chats.get(parentId).sessionId!, 'ready')
    await profiles.reconcile()
    await waitFor(() => store.call(call.id).state === 'running')
    expect(chats.get(call.conversationId).profile?.archivedAt).toBeNull()
  })

  it('returns work to a task conversation and preserves its planning constraint', async () => {
    const parent = await chats.startForTask({ id: 'task-1', title: 'Plan a feature', agent: 'claude' }, {
      cwd: chats.get(parentId).workspacePath, extraDirs: [], planOnly: true, session: 'new', permissionMode: 'plan'
    })
    const call = await profiles.dispatch(parent.id, reviewer.id, 'Analyze the API')
    await waitFor(() => store.call(call.id).state === 'running')
    complete(chats.get(call.conversationId).sessionId!, 'API analysis complete')
    await waitFor(() => store.call(call.id).delivered)
    expect(chats.get(parent.id)).toMatchObject({ taskId: 'task-1', planOnly: true })
    expect(chats.messages(parent.id).some((message) => message.text.includes('API analysis complete'))).toBe(true)
  })

  it('serializes writers across conversations sharing a directory while readers run together', async () => {
    const developer = profiles.save({ name: 'Developer', agent: 'claude', capability: 'develop' })
    const other = await chats.create('claude', chats.get(parentId).projectPaths, false, { permissionMode: 'ask' })
    const first = await profiles.dispatch(parentId, developer.id, 'Edit the module')
    await waitFor(() => store.call(first.id).state === 'running')
    const second = await profiles.dispatch(other.id, developer.id, 'Edit the same module')
    const reader = await profiles.dispatch(other.id, reviewer.id, 'Inspect the module')
    await waitFor(() => store.call(reader.id).state === 'running')
    expect(store.call(second.id).state).toBe('queued')
    await expect(chats.send(other.id, 'Edit while another writer runs')).rejects.toMatchObject({ reason: 'agent-call-writing' })
    await profiles.cancelForParent(parentId)
    profiles.tick()
    await waitFor(() => store.call(second.id).state === 'running')
    expect(chats.list(false, false, true).some((conversation) => conversation.id === second.conversationId)).toBe(true)
  })

  it('marks a vanished process as failed after reconciliation', async () => {
    const call = await profiles.dispatch(parentId, reviewer.id, 'Inspect the module')
    await waitFor(() => store.call(call.id).state === 'running')
    await chats.stop(call.conversationId)
    await profiles.reconcile()
    expect(store.call(call.id)).toMatchObject({ state: 'failed', delivered: true })
  })
})
