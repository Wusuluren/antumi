import { z } from 'zod'
import { AgentKind } from './agent'
import { MAX_TASK_REPOS } from './task'

// A group chat: several agents, each in a conversation of its own that the list does not show,
// discuss a topic in rounds. The first round they answer alone; in each after it every member reads
// what the others said since and answers it; then the chair sums up. They read and never change.

export const MIN_DISCUSSION_MEMBERS = 2
export const MAX_DISCUSSION_MEMBERS = 5
export const MAX_DISCUSSION_ROUNDS = 5
export const DEFAULT_DISCUSSION_ROUNDS = 3

export const DiscussionMemberFields = z.object({
  agent: AgentKind,
  model: z.string().trim().min(1).max(200).optional(),
  effort: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(60),
  // The stance or angle it is to take, in the user's words; empty for none.
  role: z.string().trim().max(2000).default('')
})
export type DiscussionMemberFields = z.input<typeof DiscussionMemberFields>

// working: a turn of the discussion's is running; awaiting: it waits on the user (an approval, a question).
export const DiscussionMemberStatus = z.enum(['idle', 'working', 'awaiting'])
export type DiscussionMemberStatus = z.infer<typeof DiscussionMemberStatus>

export const DiscussionMember = DiscussionMemberFields.extend({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  model: z.string().nullable(),
  effort: z.string().nullable(),
  role: z.string(),
  status: DiscussionMemberStatus.catch('idle')
})
export type DiscussionMember = z.infer<typeof DiscussionMember>

// running: turns are out, or the next step is about to go; pausing: the user paused, and the turns
// still out are let finish; paused: nothing out, more to come when resumed; done: summed up.
export const DiscussionState = z.enum(['running', 'pausing', 'paused', 'done'])
export type DiscussionState = z.infer<typeof DiscussionState>

export const Discussion = z.object({
  id: z.string().uuid(),
  title: z.string(),
  topic: z.string(),
  projectPaths: z.array(z.string()),
  members: z.array(DiscussionMember),
  chairId: z.string().uuid(),
  maxRounds: z.number().int().min(1).max(MAX_DISCUSSION_ROUNDS),
  // Whether members see each other as 成员 A, B… rather than by name, model and agent.
  anonymous: z.boolean(),
  state: DiscussionState.catch('paused'),
  // What the turns last sent out were: a round of the discussion, or the summary.
  step: z.enum(['round', 'summary']).nullable(),
  // The round last sent out, 0 before the first; lastRound is the one the summary follows.
  round: z.number().int().nonnegative(),
  lastRound: z.number().int().nonnegative(),
  pinnedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type Discussion = z.infer<typeof Discussion>

// opening: a member's first, independent answer; rebuttal: its answer in a later round; reply: to
// the user who named it; notice: Kando's own line, as when a member's turn failed.
export const DiscussionPostKind = z.enum(['opening', 'rebuttal', 'reply', 'summary', 'user', 'notice'])
export type DiscussionPostKind = z.infer<typeof DiscussionPostKind>

export const DiscussionPost = z.object({
  id: z.string().uuid(),
  discussionId: z.string().uuid(),
  sequence: z.number().int().positive(),
  round: z.number().int().nonnegative(),
  // The member who said it; null for the user and for notices.
  memberId: z.string().uuid().nullable(),
  kind: DiscussionPostKind.catch('notice'),
  text: z.string(),
  // The members a user's post names, who alone answer it.
  mentions: z.array(z.string().uuid()),
  // A member's post is pending while its turn runs, failed when the turn did not complete.
  state: z.enum(['pending', 'done', 'failed']).catch('done'),
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type DiscussionPost = z.infer<typeof DiscussionPost>

export const DiscussionCreate = z.object({
  title: z.string().trim().max(200).optional(),
  topic: z.string().trim().min(1).max(20000),
  projectPaths: z.array(z.string().trim().min(1)).max(MAX_TASK_REPOS),
  members: z.array(DiscussionMemberFields).min(MIN_DISCUSSION_MEMBERS).max(MAX_DISCUSSION_MEMBERS),
  // Which of members sums up.
  chair: z.number().int().nonnegative(),
  maxRounds: z.number().int().min(1).max(MAX_DISCUSSION_ROUNDS).default(DEFAULT_DISCUSSION_ROUNDS),
  anonymous: z.boolean().default(false)
}).refine((fields) => fields.chair < fields.members.length, { message: 'the chair must be one of the members' })
export type DiscussionCreate = z.input<typeof DiscussionCreate>

// pause: no new round after the turns out now; resume: go on from where it paused; nextRound: one
// more round, then the summary again; conclude: the summary once the turns out now are in; stop:
// interrupt the turns out now, and pause.
export const DiscussionAction = z.enum(['pause', 'resume', 'nextRound', 'conclude', 'stop'])
export type DiscussionAction = z.infer<typeof DiscussionAction>

export type DiscussionActionBlocker = 'not-running' | 'not-paused' | 'summing-up' | 'done'

export function checkDiscussionAction(discussion: Pick<Discussion, 'state' | 'step'>, action: DiscussionAction): DiscussionActionBlocker | null {
  const { state, step } = discussion
  const summing = step === 'summary' && (state === 'running' || state === 'pausing')
  switch (action) {
    case 'pause':
      if (summing) return 'summing-up'
      return state === 'running' ? null : 'not-running'
    case 'resume':
      return state === 'paused' || state === 'pausing' ? null : 'not-paused'
    case 'nextRound':
      return state === 'paused' || state === 'done' ? null : 'not-paused'
    case 'conclude':
      if (state === 'done') return 'done'
      return summing ? 'summing-up' : null
    case 'stop':
      return state === 'running' || state === 'pausing' ? null : 'not-running'
  }
}

// Parsed one by one, so a discussion a newer core describes differently drops alone.
export const DiscussionList = z.array(z.unknown()).transform((discussions) =>
  discussions.flatMap((discussion) => {
    const parsed = Discussion.safeParse(discussion)
    return parsed.success ? [parsed.data] : []
  })
)
