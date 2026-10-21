import path from 'node:path'
import { RESERVED_MCP_SERVER_NAME } from '@antumi/protocol'
import type { AgentLaunch } from '../agent-adapter'

// The primary agents Antumi adds for its own modes. An agent starts from allowing everything
// (OpenCode's Build does no more), and its own rules, last, decide.
// readOnly: OpenCode's Plan stops edits but still runs shell commands, so this one denies edits
// and asks before anything that runs or reaches outside the project.
export const OPENCODE_READ_ONLY_AGENT = 'antumi-readonly'
// acceptEdits: edits and commands in the project go ahead; reaching outside it, or into a .env
// file, is refused rather than asked. OpenCode ends the whole turn when a request is rejected, but
// takes a rule's refusal as the tool's error and goes on: so a run nobody watches, in this mode,
// is never stopped by a request.
export const OPENCODE_AUTO_AGENT = 'antumi-auto'
// bypass: nothing is asked, whatever the user's own rules say.
export const OPENCODE_BYPASS_AGENT = 'antumi-bypass'

const rule = (action: string, effect: 'allow' | 'ask' | 'deny', resource = '*') => ({ action, resource, effect })

// What Antumi adds to the user's OpenCode config for one process, through OPENCODE_CONFIG_CONTENT:
// merged over their own, which stays as it is. The bypass agent exists only where the stage may
// bypass, so it is never there to switch to otherwise.
export function opencodeConfig(launch: Pick<AgentLaunch, 'skills' | 'allowBypass' | 'planOnly' | 'readOnly' | 'mcp'>): string {
  const bypass = Boolean(launch.allowBypass) && !launch.planOnly && !launch.readOnly
  const { mcp } = launch
  return JSON.stringify({
    // Antumi's own server, here rather than in session/new, which cannot turn off OpenCode's Code
    // Mode: under it the model calls every tool of a server from one `execute` script, and Antumi
    // could no longer tell its own tools (a preview, a screenshot) in the chat. The server comes
    // as the adapter starts it (launch.mcp): reporting when it is loaded, read-only where need be.
    // OpenCode 2's shape, servers under `servers`: a server named at the top is read as 1's, which
    // drops codemode.
    ...(mcp ? {
      mcp: {
        servers: {
          [RESERVED_MCP_SERVER_NAME]: {
            type: 'local',
            command: [mcp.command, ...mcp.args],
            environment: mcp.env ?? {},
            codemode: false
          }
        }
      }
    } : {}),
    agents: {
      [OPENCODE_READ_ONLY_AGENT]: {
        description: 'Read-only: reads files and answers; edits nothing (Antumi)',
        mode: 'primary',
        permissions: [rule('edit', 'deny'), rule('shell', 'ask'), rule('external_directory', 'ask')]
      },
      [OPENCODE_AUTO_AGENT]: {
        description: 'Automatic: edits and runs commands in the project; never reaches outside it (Antumi)',
        mode: 'primary',
        permissions: [
          rule('edit', 'allow'), rule('shell', 'allow'), rule('external_directory', 'deny'),
          rule('read', 'deny', '*.env'), rule('read', 'deny', '*.env.*'), rule('read', 'allow', '*.env.example')
        ]
      },
      ...(bypass ? {
        [OPENCODE_BYPASS_AGENT]: {
          description: 'Allow everything: nothing is asked (Antumi)',
          mode: 'primary',
          permissions: [rule('*', 'allow')]
        }
      } : {})
    },
    // Antumi's skills bundle, in the Agent Skills layout OpenCode scans for SKILL.md.
    ...(launch.skills ? { skills: [path.join(launch.skills.dir, '.agents', 'skills')] } : {})
  })
}
