import { describe, expect, it } from 'vitest'
import type { Conversation } from '@antumi/protocol'
import { groupOf, metaProjects } from './ConversationList'

const base: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: 't', titleLocked: false, agent: 'claude', workspacePath: '/w',
  projectPaths: [], managedWorkspace: true, sessionId: null, createdAt: 0, updatedAt: 0
}

describe('groupOf', () => {
  it('puts a conversation under its primary project, whatever else it reaches, and one without last', () => {
    expect(groupOf({ ...base, projectPaths: ['/code/antumi', '/code/lobehub', '/code/multica'] }, 'project')).toEqual({ label: 'antumi', rank: 0 })
    expect(groupOf({ ...base, projectPaths: ['/code/antumi'] }, 'project')).toEqual({ label: 'antumi', rank: 0 })
    expect(groupOf(base, 'project')).toEqual({ label: '无项目', rank: 1 })
  })
})

describe('metaProjects', () => {
  it('leaves the primary project to its heading, naming only the others it reaches', () => {
    expect(metaProjects(['/code/antumi', '/code/orca', '/code/multica'], true)).toBe('+orca、multica')
    expect(metaProjects(['/code/antumi'], true)).toBeNull()
    expect(metaProjects([], true)).toBeNull()
    expect(metaProjects(['/code/antumi', '/code/orca'], false)).toBe('antumi、orca')
    expect(metaProjects([], false)).toBe('无项目')
  })
})
