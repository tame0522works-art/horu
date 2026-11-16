import type { Question } from './question.ts'
import { slopeValue, type Family, type Rock, type World } from './section.ts'

export const ROCK_NAME: Record<Rock, string> = {
  soil: '表土',
  gravel: '礫岩',
  sand: '砂岩',
  mud: '泥岩',
  lime: '石灰岩',
  tuff: '凝灰岩',
  coal: '石炭',
  granite: '花崗岩',
}

const meters = (v: number) => {
  const a = Math.abs(v)
  if (a === 0.5) return '½'
  if (Number.isInteger(a)) return String(a)
  return a.toFixed(1)
}

/** 「この地域の決まり」を文にする。 */
export function describeFamily(world: World, fam: Family): string[] {
  const out: string[] = ['地層の順番と厚さは右の柱のとおりで、どこでも同じ。地表は平ら。']
  const vals = [...new Set(fam.slopes.map(slopeValue))].sort((a, b) => a - b)
  const nonzero = vals.filter((v) => v !== 0)
  const fold = fam.fold
  if (nonzero.length === 0 && fold === 'none') out.push('地層は水平。')
  else {
    const mags = [...new Set(vals.map((v) => Math.abs(v)))].sort((a, b) => a - b)
    const up = vals.some((v) => v > 0)
    const down = vals.some((v) => v < 0)
    const dir = up && down ? '右上がりか右下がり' : up ? '右上がり' : '右下がり'
    const flat = vals.includes(0) ? '水平か、' : ''
    const mag = mags.filter((m) => m !== 0).map(meters).join('・')
    const subject = fold === 'none' ? '地層は' : '地層の傾きは、折れ目の左右それぞれ'
    const nonzeroMags = mags.filter((m) => m !== 0)
    out.push(`${subject}${flat}${dir}にまっすぐ傾く。1列あたり ${mag} m${nonzeroMags.length > 1 ? ' のどれか' : ''}。`)
  }
  if (fold === 'only') out.push('どこか1か所で折れ曲がっている（褶曲）。折れ目の左右で傾きが違う。')
  if (fold === 'maybe') out.push('どこか1か所で折れ曲がっているかもしれない（褶曲）。')
  if (fam.faults.throws.length > 0) {
    const ts = [...new Set(fam.faults.throws.map(Math.abs))].sort((a, b) => a - b)
    const range = ts.length === 1 ? `${ts[0]}` : `${ts[0]}〜${ts[ts.length - 1]}`
    out.push(
      `${fam.faults.allowNone ? '列と列の間に、垂直な断層が1本あるかもしれない' : '列と列の間に、垂直な断層が1本ある'}。ずれは ${range} m で、どちら側が上がるかは分からない。`,
    )
  }
  if (fam.cover) out.push(`古い地層の上に、削られたあと水平な新しい地層が ${fam.cover[0]}〜${fam.cover[1]} m 載っている（不整合）。`)
  out.push(`掘れるのは深さ ${world.depth} m まで。`)
  return out
}

/** 問いの文。 */
export function describeQuestion(world: World, q: Question): string {
  const name = (layer: number) => ROCK_NAME[world.stack.layers[layer].rock]
  const nth = (layer: number) => {
    const rock = world.stack.layers[layer].rock
    const same = world.stack.layers.filter((l) => l.rock === rock)
    if (same.length === 1) return name(layer)
    const k = world.stack.layers.slice(0, layer + 1).filter((l) => l.rock === rock).length
    return `上から ${k} 枚目の${name(layer)}`
  }
  switch (q.kind) {
    case 'depth':
      return `${q.x + 1} 列目（建物があって掘れない）の地下で、${nth(q.layer)}は深さ何 m から出る？`
    case 'shallowest':
      return `${nth(q.layer)}がいちばん浅い所は何列目？（同じ深さの列があれば、どれでも正解）`
    case 'fault':
      return '断層はどの列とどの列の間にある？'
  }
}
