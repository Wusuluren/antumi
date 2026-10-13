import type { AgentCliInstallation, AgentKind, ChatCatalog, ChatPermissionMode, EnvironmentCheck, KnowledgeBase } from '@kando/protocol'
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
  // Works read-only in these folders, in the mode it was given: their files never editable, no bypass.
  readOnly?: { dirs: readonly string[] }
  // Files the agent may read without asking, such as a task's images.
  readable?: readonly string[]
  // Resume only through this message (its uuid), as a new session: a fork of the one resumed.
  forkAt?: string | null
  // Kando's own tools for the agent (showing a file it wrote); none for an older setup.
  mcp?: McpServer
  // Whether it may drive the user's own browser, for an agent that can; unset leaves its own default.
  userBrowser?: boolean
  // The user's Obsidian vault: its own folder, never a project, so never fenced or given a
  // worktree. write is already false where the stage may not edit.
  knowledgeBase?: KnowledgeBase
}

export type AgentDetection = Omit<EnvironmentCheck, 'tool'>

// A one-off request: the prompt on stdin or in argv, and the answer on stdout or in a file.
export type QuickCommand = { command: string; args: string[]; stdin: string | null; output: 'stdout' | 'file' }

// How long an agent is given to obey a cancel, then a TERM, before it is stopped harder.
export type CancelGrace = { cancelGraceMs: number; termGraceMs: number }

// The stage an adapter's launch steps act for.
export type AgentStage = { sessionsRoot: string; conversationId: string; stageId: string; planOnly: boolean }

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
  // Steps around starting its process, for an agent its command line alone does not set up.
  readonly launch?: {
    // Kando's MCP server as this agent is to start it.
    mcp(server: McpServer, stage: AgentStage): McpServer
    // Before the process starts, given the server it gets: the executable to run in place of the
    // command's, once that is known to be able to run.
    prepare(stage: AgentStage, mcp: McpServer | undefined): Promise<{ command?: string }>
    // After its handshake, before its first message.
    ready(stage: AgentStage): Promise<void>
  }
  // How its turns are handled beyond what its driver does.
  readonly turns?: {
    // Sends and retries wait for one another: its process cannot take them interleaved.
    serialized?: boolean
    // It may not obey a cancel: after one, its process is stopped, by TERM and then by force,
    // each after its grace.
    stopAfterCancel?: CancelGrace
    // A prompt with no event for this long is stopped, with a notice offering to retry it. Its
    // driver tells which frames start and belong to a turn (ChatDriver.turnSignal).
    firstFrameTimeoutMs?: number
    // A failed or stalled turn can be sent again from a fresh process.
    retryByRestart?: boolean
    // The message that goes with a denial reaches it only as a message of its own.
    denialAsMessage?: boolean
  }
  // Its model and effort are remembered as its state reports them after a switch, not as asked.
  readonly optionsFromState?: boolean
  // A one-off request with no tools and nothing kept, for a small job such as translating a reply
  // (on its descriptor's quickModels): the command, `outputFile` where its answer goes to a file.
  readonly quick?: {
    command(prompt: string, model: string | null, outputFile: string): QuickCommand | Promise<QuickCommand>
  }
}
