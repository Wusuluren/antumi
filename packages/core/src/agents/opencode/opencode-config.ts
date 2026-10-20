import path from 'node:path'
import type { AgentLaunch } from '../agent-adapter'

// The primary agents Antumi adds for its own modes. An agent starts from allowing everything
// (OpenCode's Build does no more), and its own rules, last, decide.
// readOnly: OpenCode's Plan stops edits but still runs shell commands, so this one denies edits
// and asks before anything that runs or reaches outside the project.
export const OPENCODE_READ_ONLY_AGENT = 'antumi-readonly'
// acceptEdits: edits and commands in the project go ahead; reaching outside it asks.
export const OPENCODE_AUTO_AGENT = 'antumi-auto'
// bypass: nothing is asked, whatever the user's own rules say.
export const OPENCODE_BYPASS_AGENT = 'antumi-bypass'

const rule = (action: string, effect: 'allow' | 'ask' | 'deny') => ({ action, resource: '*', effect })

// What Antumi adds to the user's OpenCode config for one process, through OPENCODE_CONFIG_CONTENT:
// merged over their own, which stays as it is. The bypass agent exists only where the stage may
// bypass, so it is never there to switch to otherwise.
export function opencodeConfig(launch: Pick<AgentLaunch, 'skills' | 'allowBypass' | 'planOnly' | 'readOnly'>): string {
  const bypass = Boolean(launch.allowBypass) && !launch.planOnly && !launch.readOnly
  return JSON.stringify({
    agents: {
      [OPENCODE_READ_ONLY_AGENT]: {
        description: 'Read-only: reads files and answers; edits nothing (Antumi)',
        mode: 'primary',
        permissions: [rule('edit', 'deny'), rule('shell', 'ask'), rule('external_directory', 'ask')]
      },
      [OPENCODE_AUTO_AGENT]: {
        description: 'Automatic: edits and runs commands in the project; asks before going outside it (Antumi)',
        mode: 'primary',
        permissions: [rule('edit', 'allow'), rule('shell', 'allow'), rule('external_directory', 'ask')]
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
