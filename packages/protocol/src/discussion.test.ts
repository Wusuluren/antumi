import { describe, expect, it } from 'vitest'
import { checkDiscussionAction } from './discussion'

describe('checkDiscussionAction', () => {
  it('pauses and stops only what runs, and not the summary', () => {
    expect(checkDiscussionAction({ state: 'running', step: 'round' }, 'pause')).toBeNull()
    expect(checkDiscussionAction({ state: 'running', step: 'summary' }, 'pause')).toBe('summing-up')
    expect(checkDiscussionAction({ state: 'paused', step: 'round' }, 'pause')).toBe('not-running')
    expect(checkDiscussionAction({ state: 'pausing', step: 'round' }, 'stop')).toBeNull()
    expect(checkDiscussionAction({ state: 'done', step: 'summary' }, 'stop')).toBe('not-running')
  })

  it('resumes a pause, adds a round to a pause or a finish, and concludes anything unfinished', () => {
    expect(checkDiscussionAction({ state: 'pausing', step: 'round' }, 'resume')).toBeNull()
    expect(checkDiscussionAction({ state: 'running', step: 'round' }, 'resume')).toBe('not-paused')
    expect(checkDiscussionAction({ state: 'done', step: 'summary' }, 'nextRound')).toBeNull()
    expect(checkDiscussionAction({ state: 'running', step: 'round' }, 'nextRound')).toBe('not-paused')
    expect(checkDiscussionAction({ state: 'paused', step: 'summary' }, 'conclude')).toBeNull()
    expect(checkDiscussionAction({ state: 'done', step: 'summary' }, 'conclude')).toBe('done')
  })
})
