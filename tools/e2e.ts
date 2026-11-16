// 画面操作のテスト。公開と同じ設定でビルドしたもの（CSP 入り）をローカルで配信し、画面なしの Chrome に
// 本物のマウス・タッチ・キーボードの入力を送って、掘る・答える・★と記録・ヒント・はずれ・通信の制限を確かめる。
// `npm run e2e` で実行する（先に dist-e2e へビルドしてから、このスクリプトが配信とブラウザを立ち上げる）。
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { answers } from '../src/engine/question.ts'
import { buildSpace } from '../src/engine/space.ts'
import { puzzles } from '../src/puzzles/index.ts'
import { Browser, sleep, type Page, type Viewport } from './cdp.ts'

const PORT = 4215
const BASE = `http://127.0.0.1:${PORT}/`
const DESKTOP: Viewport = { width: 1280, height: 860 }
const PHONE: Viewport = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, touch: true }
const FAILURES = 'e2e-failures'
type Input = 'mouse' | 'touch'

const index = (id: string) => puzzles.findIndex((p) => p.id === id)

/** 本当の断面が受け入れる答えの選択肢の文字（最初のもの）。 */
function correctLabel(id: string): string {
  const p = puzzles[index(id)]
  const space = buildSpace(p)
  return answers(p.world, p.question).find((a) => space.truthMask & (1 << a.index))!.label
}

class Ui {
  readonly page: Page
  readonly input: Input
  constructor(page: Page, input: Input) {
    this.page = page
    this.input = input
  }

  async open() {
    await this.page.goto(BASE)
    await this.page.waitFor(`document.querySelector('.levels button')`, '一覧の表示')
  }

  text(selector: string) {
    return this.page.run<string>(`return (document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)
  }

  count(selector: string) {
    return this.page.run<number>(`return document.querySelectorAll(${JSON.stringify(selector)}).length`)
  }

  private async tap(c: { x: number; y: number }) {
    if (this.input === 'touch') {
      await this.page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] })
      await sleep(50)
      await this.page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      // 指を離してすぐの次のタップは Chrome が click にしないことがある（kakijun で分かったこと）
      await sleep(350)
    } else {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await this.page.send('Input.dispatchMouseEvent', { type, ...c, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
      }
      await sleep(60)
    }
  }

  private async center(selectorJs: string, label: string) {
    const c = await this.page.run<{ x: number; y: number } | null>(`
      const el = ${selectorJs};
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `)
    assert.ok(c, `${label}がない`)
    return c
  }

  /** 見えている文字（空白を除く）か aria-label の先頭でボタンを押す */
  async press(label: string) {
    const L = JSON.stringify(label)
    await this.tap(
      await this.center(
        `[...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${L} || (b.getAttribute('aria-label') ?? '').split(/[、 ]/)[0] === ${L})`,
        `「${label}」のボタン`,
      ),
    )
  }

  /** 答えの選択肢を aria-label（「4 m」「6〜7 列目の間」など）で押す */
  async choose(label: string) {
    await this.tap(await this.center(`document.querySelector('.choices [aria-label=${JSON.stringify(label)}]')`, `答え「${label}」`))
  }

  /** 断面の列を押す（x は 0 から） */
  async col(x: number) {
    // 列の当たりは縦に長いので、地表の少し上（掘る場所の印のあたり）を押す
    const c = await this.page.run<{ x: number; y: number }>(`
      const el = document.querySelectorAll('.board .hit')[${x}];
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(40, r.height / 2) };
    `)
    await this.tap(c)
  }

  async drill(x: number) {
    const pressed = await this.page.run<boolean>(`return document.querySelectorAll('.board .hit')[${x}].getAttribute('aria-pressed') === 'true'`)
    if (!pressed) await this.col(x)
    await this.press(`${x + 1}列目を掘る`)
  }

  drilled() {
    return this.page.run<number>(`return Number(document.querySelector('.meters b')?.textContent)`)
  }

  hinted() {
    return this.page.run<number[]>(`
      const cols = [...document.querySelectorAll('.board .col')];
      return cols.map((g, x) => g.querySelector('.hint-box') ? x : -1).filter(x => x >= 0);
    `)
  }

  async answer(label: string) {
    await this.press('答える')
    await this.choose(label)
    await this.press(`「${label.replace(/\s+/g, '')}」で答える`)
  }

  async key(key: string, code: string, vk: number) {
    const text = key === 'Enter' ? '\r' : undefined
    for (const type of ['keyDown', 'keyUp']) await this.page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, ...(type === 'keyDown' && text ? { text } : {}) })
    await sleep(60)
  }
}

interface Scenario {
  name: string
  viewport?: Viewport
  setup?: string
  run(ui: Ui): Promise<void>
}

const scenarios: Scenario[] = [
  {
    name: '一覧: 20問・★ 0 / 60',
    async run(ui) {
      await ui.open()
      assert.equal(await ui.count('.levels button'), 20)
      assert.match(await ui.text('.menu header .muted'), /★ 0 \/ 60/)
    },
  },
  {
    name: 'スマホの指で2問目: 2本掘って柱状図を読み、答えて ★3、記録が残る',
    viewport: PHONE,
    async run(ui) {
      await ui.open()
      await ui.press('2問目')
      assert.match(await ui.text('.goal'), /10 列目.*凝灰岩は深さ何 m から出る/)
      await ui.drill(0)
      assert.equal(await ui.drilled(), 1)
      assert.equal(await ui.count('.board .core'), 1)
      await ui.drill(2)
      assert.equal(await ui.drilled(), 2)
      // 掘るとその列の柱状図の文が出る。前に掘った列を押してもう一度読める
      assert.match(await ui.text('.core-text'), /3 列目の柱状図.*凝灰岩/)
      await ui.col(0)
      assert.match(await ui.text('.core-text'), /1 列目の柱状図/)
      await ui.answer(correctLabel('tilt'))
      assert.match(await ui.text('.clear'), /★★★.*正解。2 本で答えが決まっていた。.*記録しました/)
      assert.ok((await ui.count('.reveal .band')) > 0, '断面が現れない')
      // 案内を閉じて断面を見ているあいだも、下のボタンから次の問題へ進める
      await ui.press('断面を見る')
      assert.equal(await ui.count('.clear'), 0)
      await ui.press('次の問題へ')
      assert.match(await ui.text('.top .title'), /^3\. /)
      await ui.press('←一覧')
      assert.match(await ui.text('.menu header .muted'), /★ 3 \/ 60/)
      await ui.open()
      assert.match(await ui.text('.menu header .muted'), /★ 3 \/ 60/)
      assert.match(await ui.text('.levels li:nth-child(2)'), /★★★/)
    },
  },
  {
    name: '建物の列は掘れない、最初から',
    async run(ui) {
      const p = puzzles[index('tilt')]
      await ui.open()
      await ui.press('2問目')
      await ui.col(p.blocked[0])
      assert.match(await ui.text('.panel'), /建物があって掘れない/)
      assert.equal(await ui.count('.panel .primary'), 0)
      assert.equal(await ui.drilled(), 0)
      await ui.drill(4)
      assert.equal(await ui.drilled(), 1)
      await ui.press('最初から')
      assert.equal(await ui.drilled(), 0)
      assert.equal(await ui.count('.board .core'), 0)
    },
  },
  {
    name: '決まる前に答えて当たると ★1（運）',
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      await ui.answer(correctLabel('flat'))
      assert.match(await ui.text('.clear'), /★☆☆.*当たり。ただ、この時点ではまだ 9 通りの断面がありえて/)
    },
  },
  {
    name: 'はずれ: 正解を見せて、もう一度で掘り直せる（記録は付かない）',
    async run(ui) {
      await ui.open()
      await ui.press('7問目')
      await ui.drill(0)
      await ui.answer('1〜2 列目の間')
      assert.match(await ui.text('.clear'), /はずれ.*正解は「6〜7 列目の間」/)
      assert.equal(await ui.count('.reveal .fault-line'), 1)
      // 断面を見たあとは、下の「もう一度」でやり直す（同じことをする「最初から」は出さない）
      await ui.press('断面を見る')
      assert.equal(await ui.page.run<boolean>(`return [...document.querySelectorAll('.sub button')].some(b => b.textContent.includes('最初から'))`), false)
      await ui.press('もう一度')
      assert.equal(await ui.drilled(), 0)
      assert.equal(await ui.count('.clear'), 0)
      await ui.press('←一覧')
      assert.match(await ui.text('.menu header .muted'), /★ 0 \/ 60/)
    },
  },
  {
    name: 'スマホの指で20問目をヒントだけで ★3',
    viewport: PHONE,
    async run(ui) {
      const i = index('last')
      await ui.open()
      await ui.press(`${i + 1}問目`)
      for (let n = 0; n < 10; n++) {
        await ui.press('ヒント')
        const cols = await ui.hinted()
        if (cols.length === 0) {
          assert.match(await ui.text('.hint-text'), /もう答えは決まっている/)
          break
        }
        await ui.drill(cols[0])
      }
      assert.ok((await ui.drilled()) <= puzzles[i].best, `ヒントどおりで ${await ui.drilled()} 本（最少 ${puzzles[i].best}）`)
      await ui.answer(correctLabel('last'))
      assert.match(await ui.text('.clear'), /★★★/)
    },
  },
  {
    name: '5問目: 答えるとき断面の列を押して選べる',
    async run(ui) {
      await ui.open()
      await ui.press('5問目')
      await ui.drill(6)
      await ui.press('答える')
      await ui.col(0)
      assert.equal(await ui.count('.pick-box'), 1)
      await ui.press('「1列目」で答える')
      assert.match(await ui.text('.clear'), /★★★.*1 本で答えが決まっていた/)
    },
  },
  {
    name: '不整合の問題: 上に載る地層の凡例と、答えたあとの不整合面',
    async run(ui) {
      const i = index('cover')
      await ui.open()
      await ui.press(`${i + 1}問目`)
      assert.match(await ui.text('.rules'), /不整合/)
      assert.equal(await ui.count('.stacks .stack'), 2)
      await ui.answer('0 m')
      assert.equal(await ui.count('.reveal .unconformity'), 1)
      // 岩の模様は画面に1組だけ（断面と凡例で id が重ならない）
      const ids = await ui.page.run<string[]>(`return [...document.querySelectorAll('[id]')].map(e => e.id)`)
      assert.deepEqual(ids.filter((id, k) => ids.indexOf(id) !== k), [], 'id が重なっている')
      assert.equal(await ui.count('pattern'), 8)
    },
  },
  {
    name: 'キーボードだけで掘る',
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      await ui.page.run(`document.querySelectorAll('.board .hit')[0].focus()`)
      await ui.key('Enter', 'Enter', 13)
      await ui.page.run(`document.querySelector('.panel .primary').focus()`)
      await ui.key('Enter', 'Enter', 13)
      assert.equal(await ui.drilled(), 1)
    },
  },
  {
    name: '保存できないブラウザでも遊べる（記録は残らない）',
    setup: `Storage.prototype.getItem = () => { throw new Error('blocked') }; Storage.prototype.setItem = () => { throw new Error('blocked') };`,
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      await ui.drill(0)
      await ui.answer(correctLabel('flat'))
      assert.match(await ui.text('.clear'), /★★★/)
      await ui.press('断面を見る')
      await ui.press('←一覧')
      assert.match(await ui.text('.menu header .muted'), /★ 3 \/ 60/)
      await ui.open()
      assert.match(await ui.text('.menu header .muted'), /★ 0 \/ 60/)
    },
  },
  {
    name: '公開版の CSP: 通信は拒否し、すべて同じ場所から読む',
    async run(ui) {
      await ui.open()
      const csp = await ui.page.run<string>(`return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ''`)
      assert.match(csp, /connect-src 'none'/)
      const files = await ui.page.run<string[]>(`return performance.getEntriesByType('resource').map(e => e.name)`)
      assert.ok(files.every((f) => f.startsWith(BASE)), `別の場所から読んでいる: ${files.join(', ')}`)
      const blocked = await ui.page.run<boolean>(`try { await fetch('${BASE}'); return false } catch { return true }`)
      assert.ok(blocked, 'fetch が通ってしまう')
      assert.deepEqual(await ui.page.run(`return window.__csp`), [`connect-src ${BASE}`])
    },
  },
]

let server: ChildProcess | null = null

async function startServer() {
  // vite の preview で dist-e2e を配信する（npx を介さず、どの OS でも同じ起動のしかたにする）
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return
    await sleep(100)
  }
  await stopServer()
  throw new Error('テスト用のサーバーが起動しませんでした')
}

async function stopServer() {
  if (!server) return
  const s = server
  server = null
  const exited = new Promise((r) => s.once('exit', r))
  s.kill()
  await exited
}

async function main() {
  const only = process.argv[2]
  await startServer()
  const browser = await Browser.launch(9355)
  let failed = 0
  try {
    for (const s of scenarios.filter((s) => !only || s.name.includes(only))) {
      const viewport = s.viewport ?? DESKTOP
      const page = await browser.newPage(viewport)
      await page.send('Page.bringToFront')
      // ページの中で起きた CSP 違反とエラーを記録しておく（意図して起こすもの以外は起きないはず）
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__csp = []; window.__errors = [];
          document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
          addEventListener('error', e => window.__errors.push(String(e.message)));
          ${s.setup ?? ''}`,
      })
      const ui = new Ui(page, viewport.touch ? 'touch' : 'mouse')
      const t0 = Date.now()
      try {
        await s.run(ui)
        if (!s.name.startsWith('公開版の CSP')) assert.deepEqual(await page.run(`return window.__csp`), [], 'CSP 違反が起きた')
        assert.deepEqual(await page.run(`return window.__errors`), [], 'ページでエラーが起きた')
        console.log(`  ✓ ${s.name}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`)
      } catch (e) {
        failed++
        console.log(`  ✗ ${s.name}\n      ${e instanceof Error ? e.message : String(e)}`)
        mkdirSync(FAILURES, { recursive: true })
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => ({ data: '' }))
        if (data) writeFileSync(join(FAILURES, `${scenarios.indexOf(s) + 1}.png`), Buffer.from(data, 'base64'))
      } finally {
        await page.send('Page.close').catch(() => {})
      }
    }
  } finally {
    await browser.close()
    await stopServer()
  }
  if (failed > 0) {
    console.log(`\n${failed} 件失敗しました（失敗時の画面: ${FAILURES}/）`)
    process.exit(1)
  }
  console.log('\ne2e OK')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
