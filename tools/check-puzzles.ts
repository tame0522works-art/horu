// 全問について、答えが決まりうる・掘らずには決まらない・best が最少本数と一致する、を確かめる。
import { minimax } from '../src/engine/solve.ts'
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
    if (p.question.kind === 'depth' && !p.blocked.includes(p.question.x)) errs.push('深さを聞く列が掘れる')
    if (p.blocked.length >= p.world.width) errs.push('掘れる列がない')
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
