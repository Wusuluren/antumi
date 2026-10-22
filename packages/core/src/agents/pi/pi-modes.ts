import type { ChatPermissionMode } from '@antumi/protocol'

// Antumi's modes for Pi, which has none of its own: ask and bypass are Pi as it comes; the rest are
// held by Antumi's extension, which refuses edits outside the project in acceptEdits, and anything
// that would change something in plan and readOnly.
export const PI_MODES = ['ask', 'acceptEdits', 'plan', 'readOnly', 'bypass'] as const satisfies readonly ChatPermissionMode[]
export type PiMode = (typeof PI_MODES)[number]
export const PI_FENCED_MODES: readonly PiMode[] = ['plan', 'readOnly']

export function isPiMode(value: string): value is PiMode {
  return PI_MODES.some((mode) => mode === value)
}

// The slash command Antumi's extension adds for switching mode: Pi answers it without the model.
export const PI_MODE_COMMAND = 'antumi-mode'
