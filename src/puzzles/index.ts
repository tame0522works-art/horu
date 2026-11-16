import type { Slope, Stack } from '../engine/section.ts'
import type { Puzzle } from './types.ts'

const s = (num: number, den = 1): Slope => ({ num, den })

/** 試しの重なり。凝灰岩（tuff）は1枚だけの鍵層、砂岩と泥岩はくり返す。 */
const STACK_A: Stack = {
  layers: [
    { rock: 'mud', thickness: 3 },
    { rock: 'sand', thickness: 3 },
    { rock: 'tuff', thickness: 1 },
    { rock: 'mud', thickness: 3 },
    { rock: 'gravel', thickness: 2 },
    { rock: 'sand', thickness: 3 },
    { rock: 'lime', thickness: 4 },
  ],
  base: 'granite',
}

export const puzzles: Puzzle[] = [
  {
    id: 'flat',
    title: '平らな地層',
    world: { width: 10, depth: 16, stack: STACK_A },
    family: { offsets: [0, 8], slopes: [s(0)], fold: 'none', faults: { throws: [], allowNone: true } },
    truth: { c: 2, s1: s(0) },
    question: { kind: 'depth', x: 7, layer: 2 },
    blocked: [7],
    best: 1,
  },
  {
    id: 'tilt',
    title: '傾いた地層',
    world: { width: 10, depth: 16, stack: STACK_A },
    family: {
      offsets: [0, 10],
      slopes: [s(-1), s(-1, 2), s(0), s(1, 2), s(1)],
      fold: 'none',
      faults: { throws: [], allowNone: true },
    },
    truth: { c: 1, s1: s(1, 2) },
    question: { kind: 'depth', x: 9, layer: 2 },
    blocked: [8, 9],
    best: 2,
  },
  {
    id: 'fault',
    title: '断層を探す',
    world: { width: 10, depth: 16, stack: STACK_A },
    family: {
      offsets: [0, 8],
      slopes: [s(0)],
      fold: 'none',
      faults: { throws: [-5, -4, -3, -2, 2, 3, 4, 5], allowNone: false },
    },
    truth: { c: 2, s1: s(0), fault: { at: 5, throw: 3 } },
    question: { kind: 'fault' },
    blocked: [],
    best: 5,
  },
]
