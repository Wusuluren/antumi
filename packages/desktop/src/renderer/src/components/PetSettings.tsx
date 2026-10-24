import { useEffect, useId, useRef, useState } from 'react'
import { comparePetVersions, RpcError } from '@antumi/protocol'
import { getLocale, t, useLocale } from '../i18n'
import { setPreference, usePreferences } from '../preferences'
import { useReducedMotion } from '../reduced-motion'
import { BUILTIN_PET, cancelPet, installPet, refreshPets, removePet, usePetLibrary, usePetLibraryStore } from '../pet-library'
import { usePetSkin } from './PetSprite'
import type { PetPose } from './pet-skin'
import { Segmented, SettingsGroup, SettingsRow } from './SettingsControls'
import './pet-settings.css'

export function petName(id: string): string {
  const state = usePetLibraryStore.getState().state
  const entry = id === 'clay' ? BUILTIN_PET.manifest : state.catalog.find((p) => p.id === id) ?? state.installed.find((p) => p.id === id)
  return entry?.name[getLocale() === 'zh-CN' ? 'zh' : 'en'] ?? id
}

export function PetStylePicker({ labelId }: { labelId: string }) {
  const selected = usePreferences((s) => s.petStyle), locale = useLocale((s) => s.locale)
  const { state, ready, supported } = usePetLibrary()
  const [problem, setProblem] = useState<string | null>(null)
  const intent = useRef(0)
  useEffect(() => { if (supported) void refreshPets().catch(() => {}) }, [supported])
  const entries = [BUILTIN_PET.manifest, ...state.catalog, ...state.installed.filter((p) => p.id !== 'clay' && !state.catalog.some((c) => c.id === p.id))]
  const choose = async (id: string, update = false) => {
    const request = ++intent.current; setProblem(null)
    try {
      if (id !== 'clay' && (update || !state.installed.some((p) => p.id === id))) await installPet(id)
      if (request === intent.current) setPreference('petStyle', id)
    } catch (error) {
      if (error instanceof RpcError && error.reason === 'pet-cancelled') return
      // Why it failed (which host, through which proxy, timed out or refused) is the part to act on.
      setProblem(error instanceof RpcError && error.reason === 'pet-download-failed' && error.message ? t('Pet.downloadFailedBecause', { reason: error.message }) : t('Pet.downloadFailed'))
    }
  }
  const remove = async (id: string) => {
    intent.current++; setProblem(null)
    try { await removePet(id); if (usePreferences.getState().petStyle === id) setPreference('petStyle', 'clay') }
    catch { setProblem(t('Pet.removeFailed')) }
  }
  return <>
    <div className="pet-style-picker" role="radiogroup" aria-labelledby={labelId}>
      {entries.map((entry) => {
        const builtin = entry.id === 'clay', installed = builtin || state.installed.some((p) => p.id === entry.id)
        const download = state.downloads.find((d) => d.id === entry.id)
        const catalog = state.catalog.find((p) => p.id === entry.id)
        const installedVersion = state.installed.find((p) => p.id === entry.id)?.version
        const update = !!catalog && !!installedVersion && comparePetVersions(catalog.version, installedVersion) > 0
        return <div className="pet-style-card" key={entry.id}>
          <button type="button" role="radio" aria-checked={selected === entry.id} disabled={!!download || (!builtin && (!supported || !ready))} className="pet-style-option" onClick={() => void choose(entry.id)}>
            {builtin ? <span className="pet-style-art pet-style-builtin" style={{ backgroundImage: `url(${BUILTIN_PET.atlas})` }} /> : catalog ? <img className="pet-style-art" src={catalog.preview} alt="" /> : <span className="pet-style-art" />}
            <span className="pet-style-name">{entry.name[locale === 'zh-CN' ? 'zh' : 'en']}<span className="pet-style-check" aria-hidden="true">{selected === entry.id ? '✓' : ''}</span></span>
            <span className="pet-style-description">{entry.description[locale === 'zh-CN' ? 'zh' : 'en']}</span>
            <span className="pet-style-status">{builtin ? t('Pet.builtin') : download ? t('Pet.downloading', { percent: Math.floor(download.received / Math.max(1, download.total) * 100) }) : installed ? t('Pet.installed') : t('Pet.downloadAndUse', { size: Math.ceil((catalog?.size ?? 0) / 1024) })}</span>
          </button>
          {download && <div className="pet-style-actions"><progress value={download.received} max={download.total || 1} aria-label={t('Pet.downloadProgress')} /><button type="button" className="button ghost" onClick={() => { intent.current++; void cancelPet(entry.id).catch(() => setProblem(t('Pet.downloadFailed'))) }}>{t('Pet.cancelDownload')}</button></div>}
          {!builtin && installed && !download && <div className="pet-style-actions">{update && <button type="button" className="button ghost" onClick={() => void choose(entry.id, true)}>{t('Pet.updateAndUse')}</button>}<button type="button" className="button ghost" onClick={() => void remove(entry.id)}>{t('Pet.remove')}</button></div>}
        </div>
      })}
    </div>
    {!supported && <p className="settings-note">{t('Pet.downloadUnavailable')}</p>}
    {problem && <p className="pet-style-error" role="alert">{problem}</p>}
  </>
}

export function PetSettings() {
  const style = usePreferences((s) => s.petStyle)
  const size = usePreferences((s) => s.petSize)
  const level = usePreferences((s) => s.petLevel)
  const reduced = useReducedMotion()
  const skin = usePetSkin(style, size)
  const [pose, setPose] = useState<PetPose>('sit')
  const styleId = useId()
  const poseId = useId()
  const poses = [
    { value: 'idle', label: t('Pet.idle') }, { value: 'sit', label: t('Pet.sit') },
    { value: 'nap', label: t('Pet.nap') }, { value: 'sprint', label: t('Pet.sprint') }
  ] as const
  return (
    <>
      <section className="pet-style-section" aria-labelledby={styleId}>
        <h3 id={styleId} className="settings-subsection-title">{t('Pet.style')}</h3>
        <PetStylePicker labelId={styleId} />
      </section>
      <SettingsGroup>
        <SettingsRow label={t('Pet.activity')} description={t('Pet.activityDescription')} control={(labelId) => (
          <Segmented labelId={labelId} value={level} options={[
            { value: 'off', label: t('Pet.off') }, { value: 'quiet', label: t('Pet.quiet') },
            { value: 'medium', label: t('Pet.medium') }, { value: 'lively', label: t('Pet.lively') }
          ]} onChange={(value) => setPreference('petLevel', value)} />
        )} />
        <SettingsRow label={t('Pet.size')} description={t('Pet.sizeDescription')} control={(labelId) => (
          <span className="pet-size-control">
            <input type="range" min={80} max={192} step={8} value={size} aria-labelledby={labelId} onChange={(e) => setPreference('petSize', Number(e.target.value))} />
            <output>{size} px</output>
          </span>
        )} />
      </SettingsGroup>
      <section className="pet-preview-section" aria-labelledby={poseId}>
        <h3 id={poseId} className="settings-subsection-title">{t('Pet.preview')}</h3>
        <p className="settings-note">{t('Pet.previewDescription')}</p>
        <div className="pet-settings-preview">
          <div key={`${style}:${pose}`} className="pet-settings-preview-art" style={{ width: size, height: size }}>{skin.render({ pose, walking: pose === 'sprint', lookX: 0, lookY: 0, reduced })}</div>
          <span className="pet-preview-ledge" style={{ top: `calc(50% + ${size / 2}px)` }} />
        </div>
        <div className="pet-preview-poses"><Segmented labelId={poseId} value={pose} options={poses} onChange={setPose} /></div>
      </section>
    </>
  )
}
