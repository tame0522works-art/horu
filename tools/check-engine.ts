// 手で答えの分かる例と、素朴な実装との突き合わせでエンジンを確かめる。
import { acceptMask } from '../src/engine/question.ts'
import { heights, layerDepth, rockAt, sectionOf, type Family, type Params, type Slope, type Stack, type World } from '../src/engine/section.ts'
import { bestDrills, certificates, makeSolver, minimax } from '../src/engine/solve.ts'
import { buildSpace, certain, consistent, type Space } from '../src/engine/space.ts'
import type { Question } from '../src/engine/question.ts'
import type { Puzzle } from '../src/puzzles/types.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'NG  '} ${name}${detail ? `  (${detail})` : ''}`)
}

const s = (num: number, den = 1): Slope => ({ num, den })
const STACK: Stack = {
  layers: [
    { rock: 'mud', thickness: 2 },
    { rock: 'sand', thickness: 3 },
    { rock: 'tuff', thickness: 1 },
    { rock: 'mud', thickness: 2 },
    { rock: 'gravel', thickness: 2 },
  ],
  base: 'granite',
}
const COVER: Stack = { layers: [{ rock: 'soil', thickness: 1 }, { rock: 'lime', thickness: 2 }], base: 'sand' }
const W: World = { width: 6, depth: 10, stack: STACK, coverStack: COVER }

// 重なりと高さ
check('rockAt: 上は上の層が続く', rockAt(STACK, -5) === 'mud')
check('rockAt: 境目', rockAt(STACK, 4) === 'sand' && rockAt(STACK, 5) === 'tuff' && rockAt(STACK, 6) === 'mud')
check('rockAt: 基盤', rockAt(STACK, 10) === 'granite' && rockAt(STACK, 100) === 'granite')
check('heights: 傾き 1/2 は切り捨て', heights(W, { c: 1, s1: s(1, 2) }).join() === '1,1,2,2,3,3')
check('heights: 負の傾き', heights(W, { c: 3, s1: s(-1, 2) }).join() === '3,2,2,1,1,0')
check('heights: 背斜（軸で最大）', heights(W, { c: 5, s1: s(1), s2: s(-1), hinge: 2 }).join() === '3,4,5,4,3,2')
check('heights: 断層は右側をずらす', heights(W, { c: 0, s1: s(0), fault: { at: 2, throw: 3 } }).join() === '0,0,0,3,3,3')

// 層の深さ
{
  const sec = sectionOf(W, { c: 3, s1: s(0) })
  check('layerDepth: 3m 削れたら凝灰岩は 2m', layerDepth(W, sec, 0, 2) === 2)
  check('layerDepth: 削られ切った層は null', layerDepth(W, sec, 0, 0) === null)
  check('layerDepth: 途中まで削られた層は 0m', layerDepth(W, sec, 0, 1) === 0)
  const sec2 = sectionOf(W, { c: 3, s1: s(0), cover: 3 })
  check('layerDepth: 不整合の上の厚さを足す', layerDepth(W, sec2, 0, 2) === 5)
}

// 問い
{
  const sec = sectionOf(W, { c: 0, s1: s(1) })
  check('shallowest: いちばん右', acceptMask(W, { kind: 'shallowest', layer: 4 }, sec) === 1 << 5)
  const flat = sectionOf(W, { c: 0, s1: s(0) })
  check('shallowest: 平らなら全部', acceptMask(W, { kind: 'shallowest', layer: 4 }, flat) === 0b111111)
  check('fault: 断層なしは最後の選択肢', acceptMask(W, { kind: 'fault' }, flat) === 1 << 5)
}

function puzzle(family: Family, truth: Params, question: Question, blocked: number[] = [], world: World = W): Puzzle {
  return { id: 't', title: 't', world, family, truth, question, blocked, best: 0 }
}

// 素朴な最少本数（覚えない・並べ替えない・全部の列を試す）
function naive(space: Space, cands: number[], d: number): boolean {
  if (certain(space, cands) !== 0) return true
  if (d === 0) return false
  for (let x = 0; x < space.puzzle.world.width; x++) {
    if (space.puzzle.blocked.includes(x)) continue
    const g = new Map<number, number[]>()
    for (const i of cands) g.set(space.obs[i][x], [...(g.get(space.obs[i][x]) ?? []), i])
    if (g.size < 2) continue
    if ([...g.values()].every((c) => naive(space, c, d - 1))) return true
  }
  return false
}
const naiveMinimax = (space: Space) => {
  const all = consistent(space, [])
  for (let d = 0; d <= 8; d++) if (naive(space, all, d)) return d
  return null
}

{
  const flat = buildSpace(puzzle({ offsets: [0, 6], slopes: [s(0)], fold: 'none', faults: { throws: [], allowNone: true } }, { c: 2, s1: s(0) }, { kind: 'depth', x: 5, layer: 2 }, [5]))
  check('平ら: 1本で決まる', minimax(flat) === 1)
  const fault = buildSpace(
    puzzle({ offsets: [0, 6], slopes: [s(0)], fold: 'none', faults: { throws: [3], allowNone: false } }, { c: 0, s1: s(0), fault: { at: 2, throw: 3 } }, { kind: 'fault' }),
  )
  // 5か所の隙間のどれか → 6列を二分探索。最初の1本の結果はどこでも同じ情報にならないので naive と比べる
  check('断層: 素朴な実装と同じ', minimax(fault) === naiveMinimax(fault), `${minimax(fault)}`)
}

// 無作為な族で、素朴な実装・運の下限・ヒントどおりに掘ったときを確かめる
let seed = 12345
const rnd = (n: number) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed % n
}
const SLOPES = [s(-1), s(-1, 2), s(0), s(1, 2), s(1)]
let compared = 0
let played = 0
for (let trial = 0; trial < 60; trial++) {
  const slopes = SLOPES.filter(() => rnd(2) === 0)
  if (slopes.length === 0) slopes.push(s(0))
  const fam: Family = {
    offsets: [rnd(3), 3 + rnd(4)],
    slopes,
    fold: (['none', 'maybe', 'only'] as const)[rnd(3)],
    faults: rnd(2) ? { throws: [-2, 3], allowNone: rnd(2) === 0 } : { throws: [], allowNone: true },
    cover: rnd(3) === 0 ? [0, 2] : undefined,
  }
  if (fam.fold === 'only' && slopes.length < 2) fam.fold = 'none'
  const qs: Question[] = [{ kind: 'depth', x: 5, layer: 2 }, { kind: 'shallowest', layer: 3 }, { kind: 'fault' }]
  const question = qs[rnd(fam.faults.throws.length ? 3 : 2)]
  const blocked = question.kind === 'depth' ? [5] : []
  // 族の中から本当の断面を選ぶ
  const base = buildSpace(puzzle(fam, { c: fam.offsets[0], s1: slopes[0], ...(fam.fold === 'only' ? { s2: slopes[1], hinge: 2 } : {}), ...(fam.faults.allowNone || !fam.faults.throws.length ? {} : { fault: { at: 1, throw: fam.faults.throws[0] } }), ...(fam.cover ? { cover: 0 } : {}) }, question, blocked))
  const truth = base.sections[rnd(base.sections.length)].params
  const space = buildSpace(puzzle(fam, truth, question, blocked))
  const solver = makeSolver(space)
  const mm = minimax(space, [], 8, solver)
  if (space.sections.length <= 400) {
    compared++
    const nv = naiveMinimax(space)
    if (nv !== mm) check(`無作為 ${trial}: 素朴な実装と同じ`, false, `${mm} と ${nv}`)
  }
  const cert = certificates(space)
  if (mm !== null && cert && cert.size > mm) check(`無作為 ${trial}: 運の下限 ≤ 最少`, false, `${cert.size} > ${mm}`)
  if (mm === null) continue
  // ヒントどおりに掘ると mm 本以内で決まり、決まった答えは本当の断面が受け入れる
  const drilled: number[] = []
  while (certain(space, consistent(space, drilled)) === 0) {
    const next = bestDrills(space, drilled, solver)
    if (next.length === 0) break
    drilled.push(next[rnd(next.length)])
  }
  const m = certain(space, consistent(space, drilled))
  played++
  if (m === 0 || drilled.length > mm || (m & space.truthMask) !== m)
    check(`無作為 ${trial}: ヒントどおりに掘る`, false, `${drilled.length} 本, 最少 ${mm}, 決まった ${m}`)
}
check(`無作為: 素朴な実装と ${compared} 族で一致、運の下限 ≤ 最少、ヒントどおり ${played} 回`, true)

// 大きな族の速さ（問題づくりの目安）
{
  const big: World = { width: 10, depth: 16, stack: { ...STACK, layers: [...STACK.layers, { rock: 'sand', thickness: 3 }, { rock: 'lime', thickness: 4 }] }, coverStack: COVER }
  const fam: Family = { offsets: [0, 8], slopes: SLOPES, fold: 'maybe', faults: { throws: [-4, -2, 2, 4], allowNone: true }, cover: [0, 3] }
  const t0 = performance.now()
  const space = buildSpace(puzzle(fam, { c: 3, s1: s(1), s2: s(-1), hinge: 4, fault: { at: 6, throw: 2 }, cover: 2 }, { kind: 'depth', x: 9, layer: 2 }, [9], big))
  const t1 = performance.now()
  const solver = makeSolver(space)
  const mm = minimax(space, [], 6, solver)
  const t2 = performance.now()
  console.log(`     大きな族: 候補 ${space.sections.length}（${(t1 - t0).toFixed(0)}ms）、最少 ${mm}（${(t2 - t1).toFixed(0)}ms、${solver.nodes} 盤面）`)
}

if (failures) {
  console.log(`\n${failures} 件の NG`)
  process.exit(1)
}
console.log('\nすべて ok')
