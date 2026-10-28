import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { pathFromShellOutput, terminate } from './backend'

describe('pathFromShellOutput', () => {
  it('reads the PATH after the marker, past whatever the rc files printed', () => {
    expect(pathFromShellOutput('Now using node v20.20.0 (npm v11.9.0)\n__antumi_path__/opt/homebrew/bin:/Users/me/.opencode/bin', '/usr/bin')).toBe('/opt/homebrew/bin:/Users/me/.opencode/bin')
  })

  it('keeps the PATH on one line when the shell prints more after it', () => {
    expect(pathFromShellOutput('__antumi_path__/opt/homebrew/bin:/usr/bin\nafterwards\n', '/usr/bin')).toBe('/opt/homebrew/bin:/usr/bin')
  })

  it('takes the last marker, so a startup file echoing one cannot win', () => {
    expect(pathFromShellOutput('__antumi_path__/wrong\n__antumi_path__/right', '/usr/bin')).toBe('/right')
  })

  it('falls back when the shell printed no marker', () => {
    expect(pathFromShellOutput('bash: /Users/me/.zshrc: No such file or directory\n', '/usr/bin:/bin')).toBe('/usr/bin:/bin')
  })
})

describe.skipIf(process.platform === 'win32')('terminate', () => {
  const start = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })

  it('waits until the process it asked to leave is gone', async () => {
    const child = start()
    await new Promise((ready) => child.once('spawn', ready))
    expect(await terminate(child.pid!, 5_000)).toBe(true)
    expect(() => process.kill(child.pid!, 0)).toThrow()
  })

  it('counts a process already gone as gone', async () => {
    const child = start()
    await new Promise((ready) => child.once('spawn', ready))
    child.kill('SIGKILL')
    await new Promise((exit) => child.once('exit', exit))
    expect(await terminate(child.pid!)).toBe(true)
  })
})
