import { certain, consistent, type Space } from './space.ts'

export interface Judgement {
  /** 本当の断面が受け入れる答えか。 */
  correct: boolean
  /** 選んだ答えそのものが、掘った結果から確かだと言えたか。 */
  sure: boolean
  /** 何かの答えが確かだと言えたか（はずれのとき「もう決まっていた」と伝えるため）。 */
  decided: boolean
  /** 掘った結果と合う断面の数。 */
  left: number
}

/**
 * 答えを判定する。「何かの答えが決まった」だけで ★ を付けると、同じ深さの列が並ぶ問題で
 * まだ確かでない方の列を選んで当たっても ★3 になってしまうので、選んだ答えが確かかを見る。
 */
export function judge(space: Space, drilled: readonly number[], answer: number): Judgement {
  const cands = consistent(space, drilled)
  const mask = certain(space, cands)
  return {
    correct: (space.truthMask & (1 << answer)) !== 0,
    sure: (mask & (1 << answer)) !== 0,
    decided: mask !== 0,
    left: cands.length,
  }
}
