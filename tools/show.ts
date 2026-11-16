// 問題の断面を文字で描き、候補の数・最少本数・運よく当てた場合の下限を出す。
// 使い方: npx tsx tools/show.ts [問題の id ...]
import { answers } from '../src/engine/question.ts'
import { core, sectionOf } from '../src/engine/section.ts'
import { makeSolver, minimax, bestDrills, certificates } from '../src/engine/solve.ts'
import { buildSpace } from '../src/engine/space.ts'
import { puzzles } from '../src/puzzles/index.ts'

const CH: Record<string, string> = { soil: '.', gravel: 'o', sand: ':', mud: '-', lime: '#', tuff: 'T', coal: 'c', granite: '+' }

const ids = process.argv.slice(2)
for (const p of puzzles.filter((q) => ids.length === 0 || ids.includes(q.id))) {
  const t0 = performance.now()
  const space = buildSpace(p)
  const t1 = performance.now()
  const solver = makeSolver(space)
  const mm = minimax(space, [], 8, solver)
  const t2 = performance.now()
  const cert = certificates(space)
  const first = bestDrills(space, [], solver)
  const sec = sectionOf(p.world, p.truth)
  const cols = Array.from({ length: p.world.width }, (_, x) => core(p.world, sec, x))
  console.log(`== ${p.id}  ${p.title}`)
  console.log('   ' + cols.map((_, x) => (p.blocked.includes(x) ? 'x' : String((x + 1) % 10))).join(''))
  for (let z = 0; z < p.world.depth; z++) console.log(`${String(z).padStart(2)} ` + cols.map((c) => CH[c[z]]).join(''))
  const opts = answers(p.world, p.question)
  const truthAns = opts.filter((a) => space.truthMask & (1 << a.index)).map((a) => a.label)
  console.log(`答え: ${truthAns.join(' / ')}`)
  console.log(
    `候補 ${space.sections.length}（${(t1 - t0).toFixed(0)}ms）  最少 ${mm}（${(t2 - t1).toFixed(0)}ms, ${solver.nodes} 盤面）  best ${p.best}` +
      `  運の下限 ${cert?.size}（${cert?.sets.length} 組、例 ${cert?.sets[0]?.map((x) => x + 1).join(',')}）  最初に掘るとよい列 ${first.map((x) => x + 1).join(',')}`,
  )
}
