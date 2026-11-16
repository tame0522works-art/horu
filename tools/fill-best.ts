// 各問題の best を solve の最少本数で書き直す（src/puzzles/index.ts の best: を上から順に置き換える）。
import { readFileSync, writeFileSync } from 'node:fs'
import { minimax } from '../src/engine/solve.ts'
import { buildSpace } from '../src/engine/space.ts'
import { puzzles } from '../src/puzzles/index.ts'

const file = new URL('../src/puzzles/index.ts', import.meta.url)
const bests = puzzles.map((p) => minimax(buildSpace(p)))
let i = 0
const text = readFileSync(file, 'utf8').replace(/best: \d+,/g, () => `best: ${bests[i++] ?? 0},`)
if (i !== puzzles.length) throw new Error(`best: が ${i} か所、問題は ${puzzles.length} 問`)
writeFileSync(file, text)
console.log(puzzles.map((p, k) => `${p.id} ${bests[k]}`).join('\n'))
