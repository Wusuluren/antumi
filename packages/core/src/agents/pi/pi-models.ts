import { z } from 'zod'
import type { ChatModel } from '@antumi/protocol'

// A model as Pi lists it (get_available_models, get_state, set_model): its provider and id name it.
export const PiModel = z.looseObject({
  id: z.string(),
  provider: z.string(),
  name: z.string().optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  contextWindow: z.number().optional(),
  // A level mapped to null is one the model lacks; xhigh and max only where the map names them.
  thinkingLevelMap: z.record(z.string(), z.string().nullable()).optional()
})
export type PiModel = z.infer<typeof PiModel>

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const OPTIONAL_LEVELS: ReadonlySet<string> = new Set(['xhigh', 'max'])

// Antumi names a Pi model provider/id, the selector Pi itself takes.
export const piModelId = (model: Pick<PiModel, 'provider' | 'id'>) => `${model.provider}/${model.id}`

export function parsePiModelId(value: string): { provider: string; modelId: string } | null {
  const slash = value.indexOf('/')
  return slash > 0 && slash < value.length - 1 ? { provider: value.slice(0, slash), modelId: value.slice(slash + 1) } : null
}

// The thinking levels a model takes, as Pi decides them: none for a model that does not reason.
export function piEfforts(model: PiModel): string[] {
  if (!model.reasoning) return []
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    return mapped !== null && (!OPTIONAL_LEVELS.has(level) || mapped !== undefined)
  })
}

export function piModels(models: readonly PiModel[], current: string | null): ChatModel[] {
  return models.map((model) => {
    const id = piModelId(model)
    return { id, label: model.name || id, description: model.provider, efforts: piEfforts(model), isDefault: id === current }
  })
}
