import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import type { ShellExecSpec, ShellExecution } from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { DSH_CONFIG_ENV, DSH_PROVIDER_KEY_ENV } from '@antumi/protocol'
import { operationPolicy, runtimeConfig } from './policy'

export default class AntumiPowerShell extends SandboxPwshExecutor {
  private readonly antumi = runtimeConfig()

  override execute(spec: ShellExecSpec): Promise<ShellExecution> {
    const policy = operationPolicy(spec.sandboxPolicy ?? this.ctx.sandboxPolicy.resolve(), spec.workdir, this.antumi, true)
    return super.execute({ ...spec, sandboxPolicy: policy, env: { ...spec.env, [DSH_PROVIDER_KEY_ENV]: '', [DSH_CONFIG_ENV]: '' } })
  }
}
