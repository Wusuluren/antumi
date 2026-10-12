import type { ChatPermissionMode } from '../chat'

export type AgentModeText = { label: string; description: string }

// What core and every client know of an agent without running it: plain data, so a client reads
// the agent's rules here rather than re-encoding them, and a new agent is one more descriptor.
export type AgentDescriptor = {
  label: string
  // The command the user runs themselves, to sign in or refresh its credentials.
  cli: string
  // Kando's permission modes as this agent's users know them; a mode left out is one it lacks.
  modes: Partial<Record<ChatPermissionMode, AgentModeText>>
  // What a new conversation can start in, before the catalog adds auto and the settings bypass.
  // The first is the fallback when defaultStartMode is unavailable.
  startModes: readonly ChatPermissionMode[]
  defaultStartMode: ChatPermissionMode
  // What it runs in as a member of a group chat: it reads the projects and answers in words, and
  // changes nothing.
  discussionMode: ChatPermissionMode
  capabilities: {
    // Runs with nobody there: schedules and routines.
    unattended: boolean
    // Can run with nothing asked and nothing sandboxed, where the user allows it.
    bypass: boolean
    // Offers auto where its catalog says the model takes it.
    autoMode: boolean
    // Reads `@path` in a message itself; without it the agent gets the path to read.
    pathMentions: boolean
    // Takes a mode, model or effort switch while a turn runs.
    optionsWhileBusy: boolean
  }
  // A plan it approves runs on in one of its own modes, named as the agent names them, rather than
  // in Kando's run modes.
  nativePlanRun?: { hint: string }
  environment: {
    // Why Kando needs it, and how it runs it.
    role: string
    install: string
    signIn: string
    // A CLI found, but too old to speak the protocol Kando runs it with.
    outdated?: { status: string; hint: string }
  }
  // Where a usage reset can be used.
  usageWhere: string
  // Folders under %LOCALAPPDATA% its Windows installer puts the CLI in, which PATH may lack.
  windowsPathDirs?: readonly string[]
}
