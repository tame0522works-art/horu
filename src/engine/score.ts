export interface Result {
  correct: boolean
  /** 答えた時点で、掘った結果から答えが決まっていたか。 */
  certain: boolean
  stars: 0 | 1 | 2 | 3
}

/**
 * ★3 = どう掘っても決まる最少本数（best）以内、★2 = best+1 以内、それ以外は ★1。
 * まだ決まっていないのに答えて当たった場合は、運なので ★1。はずれは ★0。
 */
export function score(drills: number, best: number, correct: boolean, certain: boolean): Result {
  if (!correct) return { correct, certain, stars: 0 }
  if (!certain) return { correct, certain, stars: 1 }
  return { correct, certain, stars: drills <= best ? 3 : drills <= best + 1 ? 2 : 1 }
}
