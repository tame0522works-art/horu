import type { Question } from '../engine/question.ts'
import { core, layerTop, type Rock, type Section, type Stack, type World } from '../engine/section.ts'
import { ROCK_NAME } from '../engine/rules.ts'

export const COL = 32
export const M = 14
const TOP = 44
const LEFT = 26

export const ROCKS: Rock[] = ['soil', 'gravel', 'sand', 'mud', 'lime', 'tuff', 'coal', 'granite']

/** 岩ごとの模様。色は CSS の変数（--r-岩）で、明暗どちらでも見分けやすくする。 */
export function RockPatterns() {
  return (
    <defs>
      {ROCKS.map((r) => (
        <pattern key={r} id={`p-${r}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" className={`bg-${r}`} />
          {r === 'sand' && <circle cx="2" cy="2" r="0.8" className="tex" />}
          {r === 'sand' && <circle cx="6" cy="6" r="0.8" className="tex" />}
          {r === 'gravel' && <circle cx="4" cy="4" r="2.2" className="tex-line" />}
          {r === 'mud' && <path d="M1 3h4M4 7h4" className="tex-line" />}
          {r === 'lime' && <path d="M0 4h8M4 0v4M0 4v4" className="tex-line" />}
          {r === 'tuff' && <path d="M1 2l2 3 2-3M5 6l1.5 2 1.5-2" className="tex-line" />}
          {r === 'granite' && <path d="M2 1v3M0.5 2.5h3M6 5v3M4.5 6.5h3" className="tex-line" />}
          {r === 'soil' && <path d="M1 5q1.5-2 3 0t3 0" className="tex-line" />}
        </pattern>
      ))}
    </defs>
  )
}

interface Run {
  rock: Rock
  from: number
  to: number
}

export function runsOf(rocks: Rock[]): Run[] {
  const out: Run[] = []
  rocks.forEach((rock, z) => {
    const last = out[out.length - 1]
    if (last && last.rock === rock) last.to = z + 1
    else out.push({ rock, from: z, to: z + 1 })
  })
  return out
}

/** 重なりの層ごとの帯（地表からの深さを列の中心で結んだ多角形）。断層の所で切る。 */
function bands(world: World, sec: Section): { rock: Rock; points: string }[] {
  const { width, depth } = world
  const segs: [number, number][] = []
  let start = 0
  const at = sec.params.fault?.at
  for (let x = 0; x < width; x++) {
    if (x === width - 1 || x === at) {
      segs.push([start, x])
      start = x + 1
    }
  }
  const layers = world.stack.layers
  const out: { rock: Rock; points: string }[] = []
  const far = depth + 200
  for (let i = 0; i <= layers.length; i++) {
    const top = i === 0 ? -far : layerTop(world.stack, i)
    const bottom = i === layers.length ? far : layerTop(world.stack, i + 1)
    const rock = i === layers.length ? world.stack.base : layers[i].rock
    for (const [a, b] of segs) {
      const xs: number[] = [LEFT + a * COL]
      for (let x = a; x <= b; x++) xs.push(LEFT + (x + 0.5) * COL)
      xs.push(LEFT + (b + 1) * COL)
      const hs = [sec.h[a], ...sec.h.slice(a, b + 1), sec.h[b]]
      const y = (pos: number, h: number) => TOP + (sec.cover + pos - h) * M
      const upper = xs.map((x, k) => `${x},${y(top, hs[k])}`)
      const lower = xs.map((x, k) => `${x},${y(bottom, hs[k])}`).reverse()
      out.push({ rock, points: [...upper, ...lower].join(' ') })
    }
  }
  return out
}

function coverBands(world: World, sec: Section): { rock: Rock; y: number; h: number }[] {
  if (!sec.cover || !world.coverStack) return []
  const out: { rock: Rock; y: number; h: number }[] = []
  for (const r of runsOf(Array.from({ length: sec.cover }, (_, z) => coverRock(world.coverStack!, z)))) out.push({ rock: r.rock, y: TOP + r.from * M, h: (r.to - r.from) * M })
  return out
}

function coverRock(stack: Stack, z: number): Rock {
  let top = 0
  for (const l of stack.layers) {
    if (z < top + l.thickness) return l.rock
    top += l.thickness
  }
  return stack.base
}

interface BoardProps {
  world: World
  question: Question
  blocked: readonly number[]
  truth: Section
  drilled: readonly number[]
  selected: number | null
  hinted: readonly number[]
  revealed: boolean
  /** 答えた列・隙間（表示用）。 */
  picked: number | null
  onSelect: (x: number) => void
}

export function Board({ world, question, blocked, truth, drilled, selected, hinted, revealed, picked, onSelect }: BoardProps) {
  const { width, depth } = world
  const W = LEFT + width * COL + 6
  const H = TOP + depth * M + 6
  const groundY = TOP
  const bottomY = TOP + depth * M
  const target = question.kind === 'depth' ? question.x : null
  const ticks = Array.from({ length: Math.floor(depth / 5) + 1 }, (_, i) => i * 5)

  return (
    <svg className="board" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="断面。列を押して選ぶ">
      <RockPatterns />
      <clipPath id="under">
        <rect x={LEFT} y={groundY} width={width * COL} height={depth * M} />
      </clipPath>

      {/* 地下（分からない所） */}
      <rect x={LEFT} y={groundY} width={width * COL} height={depth * M} className="unknown" />
      {revealed && (
        <g clipPath="url(#under)" className="reveal">
          {bands(world, truth).map((b, i) => (
            <polygon key={i} points={b.points} fill={`url(#p-${b.rock})`} className="band" />
          ))}
          {coverBands(world, truth).map((b, i) => (
            <rect key={`c${i}`} x={LEFT} y={b.y} width={width * COL} height={b.h} fill={`url(#p-${b.rock})`} className="band" />
          ))}
          {truth.cover > 0 && <line x1={LEFT} x2={LEFT + width * COL} y1={TOP + truth.cover * M} y2={TOP + truth.cover * M} className="unconformity" />}
          {truth.params.fault && (
            <line
              x1={LEFT + (truth.params.fault.at + 1) * COL}
              x2={LEFT + (truth.params.fault.at + 1) * COL}
              y1={TOP + truth.cover * M}
              y2={bottomY}
              className="fault-line"
            />
          )}
        </g>
      )}

      {/* 深さの目盛り */}
      {ticks.map((z) => (
        <g key={z}>
          <line x1={LEFT - 4} x2={LEFT} y1={TOP + z * M} y2={TOP + z * M} className="tick" />
          <text x={LEFT - 6} y={TOP + z * M + 4} className="tick-label" textAnchor="end">
            {z}
          </text>
        </g>
      ))}
      <text x={LEFT - 6} y={TOP - 30} className="tick-label" textAnchor="end">
        m
      </text>

      {/* 掘った柱 */}
      {drilled.map((x) => (
        <g key={x} className="core">
          {runsOf(core(world, truth, x)).map((r) => (
            <rect key={r.from} x={LEFT + x * COL + 7} y={TOP + r.from * M} width={COL - 14} height={(r.to - r.from) * M} fill={`url(#p-${r.rock})`} className="core-run" />
          ))}
          <rect x={LEFT + x * COL + 7} y={TOP} width={COL - 14} height={depth * M} className="core-edge" />
        </g>
      ))}

      {/* 地表 */}
      <line x1={LEFT} x2={LEFT + width * COL} y1={groundY} y2={groundY} className="ground" />

      {Array.from({ length: width }, (_, x) => {
        const cx = LEFT + (x + 0.5) * COL
        const isBlocked = blocked.includes(x)
        const isDrilled = drilled.includes(x)
        const label = `${x + 1}列目${isBlocked ? '、建物があって掘れない' : isDrilled ? '、掘った' : ''}${target === x ? '、問いの地点' : ''}`
        return (
          <g key={x} className={`col${selected === x ? ' selected' : ''}`}>
            {selected === x && <rect x={LEFT + x * COL + 1} y={4} width={COL - 2} height={H - 8} rx={4} className="select-box" />}
            {hinted.includes(x) && <rect x={LEFT + x * COL + 2} y={6} width={COL - 4} height={H - 12} rx={4} className="hint-box" />}
            {picked === x && question.kind === 'shallowest' && <rect x={LEFT + x * COL + 2} y={6} width={COL - 4} height={H - 12} rx={4} className="pick-box" />}
            <text x={cx} y={12} className="col-num" textAnchor="middle">
              {x + 1}
            </text>
            {isBlocked ? (
              <g className={`building${target === x ? ' target' : ''}`}>
                <rect x={cx - 9} y={TOP - 24} width={18} height={24} />
                <rect x={cx - 5} y={TOP - 20} width={4} height={4} className="win" />
                <rect x={cx + 1} y={TOP - 20} width={4} height={4} className="win" />
                <rect x={cx - 5} y={TOP - 12} width={4} height={4} className="win" />
                <rect x={cx + 1} y={TOP - 12} width={4} height={4} className="win" />
              </g>
            ) : isDrilled ? (
              <path d={`M${cx - 7} ${TOP} L${cx} ${TOP - 20} L${cx + 7} ${TOP} M${cx - 4} ${TOP - 8} h8`} className="rig" />
            ) : (
              <circle cx={cx} cy={TOP - 8} r={3} className="spot" />
            )}
            {target === x && (
              <>
                <line x1={cx} x2={cx} y1={TOP} y2={bottomY} className="target-line" />
                <text x={cx} y={TOP + depth * M * 0.5} className="target-q" textAnchor="middle">
                  ?
                </text>
              </>
            )}
            <rect
              x={LEFT + x * COL}
              y={0}
              width={COL}
              height={H}
              className="hit"
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={selected === x}
              onClick={() => onSelect(x)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(x)
                }
              }}
            />
          </g>
        )
      })}
      {picked !== null && question.kind === 'fault' && picked < width - 1 && (
        <line x1={LEFT + (picked + 1) * COL} x2={LEFT + (picked + 1) * COL} y1={TOP - 6} y2={bottomY} className="pick-line" />
      )}
    </svg>
  )
}

/** 地層の重なりの柱（凡例）。 */
/** cover: 不整合の上に載る地層（上へ続かず、厚さの分だけ載る。下は古い地層なので基盤は描かない）。 */
export function StackColumn({ stack, title, cover = false }: { stack: Stack; title: string; cover?: boolean }) {
  const S = 9
  const total = stack.layers.reduce((s, l) => s + l.thickness, 0)
  const H = (total + (cover ? 0 : 3)) * S + 26
  let y = 14
  return (
    <svg className="stack" viewBox={`0 0 132 ${H}`} role="img" aria-label={`${title}: ${stack.layers.map((l) => `${ROCK_NAME[l.rock]} ${l.thickness} m`).join('、')}${cover ? '' : `、その下は${ROCK_NAME[stack.base]}`}`}>
      <RockPatterns />
      <text x={0} y={9} className="stack-title">
        {title}
      </text>
      {stack.layers.map((l, i) => {
        const h = l.thickness * S
        const g = (
          <g key={i}>
            <rect x={0} y={y} width={26} height={h} fill={`url(#p-${l.rock})`} className="core-run" />
            <text x={32} y={y + h / 2 + 4} className="stack-label">
              {ROCK_NAME[l.rock]} {l.thickness} m{i === 0 && !cover ? '（上へ続く）' : ''}
            </text>
          </g>
        )
        y += h
        return g
      })}
      {!cover && (
        <>
          <rect x={0} y={y} width={26} height={3 * S} fill={`url(#p-${stack.base})`} className="core-run" />
          <text x={32} y={y + 1.5 * S + 4} className="stack-label">
            {ROCK_NAME[stack.base]}（下へ続く）
          </text>
        </>
      )}
      <rect x={0} y={14} width={26} height={y + (cover ? 0 : 3 * S) - 14} className="core-edge" />
    </svg>
  )
}
