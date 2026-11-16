/**
 * 断面のモデル。
 *
 * 地層の重なり（stack）は上から順に厚さが決まっていて、どの列でも同じ。
 * 列 x の地表から深さ z にあるのは、重なりの上から z + h(x) メートルの位置の岩。
 * h(x) はその列で削られた厚さ（大きいほど古い層が地表近くに出る）で、
 * 傾き・褶曲・断層はすべて h の形の違いとして表す。地表は平ら、断層は垂直とする。
 *
 * 不整合のある問題では、深さ 0〜U の間に水平な新しい重なり（cover）が載り、
 * その下に古い重なりが h(x) で削られた状態で続く。
 */

export type Rock = 'soil' | 'gravel' | 'sand' | 'mud' | 'lime' | 'tuff' | 'coal' | 'granite'

export interface Layer {
  rock: Rock
  thickness: number
}

export interface Stack {
  /** 上から順。いちばん上の層は上へ無限に続くとみなす（削られて残った部分だけが見える）。 */
  layers: Layer[]
  /** いちばん下の層より下（基盤）。 */
  base: Rock
}

export interface Slope {
  /** 1列進むごとに h が num/den メートル増える。 */
  num: number
  den: number
}

export interface Params {
  /** 基準の列（hinge があればそこ、なければ x = 0）での h。 */
  c: number
  /** 傾き。hinge がなければ全体、あれば hinge より左。 */
  s1: Slope
  /** hinge より右の傾き。 */
  s2?: Slope
  /** 褶曲の軸の列。 */
  hinge?: number
  /** 列 at と at+1 の間の垂直な断層。右側の h が throw だけ増える。 */
  fault?: { at: number; throw: number }
  /** 不整合の上に載る新しい重なりの厚さ。 */
  cover?: number
}

export interface Family {
  /** c の範囲（両端を含む）。 */
  offsets: [number, number]
  slopes: Slope[]
  /** 褶曲を含めるか。none: 含めない、only: 必ず褶曲、maybe: どちらも。 */
  fold: 'none' | 'only' | 'maybe'
  /** 断層の落差の候補。空なら断層なし。allowNone で「断層がない」も候補に入る。 */
  faults: { throws: number[]; allowNone: boolean }
  /** 不整合の上の重なりの厚さの範囲。なければ不整合なし。 */
  cover?: [number, number]
}

export interface World {
  width: number
  /** 掘れる深さ（メートル）。断面の表示もこの深さまで。 */
  depth: number
  stack: Stack
  coverStack?: Stack
}

export const slopeValue = (s: Slope) => s.num / s.den
const floorDiv = (a: number, b: number) => Math.floor(a / b)

export function heights(world: World, p: Params): number[] {
  const h: number[] = []
  for (let x = 0; x < world.width; x++) {
    let v: number
    if (p.hinge === undefined) v = p.c + floorDiv(p.s1.num * x, p.s1.den)
    else {
      const s = x < p.hinge ? p.s1 : p.s2!
      v = p.c + floorDiv(s.num * (x - p.hinge), s.den)
    }
    if (p.fault && x > p.fault.at) v += p.fault.throw
    h.push(v)
  }
  return h
}

/** 重なりの上から pos メートルの位置の岩。 */
export function rockAt(stack: Stack, pos: number): Rock {
  if (pos < 0) return stack.layers[0].rock
  let top = 0
  for (const l of stack.layers) {
    if (pos < top + l.thickness) return l.rock
    top += l.thickness
  }
  return stack.base
}

/** 層 index の上端の、重なりの上からの位置。 */
export function layerTop(stack: Stack, index: number): number {
  let top = 0
  for (let i = 0; i < index; i++) top += stack.layers[i].thickness
  return top
}

export interface Section {
  params: Params
  h: number[]
  cover: number
}

export function sectionOf(world: World, params: Params): Section {
  return { params, h: heights(world, params), cover: params.cover ?? 0 }
}

/** 列 x の深さ z の岩。 */
export function materialAt(world: World, sec: Section, x: number, z: number): Rock {
  if (z < sec.cover) return rockAt(world.coverStack!, z)
  return rockAt(world.stack, z - sec.cover + sec.h[x])
}

/** 列 x を掘ったときの柱状図（深さ 0〜depth-1 の岩）。 */
export function core(world: World, sec: Section, x: number): Rock[] {
  const out: Rock[] = []
  for (let z = 0; z < world.depth; z++) out.push(materialAt(world, sec, x, z))
  return out
}

/**
 * 古い重なりの層 index が列 x で最初に現れる深さ。削られて残っていなければ null。
 * 掘れる深さより深くても数を返す（問いの答えに使う）。
 */
export function layerDepth(world: World, sec: Section, x: number, index: number): number | null {
  const top = layerTop(world.stack, index)
  const bottom = top + world.stack.layers[index].thickness
  const pos0 = sec.h[x] // 古い重なりの、不整合面での位置
  if (bottom <= pos0) return null
  return sec.cover + Math.max(0, top - pos0)
}

export const sectionKey = (sec: Section) => `${sec.cover}:${sec.h.join(',')}`

/** 族に含まれる断面をすべて作る（同じ断面になる組み合わせも別々に返す）。 */
export function enumerate(world: World, fam: Family): Params[] {
  const out: Params[] = []
  const covers: (number | undefined)[] = []
  if (fam.cover) for (let u = fam.cover[0]; u <= fam.cover[1]; u++) covers.push(u)
  else covers.push(undefined)
  const faults: (Params['fault'] | undefined)[] = []
  if (fam.faults.allowNone || fam.faults.throws.length === 0) faults.push(undefined)
  for (const t of fam.faults.throws) for (let at = 0; at < world.width - 1; at++) faults.push({ at, throw: t })

  const shapes: Pick<Params, 's1' | 's2' | 'hinge'>[] = []
  if (fam.fold !== 'only') for (const s1 of fam.slopes) shapes.push({ s1 })
  if (fam.fold !== 'none')
    for (let g = 1; g < world.width - 1; g++)
      for (const s1 of fam.slopes)
        for (const s2 of fam.slopes) if (slopeValue(s1) !== slopeValue(s2)) shapes.push({ s1, s2, hinge: g })

  for (let c = fam.offsets[0]; c <= fam.offsets[1]; c++)
    for (const shape of shapes)
      for (const fault of faults)
        for (const cover of covers) {
          const p: Params = { c, ...shape }
          if (fault) p.fault = fault
          if (cover !== undefined) p.cover = cover
          out.push(p)
        }
  return out
}

export const sameParams = (a: Params, b: Params) =>
  a.c === b.c &&
  slopeValue(a.s1) === slopeValue(b.s1) &&
  (a.s2 ? slopeValue(a.s2) : null) === (b.s2 ? slopeValue(b.s2) : null) &&
  a.hinge === b.hinge &&
  a.fault?.at === b.fault?.at &&
  a.fault?.throw === b.fault?.throw &&
  (a.cover ?? 0) === (b.cover ?? 0)
