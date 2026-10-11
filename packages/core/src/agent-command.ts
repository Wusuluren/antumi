import { browserToolName } from '@kando/protocol'

export type AgentCommand = { command: string; args: string[] }

// An MCP server the agent starts over stdio.
export type McpServer = { command: string; args: string[] }

// The browser tools that only read: what the page shows, says in its console, or is waited on.
export const BROWSER_READ_TOOLS: readonly string[] = (['snapshot', 'screenshot', 'scroll', 'wait', 'console', 'tabs'] as const).map(browserToolName)
