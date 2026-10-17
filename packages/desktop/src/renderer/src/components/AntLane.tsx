import { useEffect, useRef, useState } from 'react'
import { useBackgroundRest } from '../background-rest'
import { usePreferences } from '../preferences'
import { AntMotion, Parcel, type AntLaneScene } from './AntMotion'

// The lane in its own pixels: the ant is drawn 22px tall from the 96-unit band its figure lives in.
const UNIT = 22 / 96
const BOX_W = 26 * UNIT
const BOX_H = 18 * UNIT
const BOX_DEPTH = 4 * UNIT
// The ground, above the strip's bottom edge; the ant, the supply and the stacks stand on it.
const GROUND = 4
// How far above the ground the boxes are drawn: a full stack and a toss over it.
const SKY = 56
const ROWS = 6
const STACKS = 4
const STACK_GAP = 4
const EDGE = 4
const SUPPLY_RIGHT = BOX_W + BOX_DEPTH + 2
const SPEED = 30
const TURN_MS = 320
const TOSS_MS = 520
const PICKUP_MS = 380
// A walk that ends stands still this long before the ant goes: the turn's end and its outcome
// (whether to set the parcel down) can arrive a render or two apart, and the parcel must go down
// where the ant stopped, not back at the start.
const LINGER_MS = 800

type Crew = 'carry' | 'team'
// Where a crew stands in its walker, from the walker's left edge while it faces right: its front
// and its hands (the parcel's bottom centre), from the figure's units less the view's left edge (40).
const CREW: Record<Crew, { front: number; hands: number; parcel: number }> = {
  carry: { front: 52 * UNIT, hands: 18 * UNIT, parcel: 26 },
  team: { front: 132 * UNIT, hands: 66 * UNIT, parcel: 52 }
}
// The walker turns about the lone ant's middle, so turning round never moves it along the lane.
const PIVOT = 29.5 * UNIT
const HANDS_HIGH = (96.5 - 19.5) * UNIT

type Face = 1 | -1
// A box on a stack: two small ones side by side make a tier, a long one (the pair's) a tier alone.
type Slot = { stack: number; row: number; place: 'left' | 'right' | 'long' }

const along = (offset: number, face: Face) => (face === 1 ? offset : 2 * PIVOT - offset)
const stackLeft = (stack: number, width: number) => width - EDGE - 2 * BOX_W - BOX_DEPTH - stack * (2 * BOX_W + BOX_DEPTH + STACK_GAP)

function nextSlot(placed: readonly Slot[], crew: Crew): Slot | null {
  const top = placed.at(-1)
  if (crew === 'carry' && top?.place === 'left') return { ...top, place: 'right' }
  let stack = top?.stack ?? 0
  let row = top ? top.row + 1 : 0
  if (row >= ROWS) {
    stack += 1
    row = 0
  }
  return stack >= STACKS ? null : { stack, row, place: crew === 'team' ? 'long' : 'left' }
}

function slotAt(slot: Slot, width: number): { x: number; y: number } {
  const left = stackLeft(slot.stack, width)
  const x = slot.place === 'left' ? left + BOX_W / 2 : slot.place === 'right' ? left + BOX_W * 1.5 : left + BOX_W
  return { x, y: SKY - slot.row * BOX_H }
}

const walkerAt = (x: number, face: Face) => `translateX(${x}px) scaleX(${face})`
const boxAt = (x: number, y: number, turn = 0) => `translate(${x}px, ${y}px) rotate(${turn}deg) scale(${UNIT})`

// An ant moving boxes from a little supply at the strip's left to stacks at its right, one trip
// at a time, so the stacks grow with the turn: a tier of two boxes, six tiers to a stack, then a
// new stack beside it. How high they stand comes from how long the turn has run, so coming back to
// the chat finds them as high as before. It stops where it stands to wait, and when the turn
// completes sets down whatever it carries right there. The trips are Web Animations measured from
// the strip, so a wider window means longer walks at the same pace.
export function AntLane({ scene: wanted, since = null, className = '' }: { scene: AntLaneScene | null; since?: number | null; className?: string }) {
  const enabled = usePreferences((s) => s.antAnimations)
  const resting = useBackgroundRest((s) => s.resting)
  const strip = useRef<HTMLSpanElement>(null)
  const walker = useRef<HTMLSpanElement>(null)
  const flyingSmall = useRef<SVGGElement>(null)
  const flyingLong = useRef<SVGGElement>(null)
  const live = useRef(new Set<Animation>())
  // Waiting on the user, or the window resting: the trips hold where they are either way.
  const still = useRef(false)
  const crewRef = useRef<Crew>('carry')
  const sinceRef = useRef(since)
  const placedRef = useRef<Slot[]>([])
  const [placed, setPlaced] = useState<Slot[]>([])
  const [width, setWidth] = useState(0)
  // Set while rendering, not in an effect, so not even one frame drops the ant from where it stood.
  const [previous, setPrevious] = useState(wanted)
  const [lingering, setLingering] = useState(false)
  if (wanted !== previous) {
    setPrevious(wanted)
    setLingering(wanted === null && (previous === 'carry' || previous === 'team' || previous === 'wait'))
  }
  useEffect(() => {
    if (!lingering) return
    const timer = setTimeout(() => setLingering(false), LINGER_MS)
    return () => clearTimeout(timer)
  }, [lingering])
  const scene = wanted ?? (lingering ? 'wait' : null)
  const shown = enabled && scene !== null
  const working = shown && scene !== 'place'
  const action = scene === 'place' ? 'place' : scene === 'team' ? 'team' : 'carry'
  if (scene === 'carry' || scene === 'team') crewRef.current = scene
  sinceRef.current = since

  useEffect(() => {
    const element = strip.current
    if (!shown || !element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
      placedRef.current = []
      setPlaced([])
    }
  }, [shown])

  useEffect(() => {
    still.current = scene === 'wait' || resting
    for (const animation of live.current) {
      if (still.current) animation.pause()
      else animation.play()
    }
  }, [scene, resting])

  // The trips themselves: one loop for as long as the turn works, paused while it waits.
  useEffect(() => {
    const ant = walker.current
    const lane = strip.current
    if (!working || !ant || !lane || lane.clientWidth === 0) return
    const animations = live.current
    let stopped = false
    const position: { x: number; face: Face } = { x: 0, face: 1 }
    const hands = (holding: boolean) => {
      ant.style.setProperty('--lane-hold', holding ? '1' : '0')
      ant.style.setProperty('--lane-cargo', holding ? '1' : '0')
    }
    const gait = (on: boolean) => ant.style.setProperty('--lane-gait', on ? '1' : '0')
    const play = async (element: Element, keyframes: Keyframe[], duration: number, easing = 'linear') => {
      const animation = element.animate(keyframes, { duration, easing, fill: 'forwards' })
      animations.add(animation)
      if (still.current) animation.pause()
      try {
        await animation.finished
        animation.commitStyles()
        animation.cancel()
      } finally {
        animations.delete(animation)
      }
    }
    const home = () => SUPPLY_RIGHT + 2 - along(CREW[crewRef.current].front, -1)
    const target = () => nextSlot(placedRef.current, crewRef.current) ?? placedRef.current.at(-1) ?? null
    const destination = () => {
      const slot = target()
      const left = stackLeft(slot?.stack ?? 0, lane.clientWidth)
      return Math.max(home(), left - 2 - CREW[crewRef.current].front)
    }
    const walk = async (to: number) => {
      const distance = Math.abs(to - position.x)
      if (distance < 1) return
      gait(true)
      await play(ant, [{ transform: walkerAt(position.x, position.face) }, { transform: walkerAt(to, position.face) }], (distance / SPEED) * 1000)
      position.x = to
      gait(false)
    }
    const turn = async () => {
      const face: Face = position.face === 1 ? -1 : 1
      await play(ant, [{ transform: walkerAt(position.x, position.face) }, { transform: walkerAt(position.x, face) }], TURN_MS, 'ease-in-out')
      position.face = face
    }
    const flying = () => (crewRef.current === 'team' ? flyingLong.current : flyingSmall.current)
    const toss = async () => {
      const box = flying()
      if (!box) return
      const slot = nextSlot(placedRef.current, crewRef.current)
      const from = { x: position.x + along(CREW[crewRef.current].hands, position.face), y: SKY - HANDS_HIGH }
      const to = slot ? slotAt(slot, lane.clientWidth) : { x: stackLeft(STACKS - 1, lane.clientWidth) + BOX_W, y: SKY - ROWS * BOX_H }
      const peak = Math.min(from.y, to.y) - 8
      hands(false)
      box.style.opacity = '1'
      await play(box, [
        { transform: boxAt(from.x, from.y), easing: 'ease-out' },
        { transform: boxAt((from.x + to.x) / 2, peak, -18), easing: 'ease-in' },
        { transform: boxAt(to.x, to.y), opacity: 1 },
        ...(slot ? [] : [{ transform: boxAt(to.x, to.y - 4), opacity: 0 }])
      ], slot ? TOSS_MS : TOSS_MS + 200)
      box.style.opacity = '0'
      if (slot) {
        placedRef.current = [...placedRef.current, slot]
        setPlaced(placedRef.current)
      }
    }
    const pickup = async () => {
      const box = flying()
      if (!box) return
      const to = { x: position.x + along(CREW[crewRef.current].hands, position.face), y: SKY - HANDS_HIGH }
      ant.style.setProperty('--lane-hold', '1')
      box.style.opacity = '1'
      await play(box, [{ transform: boxAt(BOX_W / 2 + 1, SKY - BOX_H) }, { transform: boxAt(to.x, to.y) }], PICKUP_MS, 'ease-out')
      box.style.opacity = '0'
      hands(true)
    }

    // Start at the supply with a box in hand, the stacks as high as the turn's time so far has built.
    position.x = home()
    ant.style.transform = walkerAt(position.x, 1)
    hands(true)
    gait(false)
    const trip = ((destination() - home()) / SPEED) * 2000 + TURN_MS * 2 + TOSS_MS + PICKUP_MS
    const trips = sinceRef.current === null ? 0 : Math.floor((Date.now() - sinceRef.current) / trip)
    let built: Slot[] = []
    for (let i = 0; i < trips; i++) {
      const slot = nextSlot(built, 'carry')
      if (!slot) break
      built = [...built, slot]
    }
    placedRef.current = built
    setPlaced(built)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    void (async () => {
      try {
        while (!stopped) {
          await walk(destination())
          await toss()
          await turn()
          await walk(home())
          await pickup()
          await turn()
        }
      } catch {
        // Cancelled: the turn ended or the lane went away.
      }
    })()
    return () => {
      stopped = true
      // Freeze the ant where it stands, so a parcel set down lands there.
      for (const animation of animations) {
        // Throws once the ant is gone from the page, and then there is nothing to keep.
        try {
          animation.commitStyles()
        } catch {
          // Nothing rendered to freeze.
        }
        animation.cancel()
      }
      animations.clear()
      gait(false)
      for (const box of [flyingSmall.current, flyingLong.current]) box?.style.setProperty('opacity', '0')
    }
  }, [working, width > 0])

  return (
    <span ref={strip} className={`ant-lane-strip ${className}`} data-scene={shown ? scene : undefined}>
      {shown && (
        <>
          <svg className="ant-lane-boxes" height={SKY} aria-hidden="true" focusable="false">
            {[1, 0].map((row) => (
              <g key={row} transform={`translate(${BOX_W / 2 + 1} ${SKY - row * BOX_H}) scale(${UNIT})`}><Parcel /></g>
            ))}
            {placed.map((slot) => {
              const { x, y } = slotAt(slot, width)
              return <g key={`${slot.stack}-${slot.row}-${slot.place}`} transform={`translate(${x} ${y}) scale(${UNIT})`}><Parcel width={slot.place === 'long' ? 52 : 26} /></g>
            })}
            <g ref={flyingSmall} className="ant-lane-flying"><Parcel /></g>
            <g ref={flyingLong} className="ant-lane-flying"><Parcel width={52} /></g>
          </svg>
          <span ref={walker} className="ant-lane-walker" style={{ bottom: GROUND - 3.5 * UNIT, transformOrigin: `${PIVOT}px 50%` }}>
            <AntMotion key={action} action={action} size="lane" />
          </span>
        </>
      )}
    </span>
  )
}
