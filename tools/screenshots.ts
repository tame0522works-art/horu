// README に載せる画面の画像を撮る。公開と同じ設定のビルドを配信した状態（npm run build → npm run preview）で
// `npm run screenshots` を実行する。Edge（なければ Chrome）を画面なしで起動し、Chrome DevTools Protocol で操作する。
// 操作は決まった手順なので、アプリを直したら同じ画像を撮り直せる。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { answers } from '../src/engine/question.ts'
import { bestDrills, makeSolver } from '../src/engine/solve.ts'
import { buildSpace, certain, consistent } from '../src/engine/space.ts'
import { puzzles } from '../src/puzzles/index.ts'
import { Browser, sleep, type Page } from './cdp.ts'

const BASE = process.argv[2] ?? 'http://localhost:5216/'
const OUT = 'docs/images'

async function shoot(cdp: Page, name: string) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  console.log(`  ${OUT}/${name}`)
}

async function open(cdp: Page) {
  await cdp.goto(BASE)
  // 同じポートで別の作品が動いていると、その画面を撮ってしまうので、horu であることを先に確かめる
  const title = await cdp.run<string>(`return document.title`)
  if (title !== 'horu') throw new Error(`${BASE} で動いているのは horu ではありません（ページの題名: ${title || 'なし'}）`)
  await cdp.waitFor(`document.querySelector('.levels button')`, '一覧の表示')
}

/** 見えている文字か aria-label でボタンを押す（画像に写らない操作なので click で足りる） */
const press = (cdp: Page, label: string) =>
  cdp.run(
    `[...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)} || (b.getAttribute('aria-label') ?? '').split(/[、 ]/)[0] === ${JSON.stringify(label)}).click()`,
  )

async function drill(cdp: Page, x: number) {
  const pressed = await cdp.run<boolean>(`return document.querySelectorAll('.board .hit')[${x}].getAttribute('aria-pressed') === 'true'`)
  if (!pressed) await cdp.run(`document.querySelectorAll('.board .hit')[${x}].dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await press(cdp, `${x + 1}列目を掘る`)
}

/** ヒントの列（最初のもの）を順に掘る道すじ。 */
function hintPath(i: number): number[] {
  const space = buildSpace(puzzles[i])
  const solver = makeSolver(space)
  const drilled: number[] = []
  while (certain(space, consistent(space, drilled)) === 0) drilled.push(bestDrills(space, drilled, solver)[0])
  return drilled
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  // このブラウザ専用の一時プロファイルを使うので、普段のデータには触れない
  const browser = await Browser.launch()
  try {
    const cdp = await browser.newPage({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    console.log('撮影:')

    // 1. 20問目を2本掘って、次のヒントを出したところ
    const i = puzzles.findIndex((p) => p.id === 'last')
    const path = hintPath(i)
    await open(cdp)
    await press(cdp, `${i + 1}問目`)
    await sleep(300)
    for (const x of path.slice(0, 2)) await drill(cdp, x)
    await press(cdp, 'ヒント')
    await sleep(300)
    await shoot(cdp, 'start.png')

    // 2. 11問目（背斜）を最少本数で掘って答え、断面が現れたところ
    const j = puzzles.findIndex((p) => p.id === 'arch')
    const p = puzzles[j]
    const space = buildSpace(p)
    const label = answers(p.world, p.question).find((a) => space.truthMask & (1 << a.index))!.label
    await open(cdp)
    await press(cdp, `${j + 1}問目`)
    for (const x of hintPath(j)) await drill(cdp, x)
    await press(cdp, '答える')
    await press(cdp, label)
    await press(cdp, `「${label.replace(/\s+/g, '')}」で答える`)
    await sleep(300)
    await shoot(cdp, 'clear.png')

    // 3. 一覧（11問目だけ解いた記録がある）
    await press(cdp, '断面を見る')
    await press(cdp, '←一覧')
    await sleep(200)
    await shoot(cdp, 'menu.png')
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
