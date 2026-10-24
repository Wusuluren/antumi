import { AGENT_KINDS, type AgentKind, type Environment, type ModelProvider } from '@antumi/protocol'
import type { GuideStep } from './guide-page'
import { t } from './i18n'
import { agentLabel } from './labels'

type Situation = { environment: Environment | null; disabled: readonly AgentKind[]; providers: readonly Pick<ModelProvider, 'name'>[]; locale: string }

// Chinese lists names with 、 as the app's own text does; Intl's 和 runs into Latin names.
function list(names: readonly string[], locale: string): string {
  return locale.startsWith('zh') ? names.join('、') : new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)
}

// What already stands for a step of the guide on this machine, or null while it still has to be
// done, or cannot be told. An agent counts as ready only once it says it is signed in: OpenCode,
// Pi and DeepSeek Harness do not say, and still need step 2 or their own setup.
export function guideStepDone(step: GuideStep, { environment, disabled, providers, locale }: Situation): string | null {
  if (step === 'agents') {
    const ready = AGENT_KINDS.filter((kind) => !disabled.includes(kind) && environment?.checks.some((check) => check.tool === kind && check.status === 'ok' && check.signedIn === true))
    return ready.length > 0 ? t('GuideView.agentsReady', { agents: list(ready.map(agentLabel), locale) }) : null
  }
  return providers.length > 0 ? t('GuideView.providersAdded', { providers: list(providers.map((provider) => provider.name), locale) }) : null
}
