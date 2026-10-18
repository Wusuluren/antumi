import { browserToolName } from '@antumi/protocol'

export type AgentCommand = { command: string; args: string[] }

// An MCP server the agent starts over stdio.
// env is added to what the agent starts the server with.
export type McpServer = { command: string; args: string[]; env?: Record<string, string> }

// One of the user's MCP servers as an agent is given it: started through Antumi's launcher, which
// adds what is secret, or reached at its address where nothing is.
export type AgentMcpServer = { name: string } & ({ type: 'stdio'; command: string; args: string[]; env?: Record<string, string> } | { type: 'http'; url: string })

// The browser tools that only read: what the page shows, says in its console, or is waited on.
export const BROWSER_READ_TOOLS: readonly string[] = (['snapshot', 'screenshot', 'scroll', 'wait', 'console', 'tabs'] as const).map(browserToolName)
