// 全問について、答えが決まりうる・掘らずには決まらない・best が最少本数と一致する・ヒントをたどれば best 本以内で決まる、を確かめる。
import { bestDrills, makeSolver, minimax } from '../src/engine/solve.ts'
import { buildSpace, certain, consistent } from '../src/engine/space.ts'
import { puzzles } from '../src/puzzles/index.ts'

let failures = 0
const ids = new Set<string>()
for (const p of puzzles) {
  const errs: string[] = []
  if (ids.has(p.id)) errs.push('id が重複')
  ids.add(p.id)
  try {
    const space = buildSpace(p)
    const mm = minimax(space)
    if (mm === null) errs.push('どう掘っても答えが決まらない')
    else if (mm !== p.best) errs.push(`best ${p.best} だが最少は ${mm}`)
    if (certain(space, consistent(space, [])) !== 0) errs.push('掘らずに答えが決まる')
    const open = Array.from({ length: p.world.width }, (_, x) => x).filter((x) => !p.blocked.includes(x))
    const full = certain(space, consistent(space, open))
    if (full === 0) errs.push('掘れる列を全部掘っても答えが決まらない')
    else if ((full & space.truthMask) !== full) errs.push('決まった答えが本当の断面と合わない')
    if (p.question.kind === 'depth' && !p.blocked.includes(p.question.x)) errs.push('深さを聞く列が掘れる')
    if (p.blocked.length >= p.world.width) errs.push('掘れる列がない')
    // ヒントの列（最初の1本はどれを選んでも）をたどると、best 本以内で本当の答えに決まる
    const solver = makeSolver(space)
    for (const first of bestDrills(space, [], solver)) {
      const drilled = [first]
      while (certain(space, consistent(space, drilled)) === 0) {
        const next = bestDrills(space, drilled, solver)
        if (next.length === 0) break
        drilled.push(next[0])
      }
      const m = certain(space, consistent(space, drilled))
      if (m === 0 || (m & space.truthMask) !== m || drilled.length > p.best) {
        errs.push(`ヒントを ${first + 1} 列目からたどると ${drilled.length} 本で${m === 0 ? '決まらない' : '決まる'}`)
        break
      }
    }
    if (p.question.kind === 'shallowest' || p.question.kind === 'fault') {
      if (p.world.width > 31) errs.push('選択肢が多すぎる')
    }
    if (p.question.kind === 'depth' && p.world.depth + 2 > 31) errs.push('選択肢が多すぎる')
    console.log(`${errs.length ? 'NG  ' : 'ok  '} ${p.id}  候補 ${space.sections.length}  最少 ${mm}${errs.length ? '  ' + errs.join('、') : ''}`)
  } catch (e) {
    errs.push(String(e))
    console.log(`NG   ${p.id}  ${errs.join('、')}`)
  }
  if (errs.length) failures++
}
if (failures) {
  console.log(`\n${failures} 問が NG`)
  process.exit(1)
}
console.log(`\n${puzzles.length} 問すべて ok`)
