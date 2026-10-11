import type { AgentCliInstallation, AgentKind, ChatCatalog, ChatPermissionMode, EnvironmentCheck } from '@kando/protocol'
import type { AgentCommand, McpServer } from '../agent-command'
import type { ChatDriver, ChatPreferences, ChatStageOptions } from '../chat-driver'
import type { UsageSource } from '../usage-source'

// What a chat stage's agent starts with, which its adapter turns into its own command line. The
// stream carries every message, the handoff prompt included: none goes in argv.
export type AgentLaunch = {
  providerSessionId: string | null
  resume: boolean
  handoffPath: string | null
  extraProjects: readonly string[]
  preferred?: ChatPreferences
  allowBypass?: boolean
  // Plans only, read-only in these folders: plan mode, their files never editable, no bypass.
  planOnly?: { dirs: readonly string[] }
  // Files the agent may read without asking, such as a task's images.
  readable?: readonly string[]
  // Resume only through this message (its uuid), as a new session: a fork of the one resumed.
  forkAt?: string | null
  // Kando's own tools for the agent (showing a file it wrote); none for an older setup.
  mcp?: McpServer
}

export type AgentDetection = Omit<EnvironmentCheck, 'tool'>

// Everything core knows of one agent beyond its descriptor: how to start it, speak to it, find it
// and read its limits. Core asks the adapter rather than the agent's name, so an agent is added by
// writing one and registering it (agents/index.ts).
export interface AgentAdapter {
  readonly kind: AgentKind
  createDriver(stageId: string, options: ChatStageOptions): ChatDriver
  command(launch: AgentLaunch): AgentCommand
  // Kando's modes it can start in; a start asking another is refused before anything runs.
  readonly permissionModes: readonly string[]
  // The mode a stage starts in when the chosen one is not among its modes; without one, the CLI's
  // own default stands.
  readonly fallbackMode?: ChatPermissionMode
  readonly session: {
    // Kando names the session before launch, so one that died before its first prompt left an id
    // the agent never saved: only a session that recorded messages is resumed.
    preassignedId: boolean
    // Its sessions belong to the folder they ran in: moved elsewhere, it starts afresh from a handoff.
    folderBound: boolean
    // It takes its own session over through a fork point; otherwise a fork starts from a handoff.
    nativeFork: boolean
  }
  // How long its handshake may take, where the host's own wait is too short.
  readonly startTimeoutMs?: number
  // Who asks before Kando's MCP tools run a terminal command: the agent itself, or Kando in the chat.
  readonly mcpApproval: 'agent' | 'kando'
  // Its models without a chat to read them from; without it, a probe of its chat protocol.
  catalog?(cwd: string): Promise<ChatCatalog | null>
  // How the environment check finds it; without it, its kind on PATH, asked for --version.
  detect?(pathEnv: string, platform: NodeJS.Platform): Promise<AgentDetection>
  signedIn?(): Promise<boolean>
  readonly usage?: UsageSource
  // The command that installs its CLI, offered when its application is found without the CLI.
  installation?(platform: NodeJS.Platform): AgentCliInstallation | null
  // What discovery looks for besides its CLI: other executable names, and application bundles.
  readonly discovery?: { commands: readonly string[]; applications: Partial<Record<NodeJS.Platform, readonly string[]>> }
}
