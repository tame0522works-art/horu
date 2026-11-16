import { certain, consistent, type Space } from './space.ts'

export interface Solver {
  /** cands からどう掘っても d 本以内で答えが決まるか。 */
  solvable(cands: readonly number[], d: number): boolean
  /** 調べた盤面の数（問題づくりの目安）。 */
  nodes: number
}

function groupBy(space: Space, cands: readonly number[], x: number): number[][] {
  const g = new Map<number, number[]>()
  for (const i of cands) {
    const id = space.obs[i][x]
    const arr = g.get(id)
    if (arr) arr.push(i)
    else g.set(id, [i])
  }
  return [...g.values()]
}

export function makeSolver(space: Space): Solver {
  const { width } = space.puzzle.world
  const blocked = new Set(space.puzzle.blocked)
  const cols = Array.from({ length: width }, (_, x) => x).filter((x) => !blocked.has(x))
  // 答えが決まるかどうかは候補の集合だけで決まるので、集合と残り本数で覚える
  const memo = new Map<string, boolean>()
  const solver: Solver = {
    nodes: 0,
    solvable(cands, d) {
      if (certain(space, cands) !== 0) return true
      if (d === 0) return false
      const key = `${d}|${cands.join(',')}`
      const hit = memo.get(key)
      if (hit !== undefined) return hit
      solver.nodes++
      // 最悪の場合に残る候補が少ない列から試す
      const splits = cols
        .map((x) => groupBy(space, cands, x))
        .filter((gs) => gs.length > 1)
        .sort((a, b) => Math.max(...a.map((g) => g.length)) - Math.max(...b.map((g) => g.length)))
      let ok = false
      for (const gs of splits) {
        if (gs.every((g) => solver.solvable(g, d - 1))) {
          ok = true
          break
        }
      }
      memo.set(key, ok)
      return ok
    },
  }
  return solver
}

/**
 * 掘った列 drilled から、どう掘っても答えが決まる最少の追加本数（掘り方は結果を見て変えてよい）。
 * maxDepth までに決まらなければ null。
 */
export function minimax(space: Space, drilled: readonly number[] = [], maxDepth = 8, solver = makeSolver(space)): number | null {
  const cands = consistent(space, drilled)
  for (let d = 0; d <= maxDepth; d++) if (solver.solvable(cands, d)) return d
  return null
}

/** 次に掘るとよい列（どの結果でも、残りの本数が最少のまま決められる列）。もう決まっていれば空。 */
export function bestDrills(space: Space, drilled: readonly number[], solver = makeSolver(space)): number[] {
  const left = minimax(space, drilled, 8, solver)
  if (left === null || left === 0) return []
  const cands = consistent(space, drilled)
  const blocked = new Set(space.puzzle.blocked)
  const out: number[] = []
  for (let x = 0; x < space.puzzle.world.width; x++) {
    if (blocked.has(x) || drilled.includes(x)) continue
    const gs = groupBy(space, cands, x)
    if (gs.length > 1 && gs.every((g) => solver.solvable(g, left - 1))) out.push(x)
  }
  return out
}

/**
 * 本当の断面について、掘れば答えが決まる最少の列の組（運よく当てた場合の下限）。
 * 見つかった組をすべて返す。
 */
export function certificates(space: Space, maxSize = 6): { size: number; sets: number[][] } | null {
  const blocked = new Set(space.puzzle.blocked)
  const cols = Array.from({ length: space.puzzle.world.width }, (_, x) => x).filter((x) => !blocked.has(x))
  for (let k = 0; k <= maxSize; k++) {
    const sets: number[][] = []
    const pick: number[] = []
    const rec = (start: number) => {
      if (pick.length === k) {
        if (certain(space, consistent(space, pick)) !== 0) sets.push([...pick])
        return
      }
      for (let i = start; i < cols.length; i++) {
        pick.push(cols[i])
        rec(i + 1)
        pick.pop()
      }
    }
    rec(0)
    if (sets.length > 0) return { size: k, sets }
  }
  return null
}
