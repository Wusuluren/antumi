import { z } from 'zod'
import { AGENT_KINDS, ChatSettings, KnowledgeBase, UnattendedMode } from '@kando/protocol'
import { readJsonIfExists, writePrivateJson } from '@kando/protocol/node'

// Suggestions on, as in Claude Code itself; scheduled runs let edits through but still ask for
// anything else; an agent that can drives the user's own browser; agents may read the user's
// history in Kando; no knowledge base until the user picks one. Each field falls back on its own,
// so one bad value resets nothing else.
export const DEFAULT_AGENT_CONCURRENCY = 6
const DEFAULTS = {
  promptSuggestions: true,
  unattendedMode: 'acceptEdits',
  maxConcurrentAgents: 20,
  agentConcurrency: Object.fromEntries(AGENT_KINDS.map((kind) => [kind, DEFAULT_AGENT_CONCURRENCY])),
  wireLog: false,
  userBrowser: true,
  readHistory: true,
  knowledgeBase: null
} satisfies Required<ChatSettings>
const Saved = z.object({
  promptSuggestions: z.boolean().catch(DEFAULTS.promptSuggestions),
  unattendedMode: UnattendedMode.catch(DEFAULTS.unattendedMode),
  maxConcurrentAgents: ChatSettings.shape.maxConcurrentAgents.unwrap().catch(DEFAULTS.maxConcurrentAgents),
  agentConcurrency: ChatSettings.shape.agentConcurrency.unwrap().catch(DEFAULTS.agentConcurrency),
  wireLog: z.boolean().catch(DEFAULTS.wireLog),
  userBrowser: z.boolean().catch(DEFAULTS.userBrowser),
  readHistory: z.boolean().catch(DEFAULTS.readHistory),
  knowledgeBase: KnowledgeBase.nullable().catch(DEFAULTS.knowledgeBase)
}).catch(DEFAULTS)

// Machine-level, like keeping the computer awake: every window and every chat goes by the same.
export class ChatSettingsStore {
  private settings: Required<ChatSettings> = DEFAULTS

  constructor(
    private readonly file: string,
    private readonly changed: (settings: ChatSettings) => void
  ) {}

  // A file it cannot read leaves the defaults rather than keeping core from starting.
  async load(): Promise<Required<ChatSettings>> {
    let saved: unknown
    try {
      saved = await readJsonIfExists(this.file)
    } catch (error) {
      console.error('[kando-core] unreadable chat settings; using the defaults', error)
    }
    this.settings = Saved.parse(saved ?? {})
    this.settings.agentConcurrency = { ...DEFAULTS.agentConcurrency, ...this.settings.agentConcurrency }
    return this.settings
  }

  current(): Required<ChatSettings> {
    return this.settings
  }

  async update(patch: Partial<ChatSettings>): Promise<Required<ChatSettings>> {
    const next: Required<ChatSettings> = {
      promptSuggestions: patch.promptSuggestions ?? this.settings.promptSuggestions,
      unattendedMode: patch.unattendedMode ?? this.settings.unattendedMode,
      maxConcurrentAgents: patch.maxConcurrentAgents ?? this.settings.maxConcurrentAgents,
      agentConcurrency: { ...this.settings.agentConcurrency, ...patch.agentConcurrency },
      wireLog: patch.wireLog ?? this.settings.wireLog,
      userBrowser: patch.userBrowser ?? this.settings.userBrowser,
      readHistory: patch.readHistory ?? this.settings.readHistory,
      // null clears it, so only an absent field keeps the current one.
      knowledgeBase: patch.knowledgeBase === undefined ? this.settings.knowledgeBase : patch.knowledgeBase
    }
    await writePrivateJson(this.file, { version: 1, ...next })
    this.settings = next
    this.changed(next)
    return next
  }
}
