import { z } from 'zod'

export const PetId = z.string().max(64).regex(/^[a-z][a-z0-9-]*$/)
export const PetVersion = z.string().max(32).regex(/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/)
export function comparePetVersions(left: string, right: string): number {
  const a = left.split('.').map(Number), b = right.split('.').map(Number)
  for (const index of [0, 1, 2]) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference
  }
  return 0
}
export const PetPose = z.enum(['idle', 'waiting', 'running', 'review', 'failed', 'waving', 'jumping', 'sit', 'nap', 'hang', 'peek', 'sprint'])
export type PetPose = z.infer<typeof PetPose>
const Coordinate = z.number().min(0).max(256)
const Point = z.object({ x: Coordinate, y: Coordinate })
const Tone = z.tuple([z.number().min(-255).max(255), z.number().min(-255).max(255), z.number().min(-255).max(255)])
export const PetEye = z.object({ x: Coordinate, y: Coordinate, rx: z.number().positive().max(64), ry: z.number().positive().max(64), angle: z.number().min(-180).max(180) })
export type PetEye = z.infer<typeof PetEye>
const Face = z.object({ neck: Point, eyes: z.array(PetEye).min(1).max(2).optional(), tones: z.array(Tone).max(2).optional() })
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const PetRig = z.object({
  layout: z.object({
    head: z.object({ left: Coordinate, top: Coordinate, right: Coordinate, bottom: Coordinate }),
    idleNeck: Point, idleFloor: Coordinate, walkFloor: Coordinate,
    walkNecks: z.array(Point).length(12)
  }).refine((v) => v.idleFloor > v.idleNeck.y && v.walkNecks.every((p) => p.y < v.walkFloor) && v.head.left < v.head.right && v.head.top < v.head.bottom),
  faces: z.object({ idle: Face, waiting: Face.optional(), running: Face.optional(), review: Face.optional(), failed: Face.optional(), waving: Face.optional(), jumping: Face.optional(), sit: Face.optional(), nap: Face.optional(), hang: Face.optional(), peek: Face.optional(), sprint: Face.optional() }),
  eyes: z.object({ model: z.enum(['textured', 'stitched', 'ink']), white: Color, ink: Color, texture: z.object({ column: z.number().int().min(0).max(2), x: Coordinate, y: Coordinate }) }),
  armEdge: z.number().min(0).max(100)
})
export type PetRig = z.infer<typeof PetRig>
const Localized = z.object({ zh: z.string().min(1).max(160), en: z.string().min(1).max(160) })
export const PetMetadata = z.object({ id: PetId, version: PetVersion, name: Localized, description: Localized })
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Asset = z.object({ size: z.number().int().positive().max(2 * 1024 * 1024), sha256: Digest })
export const PET_FILES = ['poses.webp', 'walk.webp', 'face.webp'] as const
export const PetManifest = PetMetadata.extend({ format: z.literal(1), rig: PetRig, assets: z.object({ 'poses.webp': Asset, 'walk.webp': Asset, 'face.webp': Asset }) })
export type PetManifest = z.infer<typeof PetManifest>
export const PetCatalogEntry = PetMetadata.extend({
  size: z.number().int().positive().max(4 * 1024 * 1024), sha256: Digest,
  url: z.string().url().startsWith('https://'),
  preview: z.string().max(48_000).regex(/^data:image\/(?:webp|png);base64,[A-Za-z0-9+/]+=*$/)
})
export type PetCatalogEntry = z.infer<typeof PetCatalogEntry>
export const PetCatalog = z.object({ format: z.literal(1), pets: z.array(PetCatalogEntry).max(100) }).refine((v) => new Set(v.pets.map((p) => p.id)).size === v.pets.length)
export type PetCatalog = z.infer<typeof PetCatalog>
export const PetLibraryState = z.object({
  catalog: z.array(PetCatalogEntry), installed: z.array(PetMetadata),
  downloads: z.array(z.object({ id: PetId, received: z.number().nonnegative(), total: z.number().nonnegative() }))
})
export type PetLibraryState = z.infer<typeof PetLibraryState>
export const PetAssetData = z.string().max(3 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+=*$/)
export const PetResourceData = z.object({ manifest: PetManifest, assets: z.object({ 'poses.webp': PetAssetData, 'walk.webp': PetAssetData, 'face.webp': PetAssetData }) })
export type PetResourceData = z.infer<typeof PetResourceData>
