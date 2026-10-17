import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBackgroundRest } from '../background-rest'
import { usePreferences } from '../preferences'
import './ant-motion.css'

export type AntAction = 'walk' | 'carry' | 'place' | 'throw' | 'team' | 'rest'
export type AntDeliveryStatus = 'running' | 'waiting' | 'done'
// `stage` is the preview's roomy box; `inline` crops to the band the ants use, sized by its height;
// `lane` is the one ant of a walker (AntLane), with no ground of its own.
export type AntSize = 'stage' | 'inline' | 'lane'
// What the dock's ant does for the turn: carries while it runs (two of them together while several
// sub-agents work), stands while the user is asked, sets the parcel down when it completed.
export type AntLaneScene = 'carry' | 'team' | 'wait' | 'place'

// Offscreen previews and background windows keep their pose without spending animation frames, as
// does a window left unfocused on another screen (background-rest.ts).
// Switched off in settings, nothing is left behind, not even the room the ant would take.
function AntStage({ className, children, playing = true }: { className: string; children: ReactNode; playing?: boolean }) {
  const enabled = usePreferences((s) => s.antAnimations)
  const resting = useBackgroundRest((s) => s.resting)
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [foreground, setForeground] = useState(true)
  useEffect(() => {
    const update = () => setForeground(!document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false))
    if (ref.current) observer.observe(ref.current)
    return () => {
      document.removeEventListener('visibilitychange', update)
      observer.disconnect()
    }
  }, [enabled])
  if (!enabled) return null
  return (
    <div ref={ref} className={`ant-stage ${className}`} data-paused={!playing || !visible || !foreground || resting || undefined} aria-hidden="true">
      {children}
    </div>
  )
}

// Drawn from its bottom centre, so a pose places it by where it rests.
export function Parcel({ width = 26, height = 18 }: { width?: number; height?: number }) {
  const half = width / 2
  const depth = 4
  return (
    <g className="ant-parcel">
      <path className="ant-parcel-top" d={`M${-half} ${-height}l${depth} ${-depth}h${width}l${-depth} ${depth}z`} />
      <path className="ant-parcel-side" d={`M${half} 0v${-height}l${depth} ${-depth}v${height}z`} />
      <rect className="ant-parcel-front" x={-half} y={-height} width={width} height={height} rx="1.5" />
      <path className="ant-parcel-tape" d={`M-2.5 ${0.6 - height}h5V-.6h-5z M-2 ${-height}l${depth} ${-depth}h4.5l${-depth} ${depth}z`} />
      <path className="ant-parcel-mark" d={`M${half - 9} -6.5h5 M${half - 9} -4h3`} />
    </g>
  )
}

// Faces right with its feet on y=70. Legs step as two tripods (a, b), as real ants do; how far they
// swing, whether the front pair holds something up and where the head looks are CSS properties a
// scene animates, so the same figure walks, stops, lifts and lets go.
function AntFigure({ asleep = false }: { asleep?: boolean }) {
  return (
    <g className="ant-figure">
      <g className="ant-legs-far">
        <path className="ant-leg ant-leg-hf" data-tripod="b" d="M51 45L44 55L40 69l-3 1" />
        <path className="ant-leg ant-leg-mf" data-tripod="a" d="M56 46L60 57L64 69l3 1" />
        <g className="ant-leg ant-leg-front ant-leg-ff" data-tripod="b">
          <path d="M61 45L70 51" />
          <path className="ant-tibia" d="M70 51L76 69l3 1" />
        </g>
      </g>
      <g className="ant-gaster">
        <ellipse className="ant-shell" cx="24" cy="44" rx="17" ry="13" transform="rotate(-14 24 44)" />
        <path className="ant-stripe" d="M18 33.5q-3.5 9 .5 19.5 M27.5 31.5q-3.5 10 .5 20.5" />
        <ellipse className="ant-sheen" cx="19" cy="37.5" rx="7" ry="3" transform="rotate(-24 19 37.5)" />
      </g>
      <circle className="ant-shell" cx="42" cy="45" r="3.8" />
      <ellipse className="ant-shell" cx="53" cy="41" rx="10.5" ry="7.5" transform="rotate(-20 53 41)" />
      <ellipse className="ant-sheen" cx="50.5" cy="37" rx="4" ry="1.7" transform="rotate(-26 50.5 37)" />
      <g className="ant-head">
        <g className="ant-antenna ant-antenna-far">
          <path d="M68 20Q65 13 66 9Q71 4 77 2" />
          <circle cx="77.5" cy="2" r="1.9" />
        </g>
        <ellipse className="ant-shell" cx="72" cy="31" rx="13.5" ry="12.5" transform="rotate(-8 72 31)" />
        <ellipse className="ant-sheen" cx="66.5" cy="23.5" rx="5" ry="2.3" transform="rotate(-20 66.5 23.5)" />
        <path className="ant-smile" d="M80.5 39.5q2.6 1.6 5-.6" />
        <ellipse className="ant-blush" cx="80.5" cy="36.5" rx="3" ry="1.7" />
        {asleep ? (
          <path className="ant-eye-closed" d="M73 29q4 3.5 8 0" />
        ) : (
          <g className="ant-eye">
            <ellipse className="ant-eye-white" cx="77" cy="28" rx="4.8" ry="5.6" />
            <circle className="ant-pupil" cx="78.6" cy="28.8" r="3" />
            <circle className="ant-glint" cx="79.8" cy="27.1" r="1.1" />
          </g>
        )}
        <g className="ant-antenna ant-antenna-near">
          <path d="M74 20Q72 14 73 10Q79 6 85 5" />
          <circle cx="85.5" cy="5" r="1.9" />
        </g>
      </g>
      <g className="ant-legs-near">
        <path className="ant-leg ant-leg-hn" data-tripod="a" d="M48 46L39 55L34 69l-3 1" />
        <path className="ant-leg ant-leg-mn" data-tripod="b" d="M53 47L54 57L57 69l3 1" />
        <g className="ant-leg ant-leg-front ant-leg-fn" data-tripod="a">
          <path d="M58 46L66 52" />
          <path className="ant-tibia" d="M66 52L70 69l3 1" />
        </g>
      </g>
    </g>
  )
}

function Cargo({ className = '', children }: { className?: string; children: ReactNode }) {
  return <g className={`ant-cargo ${className}`}><g className="ant-cargo-sway">{children}</g></g>
}

// Inline, each scene is cropped to the band it plays in, so a small place spends no width on air.
const INLINE_VIEW: Record<AntAction, string> = {
  walk: '50 4 140 96',
  carry: '50 4 140 96',
  team: '22 4 196 96',
  place: '24 4 160 96',
  throw: '0 4 240 96',
  rest: '62 4 128 96'
}

function Sparkle() {
  return <path className="ant-spark" d="M0-4v-6 M8-1l5-4 M-8-1l-5-4" />
}

export function AntMotion({ action, size = 'stage', playing = true }: { action: AntAction; size?: AntSize; playing?: boolean }) {
  return (
    <AntStage className={`ant-motion ant-motion-${action} ant-${size}`} playing={playing}>
      <svg viewBox={size === 'inline' ? INLINE_VIEW[action] : size === 'lane' ? (action === 'team' ? '40 4 180 96' : '40 4 140 96') : '0 0 240 112'} focusable="false">
        <path className="ant-ground" d="M0 96.5h240" />
        <path className="ant-pebbles" d="M38 96.5h2 M131 96.5h3 M196 96.5h2" />
        {action === 'team' ? (
          <g className="ant-performer">
            <g className="ant-mate"><AntFigure /></g>
            <g transform="translate(80 0)"><g className="ant-mate ant-mate-front"><AntFigure /></g></g>
            <Cargo className="ant-cargo-team"><Parcel width={96} height={20} /></Cargo>
          </g>
        ) : action === 'rest' ? (
          <g className="ant-performer">
            <g className="ant-cargo ant-cargo-rest"><Parcel /></g>
            <g className="ant-pose"><AntFigure asleep /></g>
            <g className="ant-snore"><text x="92" y="14">z</text><text x="100" y="5">z</text></g>
          </g>
        ) : (
          <g className="ant-performer">
            <g className="ant-pose"><AntFigure /></g>
            {action !== 'walk' && <Cargo><Parcel /></Cargo>}
            {action === 'place' && (
              <>
                <circle className="ant-puff ant-puff-back" cx="92" cy="68" r="4" />
                <circle className="ant-puff ant-puff-front" cx="128" cy="68" r="4" />
                <g transform="translate(110 40)"><Sparkle /></g>
              </>
            )}
          </g>
        )}
        {action === 'throw' && (
          <g className="ant-bin">
            <path className="ant-bin-body" d="M187 76L191 96H217L221 76Z" />
            <path className="ant-bin-ribs" d="M196 81v11 M204 81v11 M212 81v11" />
            <path className="ant-bin-rim" d="M185 76H223" />
          </g>
        )}
      </svg>
    </AntStage>
  )
}

// Mount on a card's top edge. The parcel goes down through the slot and out of sight, so it never
// crosses the card's text.
export function AntDelivery({ status, playing = true }: { status: AntDeliveryStatus; playing?: boolean }) {
  return (
    <AntStage className={`ant-delivery ant-delivery-${status}`} playing={playing}>
      <svg viewBox="0 0 220 56" focusable="false">
        <path className="ant-slot" d="M175 55.5h22" />
        <g className="ant-performer">
          <g className="ant-pose"><AntFigure /></g>
          {status === 'running' && <Cargo><Parcel /></Cargo>}
        </g>
        {status === 'done' && <g transform="translate(186 40)"><Sparkle /></g>}
      </svg>
    </AntStage>
  )
}
