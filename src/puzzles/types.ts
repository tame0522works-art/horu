import type { Question } from '../engine/question.ts'
import type { Family, Params, World } from '../engine/section.ts'

export interface Puzzle {
  id: string
  title: string
  world: World
  /** この地域の決まり（ありうる断面の範囲）。 */
  family: Family
  /** 本当の断面。family に含まれる。 */
  truth: Params
  question: Question
  /** 建物などで掘れない列。 */
  blocked: number[]
  /** どう掘っても必ず答えが決まる最少の本数（solve の minimax）。check:puzzles で照合する。 */
  best: number
}
