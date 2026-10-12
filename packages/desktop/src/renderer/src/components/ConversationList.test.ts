import { describe, expect, it } from 'vitest'
import type { Conversation } from '@kando/protocol'
import { groupOf } from './ConversationList'

const base: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: 't', titleLocked: false, agent: 'claude', workspacePath: '/w',
  projectPaths: [], managedWorkspace: true, sessionId: null, createdAt: 0, updatedAt: 0
}

describe('groupOf', () => {
  it('puts a conversation under its primary project, whatever else it reaches, and one without last', () => {
    expect(groupOf({ ...base, projectPaths: ['/code/kando', '/code/lobehub', '/code/multica'] }, 'project')).toEqual({ label: 'kando', rank: 0 })
    expect(groupOf({ ...base, projectPaths: ['/code/kando'] }, 'project')).toEqual({ label: 'kando', rank: 0 })
    expect(groupOf(base, 'project')).toEqual({ label: '无项目', rank: 1 })
  })
})
