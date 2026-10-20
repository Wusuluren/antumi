import path from 'node:path'
import type { AgentLaunch } from '../agent-adapter'

// The primary agent Antumi's readOnly mode runs as. OpenCode's own Plan agent stops edits but
// still runs shell commands, and an agent starts from allowing everything, so this one denies
// edits and asks before anything that runs or reaches outside the project.
export const OPENCODE_READ_ONLY_AGENT = 'antumi-readonly'

// What Antumi adds to the user's OpenCode config for one process, through OPENCODE_CONFIG_CONTENT:
// merged over their own, which stays as it is.
export function opencodeConfig(launch: Pick<AgentLaunch, 'skills'>): string {
  return JSON.stringify({
    agents: {
      [OPENCODE_READ_ONLY_AGENT]: {
        description: 'Read-only: reads files and answers; edits nothing (Antumi)',
        mode: 'primary',
        permissions: [
          { action: 'edit', resource: '*', effect: 'deny' },
          { action: 'shell', resource: '*', effect: 'ask' },
          { action: 'external_directory', resource: '*', effect: 'ask' }
        ]
      }
    },
    // Antumi's skills bundle, in the Agent Skills layout OpenCode scans for SKILL.md.
    ...(launch.skills ? { skills: [path.join(launch.skills.dir, '.agents', 'skills')] } : {})
  })
}
