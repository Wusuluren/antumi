import type { ChatPermissionMode } from '@kando/protocol'
import type { AcpModel } from './acp-schema'

// What one agent adds to ACP, or names its own way. AcpDriver speaks the standard protocol and
// asks its dialect for the rest, so an agent that speaks ACP is a dialect, not a driver.
export interface AcpDialect {
  // How the user knows the agent, in what Kando says of it.
  readonly name: string
  // Starts the id of every request Kando sends. Logs keep the ids and replay matches on them, so
  // an agent's prefix never changes.
  readonly idPrefix: string
  // The session mode the agent offers for each of Kando's permission modes it has.
  readonly modes: Partial<Record<ChatPermissionMode, string>>
  // Extensions Kando asks for in initialize (clientCapabilities._meta).
  readonly clientMeta?: Record<string, unknown>
  // The auth method Kando starts the agent with; an agent naming others is signed in elsewhere.
  readonly authMethod?: string
  // A request listing models with their reasoning levels, which the session config may leave out.
  readonly models?: { method: string; parse(result: unknown): AcpModel[] | null }
  // The tool a call runs, where its input says more than its kind: null leaves it to the kind.
  toolName?(rawInput: unknown): string | null
  // The input worth showing, where the agent wraps a call's arguments.
  toolInput?(rawInput: unknown): unknown
  // The Task call a subagent announced on its parent's session runs for; without it, subagents
  // are left out of the chat.
  subagentCall?(update: unknown): string | null
  // Requests of its own: a question asked in passing, a plan to approve (accepted, it runs on in
  // the mode named), and requests Kando just acknowledges.
  readonly requests?: { question?: string; plan?: { method: string; runMode: ChatPermissionMode; runModeLabel: string; prompt: string }; acknowledged?: readonly string[] }
  // A transport error the agent wrote as the end of its reply: the reply without it, and what to say.
  providerError?(text: string): { rest: string; summary: string; detail: string } | null
}
