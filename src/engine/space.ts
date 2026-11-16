import type { Puzzle } from '../puzzles/types.ts'
import { acceptMask } from './question.ts'
import { core, enumerate, sectionKey, sectionOf, type Section } from './section.ts'

/**
 * 問題のありうる断面の集まり。同じ断面になる組み合わせは1つにまとめ、
 * 受け入れる答えはその共通部分にする（見分けようがないので、全員が認める答えだけが確か）。
 */
export interface Space {
  puzzle: Puzzle
  sections: Section[]
  /** sections[i] の受け入れる答え。 */
  masks: number[]
  /** obs[i][x]: sections[i] で列 x を掘ったときの柱状図の番号（同じ柱状図は同じ番号）。 */
  obs: Int32Array[]
  /** 柱状図の番号 → 柱状図の文字列。 */
  cores: string[]
  /** 本当の断面の番号。 */
  truth: number
  /** 本当の断面（まとめる前）が受け入れる答え。プレイヤーの答えの正誤に使う。 */
  truthMask: number
}

export function buildSpace(puzzle: Puzzle): Space {
  const { world } = puzzle
  const byKey = new Map<string, number>()
  const sections: Section[] = []
  const masks: number[] = []
  for (const p of enumerate(world, puzzle.family)) {
    const sec = sectionOf(world, p)
    const key = sectionKey(sec)
    const mask = acceptMask(world, puzzle.question, sec)
    const i = byKey.get(key)
    if (i === undefined) {
      byKey.set(key, sections.length)
      sections.push(sec)
      masks.push(mask)
    } else masks[i] &= mask
  }
  const truthSec = sectionOf(world, puzzle.truth)
  const truth = byKey.get(sectionKey(truthSec))
  if (truth === undefined) throw new Error(`${puzzle.id}: 本当の断面が族に含まれていない`)

  const coreIds = new Map<string, number>()
  const cores: string[] = []
  const obs = sections.map((sec) => {
    const row = new Int32Array(world.width)
    for (let x = 0; x < world.width; x++) {
      const s = core(world, sec, x).join(',')
      let id = coreIds.get(s)
      if (id === undefined) {
        id = cores.length
        coreIds.set(s, id)
        cores.push(s)
      }
      row[x] = id
    }
    return row
  })
  return { puzzle, sections, masks, obs, cores, truth, truthMask: acceptMask(world, puzzle.question, truthSec) }
}

/** 掘った列の結果（本当の断面の柱状図）と合う断面の番号。 */
export function consistent(space: Space, drilled: readonly number[]): number[] {
  const t = space.obs[space.truth]
  const out: number[] = []
  for (let i = 0; i < space.sections.length; i++) {
    const o = space.obs[i]
    if (drilled.every((x) => o[x] === t[x])) out.push(i)
  }
  return out
}

/** 候補すべてが受け入れる答えのビット集合。0 ならまだ決まっていない。 */
export function certain(space: Space, cands: readonly number[]): number {
  let m = -1
  for (const i of cands) {
    m &= space.masks[i]
    if (m === 0) return 0
  }
  return m
}
