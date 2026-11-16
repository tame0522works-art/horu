import type { Slope, Stack } from '../engine/section.ts'
import type { Puzzle } from './types.ts'

const s = (num: number, den = 1): Slope => ({ num, den })
const NO_FAULT = { throws: [], allowNone: true }
/** 傾きは1列あたり整数メートルにする（½ だと境目が階段状に揺れて「まっすぐ」に見えない）。 */
const TILTS = [s(-2), s(-1), s(0), s(1), s(2)]

/** 凝灰岩（tuff）は1枚だけの鍵層、砂岩と泥岩はくり返す。 */
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

/** 砂岩と泥岩が交互にくり返す。鍵層は深い所に1枚。 */
const STACK_B: Stack = {
  layers: [
    { rock: 'sand', thickness: 2 },
    { rock: 'mud', thickness: 2 },
    { rock: 'sand', thickness: 2 },
    { rock: 'mud', thickness: 2 },
    { rock: 'sand', thickness: 2 },
    { rock: 'tuff', thickness: 1 },
    { rock: 'mud', thickness: 3 },
    { rock: 'gravel', thickness: 3 },
    { rock: 'lime', thickness: 4 },
  ],
  base: 'granite',
}

/** 石炭をはさむ。 */
const STACK_C: Stack = {
  layers: [
    { rock: 'gravel', thickness: 2 },
    { rock: 'sand', thickness: 3 },
    { rock: 'coal', thickness: 1 },
    { rock: 'mud', thickness: 4 },
    { rock: 'sand', thickness: 2 },
    { rock: 'coal', thickness: 1 },
    { rock: 'mud', thickness: 3 },
    { rock: 'tuff', thickness: 1 },
    { rock: 'lime', thickness: 5 },
  ],
  base: 'granite',
}

/** 不整合の上に載る新しい地層。 */
const COVER: Stack = {
  layers: [
    { rock: 'soil', thickness: 1 },
    { rock: 'gravel', thickness: 2 },
    { rock: 'sand', thickness: 2 },
  ],
  base: 'mud',
}

const world = (stack: Stack, depth = 16) => ({ width: 10, depth, stack })
const covered = (stack: Stack, depth = 16) => ({ width: 10, depth, stack, coverStack: COVER })
const FOLD3 = [s(-1), s(0), s(1)]

export const puzzles: Puzzle[] = [
  {
    id: 'flat',
    title: '平らな地層',
    world: world(STACK_A),
    family: { offsets: [0, 8], slopes: [s(0)], fold: 'none', faults: NO_FAULT },
    truth: { c: 2, s1: s(0) },
    question: { kind: 'depth', x: 6, layer: 2 },
    blocked: [6],
    best: 1,
  },
  {
    id: 'tilt',
    title: '傾いた地層',
    world: world(STACK_A),
    family: { offsets: [0, 10], slopes: TILTS, fold: 'none', faults: NO_FAULT },
    truth: { c: 0, s1: s(1) },
    question: { kind: 'depth', x: 9, layer: 2 },
    blocked: [8, 9],
    best: 2,
  },
  {
    id: 'far',
    title: '遠くの建物',
    world: world(STACK_A),
    family: { offsets: [0, 10], slopes: TILTS, fold: 'none', faults: NO_FAULT },
    truth: { c: 8, s1: s(-1) },
    question: { kind: 'depth', x: 9, layer: 4 },
    blocked: [5, 6, 7, 8, 9],
    best: 2,
  },
  {
    id: 'repeat',
    title: 'くり返す地層',
    world: world(STACK_B, 8),
    family: { offsets: [0, 10], slopes: TILTS, fold: 'none', faults: NO_FAULT },
    truth: { c: 3, s1: s(1) },
    question: { kind: 'depth', x: 4, layer: 5 },
    blocked: [3, 4, 5],
    best: 2,
  },
  {
    id: 'well',
    title: 'いちばん浅い所',
    world: world(STACK_A),
    family: { offsets: [0, 10], slopes: [s(-2), s(-1), s(1), s(2)], fold: 'none', faults: NO_FAULT },
    truth: { c: 10, s1: s(-1) },
    question: { kind: 'shallowest', layer: 6 },
    blocked: [],
    best: 1,
  },
  {
    id: 'fault-depth',
    title: '断層の向こう',
    world: world(STACK_A),
    family: { offsets: [0, 8], slopes: [s(0)], fold: 'none', faults: { throws: [-4, -2, 2, 4], allowNone: true } },
    truth: { c: 3, s1: s(0), fault: { at: 6, throw: -2 } },
    question: { kind: 'depth', x: 8, layer: 4 },
    blocked: [8],
    best: 2,
  },
  {
    id: 'fault',
    title: '断層を探す',
    world: world(STACK_A),
    family: { offsets: [0, 8], slopes: [s(0)], fold: 'none', faults: { throws: [-5, -4, -3, -2, 2, 3, 4, 5], allowNone: false } },
    truth: { c: 2, s1: s(0), fault: { at: 5, throw: 3 } },
    question: { kind: 'fault' },
    blocked: [],
    best: 5,
  },
  {
    id: 'fault-blocked',
    title: '建物の並ぶ通り',
    world: world(STACK_C),
    family: { offsets: [0, 8], slopes: [s(0)], fold: 'none', faults: { throws: [-3, -2, 2, 3], allowNone: false } },
    truth: { c: 1, s1: s(0), fault: { at: 4, throw: 2 } },
    question: { kind: 'fault' },
    blocked: [2, 3, 6, 7],
    best: 4,
  },
  {
    id: 'fault-tilt',
    title: '傾いた断層の地',
    world: world(STACK_C),
    family: { offsets: [0, 8], slopes: [s(-1), s(0), s(1)], fold: 'none', faults: { throws: [-4, -3, 3, 4], allowNone: true } },
    truth: { c: 1, s1: s(1), fault: { at: 4, throw: -3 } },
    question: { kind: 'depth', x: 7, layer: 7 },
    blocked: [7],
    best: 3,
  },
  {
    id: 'coal',
    title: '石炭の層',
    world: world(STACK_C, 10),
    family: { offsets: [0, 10], slopes: TILTS, fold: 'none', faults: { throws: [-3, -2, 2, 3], allowNone: true } },
    truth: { c: 9, s1: s(-1), fault: { at: 6, throw: 2 } },
    question: { kind: 'shallowest', layer: 5 },
    blocked: [],
    best: 4,
  },
  {
    id: 'arch',
    title: '盛り上がった地層',
    world: world(STACK_A),
    family: { offsets: [0, 10], slopes: [s(-1), s(1)], fold: 'only', faults: NO_FAULT },
    truth: { c: 8, s1: s(1), s2: s(-1), hinge: 5 },
    question: { kind: 'shallowest', layer: 6 },
    blocked: [],
    best: 3,
  },
  {
    id: 'valley',
    title: 'くぼんだ地層',
    world: world(STACK_A),
    family: { offsets: [0, 10], slopes: FOLD3, fold: 'only', faults: NO_FAULT },
    truth: { c: 1, s1: s(-1), s2: s(1), hinge: 4 },
    question: { kind: 'depth', x: 4, layer: 4 },
    blocked: [3, 4, 5],
    best: 3,
  },
  {
    id: 'bend',
    title: '折れ曲がっているか',
    world: world(STACK_A),
    family: { offsets: [0, 10], slopes: TILTS, fold: 'maybe', faults: NO_FAULT },
    truth: { c: 3, s1: s(1) },
    question: { kind: 'shallowest', layer: 6 },
    blocked: [],
    best: 3,
  },
  {
    id: 'fold-repeat',
    title: 'くり返しの褶曲',
    world: world(STACK_B, 10),
    family: { offsets: [0, 10], slopes: FOLD3, fold: 'only', faults: NO_FAULT },
    truth: { c: 7, s1: s(1), s2: s(-1), hinge: 3 },
    question: { kind: 'depth', x: 8, layer: 5 },
    blocked: [7, 8],
    best: 3,
  },
  {
    id: 'fold-town',
    title: '町の下の褶曲',
    world: world(STACK_C),
    family: { offsets: [0, 10], slopes: FOLD3, fold: 'maybe', faults: NO_FAULT },
    truth: { c: 2, s1: s(-1), s2: s(0), hinge: 5 },
    question: { kind: 'depth', x: 6, layer: 7 },
    blocked: [4, 5, 6],
    best: 3,
  },
  {
    id: 'cover',
    title: '不整合',
    world: covered(STACK_A),
    family: { offsets: [0, 10], slopes: TILTS, fold: 'none', faults: NO_FAULT, cover: [2, 5] },
    truth: { c: 4, s1: s(1), cover: 3 },
    question: { kind: 'depth', x: 9, layer: 2 },
    blocked: [8, 9],
    best: 2,
  },
  {
    id: 'cover-fault',
    title: '埋もれた断層',
    world: covered(STACK_A),
    family: { offsets: [0, 8], slopes: [s(0)], fold: 'none', faults: { throws: [-4, -3, 3, 4], allowNone: false }, cover: [2, 5] },
    truth: { c: 2, s1: s(0), fault: { at: 3, throw: 4 }, cover: 4 },
    question: { kind: 'fault' },
    blocked: [],
    best: 5,
  },
  {
    id: 'cover-arch',
    title: '覆われた背斜',
    world: covered(STACK_C),
    family: { offsets: [0, 10], slopes: FOLD3, fold: 'only', faults: NO_FAULT, cover: [1, 4] },
    truth: { c: 9, s1: s(1), s2: s(-1), hinge: 6, cover: 2 },
    question: { kind: 'shallowest', layer: 5 },
    blocked: [],
    best: 3,
  },
  {
    id: 'cover-tilt-fault',
    title: '傾きと断層と不整合',
    world: covered(STACK_A),
    family: { offsets: [0, 8], slopes: FOLD3, fold: 'none', faults: { throws: [-3, 3], allowNone: true }, cover: [2, 4] },
    truth: { c: 1, s1: s(1), fault: { at: 5, throw: -3 }, cover: 3 },
    question: { kind: 'depth', x: 9, layer: 4 },
    blocked: [9],
    best: 3,
  },
  {
    id: 'last',
    title: '何でもありの土地',
    world: covered(STACK_C),
    family: { offsets: [0, 6], slopes: FOLD3, fold: 'maybe', faults: { throws: [-3, 3], allowNone: true }, cover: [2, 4] },
    truth: { c: 4, s1: s(1), s2: s(-1), hinge: 3, fault: { at: 6, throw: 3 }, cover: 2 },
    question: { kind: 'shallowest', layer: 7 },
    blocked: [],
    best: 5,
  },
]
