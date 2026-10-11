import { describe, expect, it } from 'vitest'
import { AGENT_KINDS, agentDescriptor } from '@kando/protocol'
import { adapterOf } from '.'

describe('agent registry', () => {
  it.each(AGENT_KINDS)('describes %s to clients as its adapter runs it', (kind) => {
    const adapter = adapterOf(kind)
    const descriptor = agentDescriptor(kind)
    expect(adapter.kind).toBe(kind)
    // A client names exactly the modes core lets the agent start in, and offers only those.
    expect(Object.keys(descriptor.modes).sort()).toEqual([...adapter.permissionModes].sort())
    expect(descriptor.startModes.every((mode) => adapter.permissionModes.includes(mode))).toBe(true)
    expect(adapter.permissionModes.includes(descriptor.defaultStartMode)).toBe(true)
    expect(adapter.permissionModes.includes('bypass')).toBe(descriptor.capabilities.bypass)
    expect(adapter.permissionModes.includes('auto')).toBe(descriptor.capabilities.autoMode)
    if (adapter.fallbackMode) expect(adapter.permissionModes).toContain(adapter.fallbackMode)
  })
})
