import { layerDepth, type Params, type Section, type World } from './section.ts'

/**
 * 問い。答えの選択肢は有限で、断面ごとに「受け入れる答え」の集合が決まる。
 * 掘った結果と合う断面すべてが受け入れる答えが1つでもあれば「決まった」。
 */
export type Question =
  /** 列 x（掘れない地点）で、古い重なりの層 layer が深さ何 m から出るか。 */
  | { kind: 'depth'; x: number; layer: number }
  /** 層 layer がいちばん浅い列はどこか（同じ深さの列はどれでも正解）。 */
  | { kind: 'shallowest'; layer: number }
  /** 断層はどの列の間にあるか。 */
  | { kind: 'fault' }

export interface Answer {
  /** 選択肢の番号（0 から）。 */
  index: number
  label: string
}

export function answers(world: World, q: Question): Answer[] {
  switch (q.kind) {
    case 'depth': {
      const out: Answer[] = []
      for (let z = 0; z < world.depth; z++) out.push({ index: z, label: `${z} m` })
      out.push({ index: world.depth, label: `${world.depth} m より深い` })
      out.push({ index: world.depth + 1, label: '削られてない' })
      return out
    }
    case 'shallowest':
      return Array.from({ length: world.width }, (_, x) => ({ index: x, label: `${x + 1} 列目` }))
    case 'fault': {
      const out = Array.from({ length: world.width - 1 }, (_, x) => ({ index: x, label: `${x + 1}〜${x + 2} 列目の間` }))
      out.push({ index: world.width - 1, label: '断層はない' })
      return out
    }
  }
}

/** 断面が受け入れる答えのビット集合（選択肢は 31 個まで）。 */
export function acceptMask(world: World, q: Question, sec: Section): number {
  switch (q.kind) {
    case 'depth': {
      const d = layerDepth(world, sec, q.x, q.layer)
      const i = d === null ? world.depth + 1 : Math.min(d, world.depth)
      return 1 << i
    }
    case 'shallowest': {
      let best = Infinity
      let mask = 0
      for (let x = 0; x < world.width; x++) {
        const d = layerDepth(world, sec, x, q.layer)
        if (d === null) continue
        if (d < best) {
          best = d
          mask = 0
        }
        if (d === best) mask |= 1 << x
      }
      return mask
    }
    case 'fault':
      return faultMask(world, sec.params)
  }
}

function faultMask(world: World, p: Params): number {
  return 1 << (p.fault ? p.fault.at : world.width - 1)
}
