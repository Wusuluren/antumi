import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparePetVersions, PetCatalog, PetManifest, type PetCatalogEntry } from '@antumi/protocol'
import rawManifest from '../../desktop/src/renderer/src/assets/pets/clay-manifest.json'
import catalog from '../../protocol/src/pet-catalog.json'
import { PetLibrary } from './pet-library'
import { petDigest, unpackPet, webpSize } from './pet-package'

function archive(entries: [string, Buffer][]): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = []; let offset = 0
  for (const [name, bytes] of entries) {
    const filename = Buffer.from(name), header = Buffer.alloc(30), directory = Buffer.alloc(46)
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4)
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26)
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6)
    directory.writeUInt32LE(bytes.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42)
    parts.push(header, filename, bytes); central.push(directory, filename); offset += header.length + filename.length + bytes.length
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, directory, end])
}

describe('downloadable pet packages', () => {
  let root: string, library: PetLibrary, entry: PetCatalogEntry, bytes: Buffer, files: [string, Buffer][]
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>
  const changes: unknown[] = []
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'antumi-pets-'))
    const manifest = PetManifest.parse({ ...rawManifest, id: 'moss' })
    files = [['manifest.json', Buffer.from(JSON.stringify(manifest))]]
    for (const [name, source] of [['poses.webp', 'clay.webp'], ['walk.webp', 'clay-walk.webp'], ['face.webp', 'face-textures.webp']] as const) files.push([name, await readFile(new URL(`../../desktop/src/renderer/src/assets/pets/${source}`, import.meta.url))])
    bytes = archive(files)
    entry = { ...manifest, size: bytes.length, sha256: petDigest(bytes), url: 'https://github.com/flyhero/antumi-pets/releases/download/pets-v1.0.0/moss-1.0.0.zip', preview: catalog.pets[0]?.preview ?? '' }
    fetcher = vi.fn<typeof fetch>(async (url) => String(url).endsWith('catalog.json') ? new Response(JSON.stringify({ format: 1, pets: [entry] })) : new Response(new Uint8Array(bytes)))
    changes.length = 0
    library = new PetLibrary(root, { fetch: fetcher, changed: (state) => changes.push(state) }); await library.load(); await library.list(true); fetcher.mockClear()
  })
  afterEach(async () => { await library.close(); await rm(root, { recursive: true, force: true }) })

  it('only downloads when selected, persists the install and restores it offline', async () => {
    expect(fetcher).not.toHaveBeenCalled()
    expect(library.state().installed).toEqual([])
    const result = await library.install('moss')
    expect(result.downloads).toEqual([])
    expect(result.installed.map((p) => p.id)).toEqual(['moss'])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect((await library.read('moss')).assets['walk.webp']).toBe(files[2]?.[1].toString('base64'))
    await library.install('moss'); expect(fetcher).toHaveBeenCalledTimes(1)
    const offline = new PetLibrary(root, { fetch: vi.fn().mockRejectedValue(new Error('offline')) }); await offline.load()
    expect((await offline.list(true)).installed.map((p) => p.id)).toEqual(['moss'])
    expect((await offline.read('moss')).manifest.id).toBe('moss')
    await offline.close()
  })

  it('rejects changed packages and preserves the previously installed pet', async () => {
    await library.install('moss')
    const newer = { ...entry, version: '1.0.1' }
    fetcher.mockImplementation(async (url) => String(url).endsWith('catalog.json') ? new Response(JSON.stringify({ format: 1, pets: [newer] })) : new Response(new Uint8Array(bytes).fill(1)))
    await library.list(true)
    await expect(library.install('moss')).rejects.toMatchObject({ reason: 'pet-download-failed' })
    expect((await library.read('moss')).manifest.version).toBe('1.0.0')
    expect(library.state().downloads).toEqual([])
  })

  it('cancels a pending download and allows retry without a partial install', async () => {
    fetcher.mockImplementationOnce(async (_url, options) => {
      const signal = options?.signal
      return new Response(new ReadableStream({ start(controller) { signal?.addEventListener('abort', () => controller.error(new Error('cancelled')), { once: true }) } }))
    })
    const first = library.install('moss'), same = library.install('moss')
    expect(first).toBe(same)
    library.cancel('moss')
    await expect(first).rejects.toMatchObject({ reason: 'pet-cancelled' })
    expect(library.state().installed).toEqual([])
    expect((await library.install('moss')).installed).toHaveLength(1)
  })

  it('removes downloaded pets and protects the built-in pet', async () => {
    await library.install('moss'); expect((await library.remove('moss')).installed).toEqual([])
    await expect(library.read('moss')).rejects.toMatchObject({ reason: 'pet-not-installed' })
    await expect(library.remove('clay')).rejects.toMatchObject({ reason: 'pet-builtin' })
    await expect(library.install('clay')).rejects.toMatchObject({ reason: 'pet-builtin' })
  })

  it('rejects extra code, duplicate entries, traversal and missing images', async () => {
    const cases: [string, Buffer][][] = [[...files, ['main.js', Buffer.from('alert(1)')]], [...files, files[1] ?? ['poses.webp', Buffer.alloc(0)]], [...files, ['../outside', Buffer.alloc(0)]], files.slice(0, 3)]
    for (const entries of cases) {
      const data = archive(entries)
      await expect(unpackPet(data, { ...entry, size: data.length, sha256: petDigest(data) })).rejects.toThrow()
    }
  })

  it('validates metadata and image dimensions before decoding', async () => {
    expect(() => PetManifest.parse({ ...rawManifest, id: '../outside' })).toThrow()
    expect(() => PetManifest.parse({ ...rawManifest, rig: { ...rawManifest.rig, layout: { ...rawManifest.rig.layout, walkFloor: 1 } } })).toThrow()
    expect(() => PetCatalog.parse({ format: 1, pets: [entry, entry] })).toThrow()
    expect(webpSize(files[1]?.[1] ?? Buffer.alloc(0))).toEqual({ width: 1024, height: 1024 })
    expect(() => webpSize(Buffer.alloc(30))).toThrow()
    await expect(unpackPet(bytes, { ...entry, id: 'zip' })).rejects.toThrow('identity')
  })

  it('detects changed local assets and ignores corrupt registries safely', async () => {
    await library.install('moss')
    await writeFile(path.join(root, 'moss/1.0.0/walk.webp'), Buffer.alloc(30))
    await expect(library.read('moss')).rejects.toThrow()
    await writeFile(path.join(root, 'installed.json'), '{broken')
    const other = new PetLibrary(root); await other.load(); expect(other.state().installed).toEqual([])
    await other.close()
  })

  it('retains the catalog if a refresh points outside the resource repository', async () => {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ format: 1, pets: [{ ...entry, url: 'https://example.com/pet.zip' }] })))
    expect((await library.list(true)).catalog[0]?.url).toBe(entry.url)
  })

  it('rejects oversized preview dimensions before the renderer can decode them', async () => {
    const image = Buffer.from(entry.preview.split(',')[1] ?? '', 'base64')
    image.writeUInt32BE(32_768, 16)
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ format: 1, pets: [{ ...entry, id: 'huge', preview: `data:image/png;base64,${image.toString('base64')}` }] })))
    expect((await library.list(true)).catalog.map((p) => p.id)).toEqual(['moss'])
  })

  it('bounds incoming download bytes and leaves nothing installed on failure', async () => {
    fetcher.mockResolvedValueOnce(new Response('oversized', { headers: { 'content-length': String(entry.size + 1) } }))
    await expect(library.install('moss')).rejects.toMatchObject({ reason: 'pet-download-failed' })
    expect(library.state().installed).toEqual([])
    expect(library.state().downloads).toEqual([])
  })

  it('never downgrades an installed pet when a stale catalog is restored', async () => {
    const newerFiles: [string, Buffer][] = [['manifest.json', Buffer.from(JSON.stringify({ ...rawManifest, id: 'moss', version: '1.0.1' }))], ...files.slice(1)]
    const newerBytes = archive(newerFiles), newer = { ...entry, version: '1.0.1', size: newerBytes.length, sha256: petDigest(newerBytes) }
    fetcher.mockImplementation(async (url) => String(url).endsWith('catalog.json') ? new Response(JSON.stringify({ format: 1, pets: [newer] })) : new Response(new Uint8Array(newerBytes)))
    await library.list(true); await library.install('moss')
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ format: 1, pets: [entry] })))
    await library.list(true); fetcher.mockClear()
    await library.install('moss')
    expect(fetcher).not.toHaveBeenCalled()
    expect((await library.read('moss')).manifest.version).toBe('1.0.1')
    expect(comparePetVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
  })
})
